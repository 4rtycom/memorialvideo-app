import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  planDerivedStillCompletion,
  selectNextDerivedJob,
  type DerivedJobCandidate,
} from '@memorialvideo/domain';
import { buildPosterFromJpegBytes, SOURCE_BUCKET, VARIANT_BUCKET } from '@memorialvideo/media';

import { extractPosterFromLocalClip } from './extract-poster';

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

export async function extractIngestStill(input: string, output: string): Promise<void> {
  await extractPosterFromLocalClip(input, output);
}

async function main(): Promise<void> {
  await loadRepoEnv();
  const localIn = argValue('in');
  if (localIn) {
    const output =
      argValue('out') ??
      path.resolve(root, '../../artifacts/posters', `${path.basename(path.resolve(localIn), path.extname(localIn))}-ingest.jpg`);
    await extractIngestStill(localIn, output);
    process.stdout.write(`${JSON.stringify({ extracted: true, outputName: path.basename(output) }, null, 2)}\n`);
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    process.stdout.write(`${JSON.stringify({ claimed: false, reason: 'service_unconfigured' }, null, 2)}\n`);
    return;
  }

  const listed = await rest(supabaseUrl, serviceKey, 'GET', '/derived_asset_jobs?status=eq.QUEUED&select=id,status,queued_at&order=queued_at.asc');
  const jobs = (listed.status === 200 ? (JSON.parse(listed.body) as DerivedJobCandidate[]) : []);
  const jobId = selectNextDerivedJob(jobs);
  if (!jobId) {
    process.stdout.write(`${JSON.stringify({ claimed: false }, null, 2)}\n`);
    return;
  }

  const loaded = await rest(
    supabaseUrl,
    serviceKey,
    'GET',
    `/derived_asset_jobs?id=eq.${jobId}&select=id,project_id,asset_id,status,source_method,provider,provider_model,provider_version,attempt_count`,
  );
  const job = (JSON.parse(loaded.body) as Array<{
    id: string;
    project_id: string;
    asset_id: string;
    status: DerivedJobCandidate['status'];
    source_method: string;
    provider: string | null;
    provider_model: string | null;
    provider_version: string | null;
    attempt_count: number;
  }>)[0];
  if (!job) {
    process.stdout.write(`${JSON.stringify({ claimed: false }, null, 2)}\n`);
    return;
  }

  await rest(supabaseUrl, serviceKey, 'PATCH', `/derived_asset_jobs?id=eq.${job.id}`, {
    status: 'PREPARING',
    started_at: new Date().toISOString(),
  });

  const assetRow = await rest(
    supabaseUrl,
    serviceKey,
    'GET',
    `/assets?id=eq.${job.asset_id}&select=id,project_id,storage_bucket,storage_key`,
  );
  const asset = (JSON.parse(assetRow.body) as Array<{
    id: string;
    project_id: string;
    storage_bucket: string;
    storage_key: string;
  }>)[0];

  const workDir = path.resolve(root, '../../artifacts/derived', job.id);
  await mkdir(workDir, { recursive: true });
  const clipPath = path.join(workDir, 'source.mp4');
  const stillPath = path.join(workDir, 'still.jpg');
  let extractOk = false;
  try {
    const bytes = asset
      ? await downloadObject(supabaseUrl, serviceKey, asset.storage_bucket || SOURCE_BUCKET, asset.storage_key)
      : null;
    if (bytes) {
      await writeFile(clipPath, bytes);
      await extractIngestStill(clipPath, stillPath);
      const jpeg = new Uint8Array(await readFile(stillPath));
      const poster = buildPosterFromJpegBytes({
        projectId: job.project_id,
        assetId: job.asset_id,
        jpeg,
        provenance: {
          sourceMethod: job.source_method,
          provider: job.provider ?? 'remotion',
          providerModel: job.provider_model ?? 'renderStill',
          providerVersion: job.provider_version ?? '4.0.518',
        },
      });
      const plan = planDerivedStillCompletion({
        status: 'PREPARING',
        extractOk: true,
        attemptCount: job.attempt_count,
      });
      if (plan.attachPoster) {
        await putObject(supabaseUrl, serviceKey, VARIANT_BUCKET, poster.storageKey, poster.bytes, poster.mime);
        await rest(
          supabaseUrl,
          serviceKey,
          'POST',
          '/asset_variants?on_conflict=asset_id,variant_type,processing_version',
          {
            asset_id: job.asset_id,
            variant_type: poster.variantType,
            processing_version: poster.processingVersion,
            storage_bucket: poster.storageBucket,
            storage_key: poster.storageKey,
            mime: poster.mime,
            width: poster.width,
            height: poster.height,
            size_bytes: poster.sizeBytes,
            checksum: poster.checksum,
            source_method: poster.provenance?.sourceMethod ?? job.source_method,
            provider: poster.provenance?.provider ?? job.provider,
            provider_model: poster.provenance?.providerModel ?? job.provider_model,
            provider_version: poster.provenance?.providerVersion ?? job.provider_version,
          },
        );
      }
      await rest(supabaseUrl, serviceKey, 'PATCH', `/derived_asset_jobs?id=eq.${job.id}`, {
        status: plan.status,
        attempt_count: plan.attemptCount,
        completed_at: new Date().toISOString(),
        error_code: null,
      });
      extractOk = true;
      process.stdout.write(
        `${JSON.stringify({ claimed: true, jobId: job.id, status: plan.status, attached: plan.attachPoster }, null, 2)}\n`,
      );
    }
  } catch {
    extractOk = false;
  }

  if (!extractOk) {
    const plan = planDerivedStillCompletion({
      status: 'PREPARING',
      extractOk: false,
      attemptCount: job.attempt_count,
    });
    await rest(supabaseUrl, serviceKey, 'PATCH', `/derived_asset_jobs?id=eq.${job.id}`, {
      status: plan.status,
      attempt_count: plan.attemptCount,
      error_code: 'poster_extract_failed',
      completed_at: plan.status === 'FAILED_FINAL' ? new Date().toISOString() : null,
    });
    process.stdout.write(
      `${JSON.stringify({ claimed: true, jobId: job.id, status: plan.status, attached: false }, null, 2)}\n`,
    );
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

async function putObject(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: Buffer.from(bytes),
  });
}

async function rest(
  supabaseUrl: string,
  serviceKey: string,
  method: string,
  pathName: string,
  body?: unknown,
): Promise<{ status: number; body: string }> {
  const response = await fetch(`${supabaseUrl}/rest/v1${pathName}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.text() };
}

if (process.argv[1]?.includes('run-derived-still')) {
  void main();
}
