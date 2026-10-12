import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { THEME_KEYS, totalDurationFrames, type ThemeKey } from '@memorialvideo/contracts';
import {
  evaluateOutputQc,
  opaquePosterOutputKey,
  opaqueRenderOutputKey,
  planJobCompletion,
  planPosterAttachment,
  RENDER_OUTPUT_BUCKET,
} from '@memorialvideo/domain';

import { extractPosterFromLocalClip } from './extract-poster';
import { materializeQueuedTimeline } from '../src/materialize-timeline';
import { probeOutput } from '../src/qc';
import { bundleVideoEntry, renderTimelineToFile } from '../src/render-timeline';
import { parseSnapshotFile } from '../src/snapshot-render';
import { createThemeGoldenTimeline, createWorkerSmokeTimeline } from '../src/timelines';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.resolve(root, '../../artifacts/renders');
const VARIANT_BUCKET = 'project-variants';
const ORIGINAL_BUCKET = 'project-originals';

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return flag?.slice(name.length + 1);
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

type ThemeRenderResult = {
  theme: ThemeKey;
  output: string;
  ready: boolean;
  measuredWidth?: number;
  measuredHeight?: number;
  durationSeconds?: number;
  videoCodec?: string;
  audioCodec?: string;
  sizeBytes: number;
  qcFailures: string[];
};

async function renderThemeBatch(input: {
  mode: 'smoke' | 'golden';
  themes: ThemeKey[];
  watermark: boolean;
}): Promise<ThemeRenderResult[]> {
  const entryPoint = path.join(root, 'src/index.ts');
  const serveUrl = await bundleVideoEntry(entryPoint);
  const results: ThemeRenderResult[] = [];
  for (const theme of input.themes) {
    const timeline =
      input.mode === 'golden'
        ? createThemeGoldenTimeline(theme, input.watermark)
        : createWorkerSmokeTimeline(input.watermark, theme);
    const output = path.join(
      artifacts,
      input.mode === 'golden' ? `golden-${theme}.mp4` : `worker-smoke-${theme}.mp4`,
    );
    process.stdout.write(`theme-render start theme=${theme} mode=${input.mode}\n`);
    await renderTimelineToFile({
      entryPoint,
      serveUrl,
      timeline,
      kind: 'preview',
      output,
      onProgressPercent: (percent) => {
        process.stdout.write(`theme-render progress theme=${theme} ${percent}%\n`);
      },
    });
    const probe = await probeOutput(output, {
      width: timeline.width,
      height: timeline.height,
    });
    const info = await stat(output);
    const qc = evaluateOutputQc({
      expectedDurationSeconds: totalDurationFrames(timeline) / timeline.fps,
      requireAudio: true,
      expectedWidth: timeline.width,
      expectedHeight: timeline.height,
      probe: {
        exists: info.isFile(),
        sizeBytes: info.size,
        width: probe.width,
        height: probe.height,
        durationSeconds: probe.durationInSeconds,
        hasVideo: Boolean(probe.width),
        hasAudio: probe.hasAudio,
        container: probe.container,
      },
    });
    results.push({
      theme,
      output,
      ready: qc.ready,
      measuredWidth: probe.width,
      measuredHeight: probe.height,
      durationSeconds: probe.durationInSeconds,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      sizeBytes: info.size,
      qcFailures: qc.failures,
    });
    process.stdout.write(
      `theme-render done theme=${theme} ready=${qc.ready} ${probe.width}x${probe.height} ${probe.durationInSeconds}s\n`,
    );
  }
  return results;
}

