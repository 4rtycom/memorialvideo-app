import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ENHANCEMENT_LOCAL_ENGINE,
  ENHANCEMENT_MODEL_PROVIDER,
  enhancementConsentSchema,
  enhancementRequestSchema,
  type EnhancementJobStatus,
} from '@memorialvideo/contracts';
import {
  enhancementProcessingAllowed,
  planEnhancementClaim,
  planEnhancementCompletion,
  selectNextEnhancementJob,
  type EnhancementJobRow,
} from '@memorialvideo/domain';
import {
  SOURCE_BUCKET,
  VARIANT_BUCKET,
  applyEnhancementPipeline,
  decodeRaster,
  encodeEnhancedJpeg,
  enhancementStorageLabel,
  opaqueVariantKey,
  validateEnhancedOutput,
} from '@memorialvideo/media';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '../..');

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

async function loadRepoEnv(): Promise<void> {
  try {
    const text = await readFile(path.resolve(repoRoot, '.env.local'), 'utf8');
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

function serviceHeaders(): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('missing_service_role');
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function restUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!base) {
    throw new Error('missing_supabase_url');
  }
  return `${base.replace(/\/$/, '')}/rest/v1/${pathname}`;
}

async function rest<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(restUrl(pathname), {
    ...init,
    headers: { ...serviceHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`rest_${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function downloadOriginal(bucket: string, key: string): Promise<Uint8Array> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const response = await fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) {
    throw new Error('download_failed');
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function uploadVariant(bucket: string, key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const response = await fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(),
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: Buffer.from(bytes),
  });
  if (!response.ok) {
    throw new Error('upload_failed');
  }
}

function newPublicId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

async function failJob(jobId: string, status: 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'CANCELLED', errorCode: string) {
  await rest(`enhancement_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      error_code: errorCode,
      completed_at: new Date().toISOString(),
    }),
  });
}

