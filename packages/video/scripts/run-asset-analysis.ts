import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANALYSER_VERSION, assetAnalysisSchema, type AnalysisJobStatus } from '@memorialvideo/contracts';
import {
  buildDuplicateRefs,
  canonicalizeDuplicatePair,
  LOCAL_ANALYSER_PROVENANCE,
  normalizeAnalysisJobRow,
  planAnalysisCompletion,
  selectNextAnalysisJob,
} from '@memorialvideo/domain';
import {
  inspectStoredMedia,
  isLikelyDuplicate,
  LIKELY_DUPLICATE_THRESHOLD,
  likelyDuplicateScore,
  SOURCE_BUCKET,
} from '@memorialvideo/media';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

async function loadRepoEnv(): Promise<void> {
  try {
    const text = await readFile(path.resolve(root, '../../.env.local'), 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq < 1) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

function writeSafe(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function inspectLocalFile(inputPath: string): Promise<void> {
  const bytes = new Uint8Array(await readFile(path.resolve(inputPath)));
  const inspection = await inspectStoredMedia(bytes);
  writeSafe({
    inspected: true,
    mediaKind: inspection.media.mediaKind,
    width: 'width' in inspection.media ? inspection.media.width : undefined,
    height: 'height' in inspection.media ? inspection.media.height : undefined,
    durationMs: 'durationMs' in inspection.media ? inspection.media.durationMs : undefined,
    qualityCodes: inspection.quality.map((item) => item.code),
    candidateKinds: inspection.candidates.map((item) => item.kind),
    partial: inspection.partial,
    confidence: inspection.confidence,
  });
}

async function main(): Promise<void> {
  await loadRepoEnv();
  const localIn = argValue('in');
  if (localIn) {
    await inspectLocalFile(localIn);
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    writeSafe({ claimed: false, reason: 'service_unconfigured' });
    return;
  }

  const listed = await rest(
    supabaseUrl,
    serviceKey,
    'GET',
    '/asset_analysis_jobs?status=in.(QUEUED,FAILED_RETRYABLE)&select=id,status,queued_at&order=queued_at.asc',
  );
  const jobs =
    listed.status === 200
      ? (JSON.parse(listed.body) as Array<{ id: string; status: AnalysisJobStatus; queued_at: string }>).map(
          normalizeAnalysisJobRow,
        )
      : [];
  const jobId = selectNextAnalysisJob(jobs);
  if (!jobId) {
    writeSafe({ claimed: false });
    return;
  }

  const claimed = await rest(
    supabaseUrl,
    serviceKey,
    'PATCH',
    `/asset_analysis_jobs?id=eq.${jobId}&status=in.(QUEUED,FAILED_RETRYABLE)`,
    { status: 'PREPARING', started_at: new Date().toISOString() },
  );
  const claimedRows = claimed.status < 300 ? (JSON.parse(claimed.body || '[]') as Array<{ id: string }>) : [];
  if (!claimedRows.length) {
    writeSafe({ claimed: false, reason: 'already_claimed' });
    return;
  }

  const loaded = await rest(
    supabaseUrl,
    serviceKey,
    'GET',
    `/asset_analysis_jobs?id=eq.${jobId}&select=id,project_id,asset_id,analysis_id,status,attempt_count`,
  );
  const job = (JSON.parse(loaded.body) as Array<{
    id: string;
    project_id: string;
    asset_id: string;
    analysis_id: string | null;
    status: AnalysisJobStatus;
    attempt_count: number;
  }>)[0];
  if (!job) {
    writeSafe({ claimed: false });
    return;
  }

  if (job.analysis_id) {
    await rest(supabaseUrl, serviceKey, 'PATCH', `/asset_analyses?id=eq.${job.analysis_id}`, {
      status: 'processing',
    });
  }

  const assetRow = await rest(
    supabaseUrl,
    serviceKey,
    'GET',
    `/assets?id=eq.${job.asset_id}&select=id,project_id,storage_bucket,storage_key,status,sha256,perceptual_hash`,
  );
  const asset = (JSON.parse(assetRow.body) as Array<{
    id: string;
    project_id: string;
    storage_bucket: string;
    storage_key: string;
    status: string;
    sha256: string | null;
    perceptual_hash: string | null;
  }>)[0];

  const workDir = path.resolve(root, '../../artifacts/analysis', job.id);
  await mkdir(workDir, { recursive: true });
  try {
    const bytes = asset
      ? await downloadObject(supabaseUrl, serviceKey, asset.storage_bucket || SOURCE_BUCKET, asset.storage_key)
      : null;
    if (!bytes) {
      throw new Error('missing_object');
    }
    await writeFile(path.join(workDir, 'source.bin'), bytes);
    const inspection = await inspectStoredMedia(bytes);
    const siblings = await rest(
      supabaseUrl,
      serviceKey,
      'GET',
      `/assets?project_id=eq.${job.project_id}&id=neq.${job.asset_id}&deleted_at=is.null&select=id,sha256,perceptual_hash`,
    );
    const existing = (
      siblings.status === 200
        ? (JSON.parse(siblings.body) as Array<{ id: string; sha256: string | null; perceptual_hash: string | null }>)
        : []
    ).filter((row) => row.id !== job.asset_id);
    const exactIds = existing.filter((row) => row.sha256 && row.sha256 === inspection.checksum).map((row) => row.id);
    const likelyIds = inspection.perceptualHash
      ? existing
          .filter(
            (row) =>
              row.perceptual_hash &&
              !exactIds.includes(row.id) &&
              isLikelyDuplicate(inspection.perceptualHash as string, row.perceptual_hash),
          )
          .map((row) => ({
            id: row.id,
            score: likelyDuplicateScore(inspection.perceptualHash as string, row.perceptual_hash as string),
          }))
      : [];
    const duplicates = buildDuplicateRefs({
      assetId: job.asset_id,
      exactIds,
      likelyIds,
      likelyThreshold: LIKELY_DUPLICATE_THRESHOLD,
    });
    const plan = planAnalysisCompletion({
      status: 'PREPARING',
      inspectOk: true,
      partial: inspection.partial,
      attemptCount: job.attempt_count,
    });
    const analysisId = job.analysis_id ?? job.id;
    const report = assetAnalysisSchema.parse({
      schemaVersion: 1,
      analysisId,
      assetId: job.asset_id,
      pipelineStatus: plan.pipelineStatus,
      analysedAt: new Date().toISOString(),
      sourceChecksum: inspection.checksum,
      media: inspection.media,
      candidates: inspection.candidates,
      quality: inspection.quality,
      duplicates,
      warnings: inspection.warnings,
      errorCode: inspection.errorCode,
      confidence: inspection.confidence,
      correctionState: 'unreviewed',
      provenance: LOCAL_ANALYSER_PROVENANCE,
    });
    if (job.analysis_id) {
      await rest(supabaseUrl, serviceKey, 'PATCH', `/asset_analyses?id=eq.${job.analysis_id}`, {
        status: plan.pipelineStatus,
        media_kind: inspection.media.mediaKind,
        report,
        confidence: inspection.confidence,
        error_code: inspection.errorCode ?? null,
        analysed_at: report.analysedAt,
        analyser_version: ANALYSER_VERSION,
        source_checksum: inspection.checksum,
      });
    } else {
      await rest(supabaseUrl, serviceKey, 'POST', '/asset_analyses', {
        project_id: job.project_id,
        asset_id: job.asset_id,
        schema_version: 1,
        analyser_version: ANALYSER_VERSION,
        source_checksum: inspection.checksum,
        status: plan.pipelineStatus,
        media_kind: inspection.media.mediaKind,
        report,
        confidence: inspection.confidence,
        error_code: inspection.errorCode ?? null,
        analysed_at: report.analysedAt,
      });
    }
    for (const ref of duplicates) {
      const pair = canonicalizeDuplicatePair(job.asset_id, ref.otherAssetId);
      if (!pair) {
        continue;
      }
      await rest(
        supabaseUrl,
        serviceKey,
        'POST',
        '/asset_duplicate_links?on_conflict=asset_id_low,asset_id_high,kind,method',
        {
          project_id: job.project_id,
          asset_id_low: pair[0],
          asset_id_high: pair[1],
          kind: ref.kind,
          method: ref.method,
          score: ref.score ?? null,
          threshold: ref.threshold ?? null,
          review_state: 'unreviewed',
        },
        'return=minimal,resolution=merge-duplicates',
      );
    }
    if (inspection.perceptualHash) {
      await rest(supabaseUrl, serviceKey, 'PATCH', `/assets?id=eq.${job.asset_id}`, {
        perceptual_hash: inspection.perceptualHash,
      });
    }
    await rest(supabaseUrl, serviceKey, 'PATCH', `/asset_analysis_jobs?id=eq.${job.id}`, {
      status: plan.jobStatus,
      attempt_count: plan.attemptCount,
      completed_at: new Date().toISOString(),
      error_code: null,
    });
    writeSafe({
      claimed: true,
      jobId: job.id,
      status: plan.pipelineStatus,
      failAsset: plan.failAsset,
      mediaKind: inspection.media.mediaKind,
    });
  } catch {
    const plan = planAnalysisCompletion({
      status: 'PREPARING',
      inspectOk: false,
      partial: false,
      attemptCount: job.attempt_count,
    });
    await rest(supabaseUrl, serviceKey, 'PATCH', `/asset_analysis_jobs?id=eq.${job.id}`, {
      status: plan.jobStatus,
      attempt_count: plan.attemptCount,
      error_code: 'analysis_failed',
      completed_at: plan.jobStatus === 'FAILED_FINAL' ? new Date().toISOString() : null,
    });
    if (job.analysis_id) {
      await rest(supabaseUrl, serviceKey, 'PATCH', `/asset_analyses?id=eq.${job.analysis_id}`, {
        status: 'failed',
        error_code: 'analysis_failed',
      });
    }
    writeSafe({ claimed: true, jobId: job.id, status: plan.pipelineStatus, failAsset: false });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function downloadObject(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  key: string,
): Promise<Uint8Array | null> {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function rest(
  supabaseUrl: string,
  serviceKey: string,
  method: string,
  pathName: string,
  body?: unknown,
  prefer = 'return=representation',
): Promise<{ status: number; body: string }> {
  const response = await fetch(`${supabaseUrl}/rest/v1${pathName}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.text() };
}

if (process.argv[1]?.includes('run-asset-analysis')) {
  void main();
}