async function main(): Promise<void> {
  if (
    process.argv.includes('--smoke') ||
    process.argv.includes('--themes') ||
    process.argv.includes('--golden-themes')
  ) {
    const golden = process.argv.includes('--golden-themes');
    const themes: ThemeKey[] =
      process.argv.includes('--themes') || golden
        ? [...THEME_KEYS]
        : [((argValue('--theme') as ThemeKey | undefined) ?? 'timeless')];
    const results = await renderThemeBatch({
      mode: golden ? 'golden' : 'smoke',
      themes,
      watermark: true,
    });
    process.stdout.write(
      `${JSON.stringify({ mode: golden ? 'golden' : 'smoke', results }, null, 2)}\n`,
    );
    process.exitCode = results.every((item) => item.ready) ? 0 : 1;
    return;
  }

  const specPath = argValue('--spec');
  if (specPath) {
    const spec = parseSnapshotFile(await readFile(specPath, 'utf8'));
    const output = path.join(artifacts, `queued-${spec.kind}.mp4`);
    await renderTimelineToFile({
      entryPoint: path.join(root, 'src/index.ts'),
      timeline: spec.timeline,
      kind: spec.kind,
      output,
    });
    const probe = await probeOutput(output, {
      width: spec.timeline.width,
      height: spec.timeline.height,
    });
    const info = await stat(output);
    const qc = evaluateOutputQc({
      expectedDurationSeconds: totalDurationFrames(spec.timeline) / spec.timeline.fps,
      requireAudio: true,
      expectedWidth: spec.timeline.width,
      expectedHeight: spec.timeline.height,
      probe: {
        exists: info.isFile(),
        sizeBytes: info.size,
        width: probe.width,
        height: probe.height,
        durationSeconds: probe.durationInSeconds,
        hasVideo: Boolean(probe.width),
        hasAudio: probe.hasAudio,
        container: probe.container,
      },
    });
    process.stdout.write(`${JSON.stringify({ mode: 'spec', output, qc }, null, 2)}\n`);
    process.exitCode = qc.ready ? 0 : 1;
    return;
  }

  await loadRepoEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || process.env.APP_ENV === 'production') {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: 'no_local_queue' })}\n`);
    return;
  }

  const listed = await rest(
    supabaseUrl,
    serviceKey,
    'GET',
    '/render_jobs?status=eq.QUEUED&select=id,status,queued_at,kind,attempt_count,project_id,snapshot_id&order=queued_at.asc&limit=1',
  );
  const jobs = JSON.parse(listed.body) as Array<{
    id: string;
    kind: 'preview' | 'final' | 'fallback';
    attempt_count: number;
    project_id: string;
    snapshot_id: string;
  }>;
  const job = jobs[0];
  if (!job) {
    process.stdout.write(`${JSON.stringify({ empty: true })}\n`);
    return;
  }
  const claimed = await rest(
    supabaseUrl,
    serviceKey,
    'PATCH',
    `/render_jobs?id=eq.${job.id}&status=eq.QUEUED`,
    {
      status: 'PREPARING',
      last_heartbeat_at: new Date().toISOString(),
    },
  );
  const claimedRows = JSON.parse(claimed.body || '[]') as unknown[];
  if (!Array.isArray(claimedRows) || claimedRows.length === 0) {
    process.stdout.write(`${JSON.stringify({ empty: true, reason: 'claim_missed' })}\n`);
    return;
  }
  const snapshot = await rest(
    supabaseUrl,
    serviceKey,
    'GET',
    `/render_snapshots?id=eq.${job.snapshot_id}&select=render_spec`,
  );
  const rows = JSON.parse(snapshot.body) as Array<{ render_spec: unknown }>;
  const spec = parseSnapshotFile(JSON.stringify(rows[0]?.render_spec ?? {}));
  const output = path.join(artifacts, `job-${job.id}.mp4`);
  try {
    spec.timeline = await materializeQueuedTimeline(
      spec.timeline,
      async (key, bucket) =>
        downloadObject(supabaseUrl, serviceKey, bucket === 'project-originals' ? ORIGINAL_BUCKET : VARIANT_BUCKET, key),
      async (bytes, relativePath) => {
        const destination = path.join(root, 'public', relativePath);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      },
    );
  } catch {
    await rest(supabaseUrl, serviceKey, 'PATCH', `/render_jobs?id=eq.${job.id}`, {
      status: 'FAILED_RETRYABLE',
      attempt_count: job.attempt_count + 1,
      error_code: 'variant_missing',
      last_heartbeat_at: new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify({ jobId: job.id, status: 'FAILED_RETRYABLE' })}\n`);
    process.exitCode = 0;
    return;
  }
  await rest(supabaseUrl, serviceKey, 'PATCH', `/render_jobs?id=eq.${job.id}`, {
    status: 'RENDERING',
    last_heartbeat_at: new Date().toISOString(),
  });
  try {
    await renderTimelineToFile({
      entryPoint: path.join(root, 'src/index.ts'),
      timeline: spec.timeline,
      kind: job.kind,
      output,
    });
  } catch {
    await rest(supabaseUrl, serviceKey, 'PATCH', `/render_jobs?id=eq.${job.id}`, {
      status: 'FAILED_RETRYABLE',
      attempt_count: job.attempt_count + 1,
      error_code: 'render_failed',
      last_heartbeat_at: new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify({ jobId: job.id, status: 'FAILED_RETRYABLE' })}\n`);
    process.exitCode = 0;
    return;
  }
  const probe = await probeOutput(output, {
    width: spec.timeline.width,
    height: spec.timeline.height,
  });
  const info = await stat(output);
  const qc = evaluateOutputQc({
    expectedDurationSeconds: totalDurationFrames(spec.timeline) / spec.timeline.fps,
    requireAudio: true,
    expectedWidth: spec.timeline.width,
    expectedHeight: spec.timeline.height,
    probe: {
      exists: info.isFile(),
      sizeBytes: info.size,
      width: probe.width,
      height: probe.height,
      durationSeconds: probe.durationInSeconds,
      hasVideo: Boolean(probe.width),
      hasAudio: probe.hasAudio,
      container: probe.container,
    },
  });
  const plan = planJobCompletion({
    kind: job.kind,
    status: 'RENDERING',
    qcReady: qc.ready,
    attemptCount: job.attempt_count,
  });
  const storageKey = opaqueRenderOutputKey(job.project_id, job.id);
  if (plan.writeOutput) {
    const bytes = new Uint8Array(await readFile(output));
    await putObject(supabaseUrl, serviceKey, RENDER_OUTPUT_BUCKET, storageKey, bytes, 'video/mp4');
    await rest(supabaseUrl, serviceKey, 'POST', '/render_outputs', {
      render_job_id: job.id,
      output_type: job.kind === 'final' ? 'final' : 'preview',
      storage_bucket: RENDER_OUTPUT_BUCKET,
      storage_key: storageKey,
      mime: 'video/mp4',
      size_bytes: bytes.byteLength,
      verified_at: new Date().toISOString(),
    });
  }
  await rest(supabaseUrl, serviceKey, 'PATCH', `/render_jobs?id=eq.${job.id}`, {
    status: plan.jobStatus,
    attempt_count: plan.attemptCount,
    completed_at: plan.jobStatus === 'READY' ? new Date().toISOString() : null,
    error_code: plan.jobStatus === 'READY' ? null : 'qc_failed',
    last_heartbeat_at: new Date().toISOString(),
  });
  let posterAttached = false;
  if (plan.jobStatus === 'READY') {
    try {
      const posterOutput = path.resolve(artifacts, `../posters/job-${job.id}.jpg`);
      await extractPosterFromLocalClip(output, posterOutput);
      const posterBytes = new Uint8Array(await readFile(posterOutput));
      const posterKey = opaquePosterOutputKey(job.project_id, job.id);
      await putObject(supabaseUrl, serviceKey, RENDER_OUTPUT_BUCKET, posterKey, posterBytes, 'image/jpeg');
      await rest(supabaseUrl, serviceKey, 'POST', '/render_outputs', {
        render_job_id: job.id,
        output_type: 'poster',
        storage_bucket: RENDER_OUTPUT_BUCKET,
        storage_key: posterKey,
        mime: 'image/jpeg',
        size_bytes: posterBytes.byteLength,
        verified_at: new Date().toISOString(),
      });
      posterAttached = planPosterAttachment({ jobStatus: plan.jobStatus, extractOk: true }).attachPoster;
    } catch {
      planPosterAttachment({ jobStatus: plan.jobStatus, extractOk: false });
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      jobId: job.id,
      status: plan.jobStatus,
      qc,
      posterAttached,
      measuredWidth: probe.width,
      measuredHeight: probe.height,
      expectedWidth: spec.timeline.width,
      expectedHeight: spec.timeline.height,
    }, null, 2)}\n`,
  );
  process.exitCode = plan.jobStatus === 'READY' || plan.jobStatus === 'FAILED_RETRYABLE' ? 0 : 1;
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
      Prefer: method === 'POST' ? 'return=minimal,resolution=ignore-duplicates' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.text() };
}

await main();