async function main(): Promise<void> {
  await loadRepoEnv();
  const localIn = argValue('in');

  if (localIn) {
    const bytes = new Uint8Array(await readFile(path.resolve(localIn)));
    const decoded = decodeRaster(bytes);
    const { buildPresetOperations } = await import('@memorialvideo/domain');
    const operations = buildPresetOperations('gentle_correction');
    const pipeline = applyEnhancementPipeline(decoded, operations);
    const encoded = encodeEnhancedJpeg(pipeline.image, 'preview');
    const report = validateEnhancedOutput({
      bytes: encoded,
      expectedWidth: pipeline.image.width,
      expectedHeight: pipeline.image.height,
    });
    writeSafe({
      local: true,
      decodeOk: report.decodeOk,
      width: report.width ?? pipeline.image.width,
      height: report.height ?? pipeline.image.height,
      appliedCount: pipeline.applied.length,
      skippedCount: pipeline.skipped.length,
      implementationLabel: 'deterministic_correction',
      modelAvailable: ENHANCEMENT_MODEL_PROVIDER.available,
      engine: ENHANCEMENT_LOCAL_ENGINE.name,
      version: ENHANCEMENT_LOCAL_ENGINE.version,
      failAsset: false,
    });
    return;
  }

  const rows = await rest<
    Array<{
      id: string;
      project_id: string;
      asset_id: string;
      request_id: string;
      status: EnhancementJobStatus;
      idempotency_key: string;
      attempt_count: number;
      queued_at: string;
    }>
  >('enhancement_jobs?status=in.(QUEUED,FAILED_RETRYABLE)&order=queued_at.asc&limit=20');

  const selected = selectNextEnhancementJob(
    rows.map(
      (row): EnhancementJobRow => ({
        id: row.id,
        projectId: row.project_id,
        assetId: row.asset_id,
        requestId: row.request_id,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        attemptCount: row.attempt_count,
        queuedAt: row.queued_at,
      }),
    ),
  );
  if (!selected) {
    writeSafe({ claimed: false });
    return;
  }

  const claim = planEnhancementClaim(selected);
  if (!claim.ok) {
    if (claim.reason === 'retry_exhausted') {
      await failJob(selected.id, 'FAILED_FINAL', 'retry_exhausted');
    }
    writeSafe({ claimed: false, reason: claim.reason });
    return;
  }

  const claimed = await rest<Array<{ id: string }>>(
    `enhancement_jobs?id=eq.${selected.id}&status=in.(QUEUED,FAILED_RETRYABLE)`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'PREPARING',
        attempt_count: claim.attemptCount,
        started_at: new Date().toISOString(),
        error_code: null,
      }),
    },
  );
  if (!claimed.length) {
    writeSafe({ claimed: false, reason: 'lost_race' });
    return;
  }

  const projects = await rest<Array<{ id: string; public_id: string }>>(
    `projects?id=eq.${selected.projectId}&select=id,public_id`,
  );
  const project = projects[0];
  if (!project) {
    await failJob(selected.id, 'FAILED_FINAL', 'project_missing');
    writeSafe({ claimed: true, status: 'FAILED_FINAL', failAsset: false });
    return;
  }

  const consents = await rest<Array<Record<string, unknown>>>(
    `enhancement_consents?project_id=eq.${selected.projectId}&select=*`,
  );
  const consentRow = consents[0];
  const consent = consentRow
    ? enhancementConsentSchema.parse({
        schemaVersion: 1,
        tributePublicId: project.public_id,
        state: consentRow.state,
        localApproved: consentRow.local_approved,
        externalApproved: consentRow.external_approved,
        externalProvider: consentRow.external_provider ?? undefined,
        policyVersion: consentRow.policy_version ?? 'media-enhancement-v1',
        version: consentRow.version ?? 0,
      })
    : null;

  if (!enhancementProcessingAllowed(consent)) {
    await failJob(selected.id, 'CANCELLED', 'consent_revoked');
    await rest(`enhancement_requests?id=eq.${selected.requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    });
    writeSafe({ claimed: true, status: 'CANCELLED', reason: 'consent_revoked', failAsset: false });
    return;
  }

  const requests = await rest<Array<{ id: string; public_id: string; payload: unknown; quality_mode: string }>>(
    `enhancement_requests?id=eq.${selected.requestId}&select=id,public_id,payload,quality_mode`,
  );
  const requestRow = requests[0];
  if (!requestRow) {
    await failJob(selected.id, 'FAILED_FINAL', 'request_missing');
    writeSafe({ claimed: true, status: 'FAILED_FINAL', failAsset: false });
    return;
  }

  const request = enhancementRequestSchema.parse(requestRow.payload);
  const qualityMode = request.qualityMode === 'full' ? 'full' : 'preview';

  const assets = await rest<
    Array<{
      id: string;
      storage_bucket: string;
      storage_key: string;
      asset_type: string;
      deleted_at: string | null;
      sha256: string | null;
    }>
  >(`assets?id=eq.${selected.assetId}&select=id,storage_bucket,storage_key,asset_type,deleted_at,sha256`);
  const asset = assets[0];
  if (!asset || asset.deleted_at) {
    await failJob(selected.id, 'FAILED_FINAL', 'asset_missing');
    writeSafe({ claimed: true, status: 'FAILED_FINAL', failAsset: false });
    return;
  }
  if (asset.asset_type !== 'image') {
    await failJob(selected.id, 'FAILED_FINAL', 'unsupported_asset');
    await rest(`enhancement_requests?id=eq.${selected.requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed' }),
    });
    writeSafe({ claimed: true, status: 'FAILED_FINAL', failAsset: false });
    return;
  }

  try {
    await rest(`enhancement_requests?id=eq.${selected.requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'processing' }),
    });

    const bytes = await downloadOriginal(asset.storage_bucket || SOURCE_BUCKET, asset.storage_key);
    const decoded = decodeRaster(bytes);
    const pipeline = applyEnhancementPipeline(decoded, request.operations);
    const encoded = encodeEnhancedJpeg(pipeline.image, qualityMode);
    const technicalReport = validateEnhancedOutput({
      bytes: encoded,
      expectedWidth: pipeline.image.width,
      expectedHeight: pipeline.image.height,
    });

    const variantPublicId = newPublicId('ev');
    const storageKey = opaqueVariantKey(
      selected.projectId,
      selected.assetId,
      enhancementStorageLabel(variantPublicId),
    );

    const completion = planEnhancementCompletion({
      tributePublicId: project.public_id,
      assetId: selected.assetId,
      requestId: requestRow.public_id,
      variantId: variantPublicId,
      applied: pipeline.applied,
      skipped: pipeline.skipped,
      storageBucket: VARIANT_BUCKET,
      storageKey,
      width: pipeline.image.width,
      height: pipeline.image.height,
      mime: 'image/jpeg',
      sizeBytes: encoded.byteLength,
      sourceChecksumRef: asset.sha256 ? asset.sha256.slice(0, 32) : undefined,
      technicalReport,
      createdAt: new Date().toISOString(),
    });

    if (completion.status !== 'FAILED_FINAL') {
      await uploadVariant(VARIANT_BUCKET, storageKey, encoded, 'image/jpeg');
    }

    await rest('enhancement_variants', {
      method: 'POST',
      body: JSON.stringify({
        public_id: variantPublicId,
        project_id: selected.projectId,
        asset_id: selected.assetId,
        request_id: selected.requestId,
        status: completion.variant.status,
        storage_bucket: completion.status === 'FAILED_FINAL' ? null : VARIANT_BUCKET,
        storage_key: completion.status === 'FAILED_FINAL' ? null : storageKey,
        width: completion.variant.width ?? null,
        height: completion.variant.height ?? null,
        mime: completion.variant.mime ?? null,
        size_bytes: completion.variant.sizeBytes ?? null,
        family_review_state: 'unreviewed',
        approved_for_library: false,
        approved_for_film: false,
        generative_alteration: completion.variant.generativeAlteration,
        may_synthesise_detail: completion.variant.maySynthesiseDetail,
        implementation_label: completion.variant.implementationLabel,
        payload: {
          ...completion.variant,
          requestId: requestRow.public_id,
          skipped: pipeline.skipped,
        },
      }),
    });

    const requestStatus =
      completion.status === 'READY' ? 'ready' : completion.status === 'PARTIAL' ? 'partial' : 'failed';
    await rest(`enhancement_requests?id=eq.${selected.requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: requestStatus }),
    });

    await rest(`enhancement_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: completion.status === 'FAILED_FINAL' ? 'FAILED_FINAL' : 'READY',
        error_code: completion.status === 'FAILED_FINAL' ? 'enhancement_failed' : null,
        completed_at: new Date().toISOString(),
      }),
    });

    writeSafe({
      claimed: true,
      status: completion.status === 'FAILED_FINAL' ? 'FAILED_FINAL' : 'READY',
      variantStatus: completion.variant.status,
      appliedCount: pipeline.applied.length,
      skippedCount: pipeline.skipped.length,
      implementationLabel: completion.variant.implementationLabel,
      modelAvailable: false,
      failAsset: false,
    });
  } catch {
    const retryable = claim.attemptCount < 3;
    await failJob(selected.id, retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL', 'processing_error');
    await rest(`enhancement_requests?id=eq.${selected.requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed' }),
    });
    writeSafe({
      claimed: true,
      status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
      failAsset: false,
    });
  }
}

main().catch((error) => {
  writeSafe({ claimed: false, error: error instanceof Error ? error.message : 'unknown' });
  process.exitCode = 1;
});
