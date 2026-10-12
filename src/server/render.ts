import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  canIssueSignedDownload,
  evaluateOutputQc,
  hashTimeline,
  planJobCompletion,
  planRenderEnqueue,
  selectNextQueuedJob,
  type OutputProbe,
} from '@memorialvideo/domain';
import { parseTimelineContract, totalDurationFrames } from '@memorialvideo/contracts';
import { encodeTimelineLocally, isLocalEncoderEnabled, probeWithFfprobe } from './local-encode';
import {
  activityEventSchema,
  entitlementView,
  getTribute,
  listTributes,
  replaceRenderJobs,
  type StoredRenderJob,
  type Tribute,
} from './store';

function opaqueJobId(): string {
  return `rjob_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function renderDir(): string {
  return path.join(process.cwd(), '.data', 'renders');
}

/** Deterministic seek for READY JPEG still — stay inside the clip; no Remotion/Chrome. */
export function readyPosterSeekSeconds(durationSeconds: number | undefined): number {
  if (!durationSeconds || !(durationSeconds > 0)) {
    return 0;
  }
  const target = Math.min(1, durationSeconds * 0.25);
  return Math.max(0, Math.min(target, Math.max(0, durationSeconds - 0.05)));
}

/**
 * Extract one JPEG beside a QC-verified MP4 via `ffmpeg -ss … -frames:v 1`.
 * Poster failure must never fail READY — returns ok:false for the caller to ignore.
 */
export async function extractReadyPosterStill(input: {
  jobId: string;
  outputPath: string | null;
  durationSeconds?: number;
}): Promise<{ ok: true; posterRelative: string } | { ok: false; reason: string }> {
  if (!input.outputPath || !input.outputPath.endsWith('.mp4')) {
    return { ok: false, reason: 'not_mp4' };
  }
  const absoluteMp4 = path.isAbsolute(input.outputPath)
    ? input.outputPath
    : path.join(process.cwd(), input.outputPath);
  try {
    await access(absoluteMp4);
  } catch {
    return { ok: false, reason: 'mp4_missing' };
  }

  await mkdir(renderDir(), { recursive: true });
  const posterRelative = path.join('.data', 'renders', `${input.jobId}.poster.jpg`);
  const absolutePoster = path.join(process.cwd(), posterRelative);
  const seek = readyPosterSeekSeconds(input.durationSeconds);

  const result = await new Promise<{ code: number }>((resolve) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-ss',
        seek.toFixed(3),
        '-i',
        absoluteMp4,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        absolutePoster,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code });
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(124);
    }, 30_000);
    child.on('error', () => {
      finish(127);
    });
    child.on('close', (code) => {
      finish(code ?? 1);
    });
  });

  if (result.code !== 0) {
    return { ok: false, reason: `ffmpeg_${result.code}` };
  }
  try {
    await access(absolutePoster);
  } catch {
    return { ok: false, reason: 'poster_missing' };
  }
  return { ok: true, posterRelative };
}

/**
 * Honest local probe — ffprobe fills media traits for real MP4s.
 * Marker/bin placeholders omit dimensions so Output QC fails.
 */
export async function probeLocalOutput(outputPath: string | null): Promise<OutputProbe> {
  if (!outputPath) {
    return { exists: false, sizeBytes: 0 };
  }
  const absolute = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
  try {
    await access(absolute);
    if (absolute.endsWith('.mp4') || absolute.endsWith('.m4v')) {
      return probeWithFfprobe(absolute);
    }
    const info = await stat(absolute);
    return {
      exists: info.size > 0,
      sizeBytes: info.size,
      container: info.size > 32 ? 'bin' : undefined,
    };
  } catch {
    return { exists: false, sizeBytes: 0 };
  }
}

export async function enqueueRenderJob(
  publicId: string,
  kind: 'preview' | 'final',
): Promise<
  | { ok: true; job: StoredRenderJob; reused: boolean }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'no_timeline'
        | 'entitlement_required'
        | 'final_quota'
        | 'preview_quota'
        | 'terminal_same_snapshot';
    }
> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, reason: 'not_found' };
  }
  if (!tribute.timeline) {
    return { ok: false, reason: 'no_timeline' };
  }
  const timeline = parseTimelineContract(tribute.timeline);
  const snapshotHash = hashTimeline(timeline);
  const entitlement = entitlementView(tribute);
  const plan = planRenderEnqueue({
    kind,
    snapshotHash,
    existing: tribute.renderJobs,
    entitlement: entitlement.active
      ? { maxFinalRenders: entitlement.maxFinalRenders, finalRendersUsed: tribute.finalRendersUsed }
      : null,
    previewUsed: tribute.renderJobs.filter((j) => j.kind === 'preview').length,
  });

  if (plan.action === 'deny') {
    return { ok: false, reason: plan.reason };
  }
  if (plan.action === 'reuse_ready' || plan.action === 'reuse_active') {
    const job = tribute.renderJobs.find((j) => j.id === plan.jobId)!;
    return { ok: true, job, reused: true };
  }

  const now = new Date().toISOString();
  let jobs = [...tribute.renderJobs];
  if (plan.action === 'retry_existing') {
    jobs = jobs.map((job) =>
      job.id === plan.jobId
        ? {
            ...job,
            status: 'QUEUED' as const,
            attemptCount: job.attemptCount + 1,
            updatedAt: now,
            lastHeartbeatAt: now,
            qcFailures: [],
            failureReason: null,
            outputVerified: false,
            posterPath: null,
          }
        : job,
    );
  } else {
    const job: StoredRenderJob = {
      id: opaqueJobId(),
      kind,
      status: 'QUEUED',
      snapshotHash,
      timelineVersion: tribute.timelineVersion,
      attemptCount: 0,
      queuedAt: now,
      updatedAt: now,
      lastHeartbeatAt: now,
      qcFailures: [],
      outputPath: null,
      posterPath: null,
      outputVerified: false,
      failureReason: null,
    };
    jobs = [job, ...jobs];
  }

  const next = await replaceRenderJobs(publicId, jobs, {
    activity: [
      activityEventSchema.parse({
        id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        code: 'render_enqueued',
        correlationId: snapshotHash.slice(0, 16),
        createdAt: now,
      }),
      ...tribute.activity,
    ].slice(0, 200),
  });
  if (!next) {
    return { ok: false, reason: 'not_found' };
  }
  const job = next.renderJobs[0]!;
  return { ok: true, job, reused: false };
}

/**
 * Advance one queued/active job. READY only after evaluateOutputQc passes on real output.
 * When local ffmpeg/Remotion is available, RENDERING writes a real H.264/AAC MP4.
 * Otherwise a marker is written and QC fails honestly.
 */
export async function advanceRenderOnce(publicId: string): Promise<{
  tribute: Tribute | null;
  advanced: StoredRenderJob | null;
  note: string;
}> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { tribute: null, advanced: null, note: 'not_found' };
  }
  const jobId = selectNextQueuedJob(tribute.renderJobs);
  const active =
    jobId != null
      ? tribute.renderJobs.find((j) => j.id === jobId)
      : tribute.renderJobs.find((j) =>
          ['PREPARING', 'RENDERING', 'VERIFYING'].includes(j.status),
        );
  if (!active) {
    return { tribute, advanced: null, note: 'idle' };
  }

  const now = new Date().toISOString();
  let working: StoredRenderJob = { ...active, lastHeartbeatAt: now, updatedAt: now };
  let encodeNote: string | null = null;

  if (working.status === 'QUEUED' || working.status === 'PREPARING' || working.status === 'RENDERING') {
    const planned = planJobCompletion({
      kind: working.kind,
      status: working.status === 'QUEUED' ? 'QUEUED' : working.status,
      qcReady: false,
      attemptCount: working.attemptCount,
    });
    if (working.status === 'QUEUED') {
      working = { ...working, status: 'PREPARING' };
    } else if (working.status === 'PREPARING') {
      working = { ...working, status: 'RENDERING' };
    } else if (working.status === 'RENDERING') {
      await mkdir(renderDir(), { recursive: true });
      const timeline = tribute.timeline ? parseTimelineContract(tribute.timeline) : null;
      if (timeline && isLocalEncoderEnabled()) {
        const encoded = await encodeTimelineLocally({
          timeline,
          jobId: working.id,
          kind: working.kind,
          tributePublicId: publicId,
        });
        if (encoded.ok) {
          working = {
            ...working,
            status: 'VERIFYING',
            outputPath: encoded.outputRelative,
          };
          encodeNote = `encoded_with_${encoded.encoder}`;
        } else {
          const relative = path.join('.data', 'renders', `${working.id}.marker`);
          await writeFile(
            path.join(process.cwd(), relative),
            `memorialvideo-local-render-marker\njob=${working.id}\nhash=${working.snapshotHash}\nreason=${encoded.reason}\n`,
            'utf8',
          );
          working = { ...working, status: 'VERIFYING', outputPath: relative };
          encodeNote = `encode_failed_${encoded.reason}`;
        }
      } else {
        const relative = path.join('.data', 'renders', `${working.id}.marker`);
        await writeFile(
          path.join(process.cwd(), relative),
          `memorialvideo-local-render-marker\njob=${working.id}\nhash=${working.snapshotHash}\n`,
          'utf8',
        );
        working = { ...working, status: 'VERIFYING', outputPath: relative };
        encodeNote = 'encoder_unavailable_marker';
      }
      void planned;
    }
  } else if (working.status === 'VERIFYING') {
    const timeline = tribute.timeline ? parseTimelineContract(tribute.timeline) : null;
    const expectedDuration = timeline ? totalDurationFrames(timeline) / timeline.fps : 0;
    const probe = await probeLocalOutput(working.outputPath);
    const qc = evaluateOutputQc({
      probe,
      expectedDurationSeconds: expectedDuration,
      requireAudio: working.kind === 'final',
      expectedWidth: timeline?.width ?? 1920,
      expectedHeight: timeline?.height ?? 1080,
    });
    if (qc.ready) {
      const poster = await extractReadyPosterStill({
        jobId: working.id,
        outputPath: working.outputPath,
        durationSeconds: probe.durationSeconds,
      });
      working = {
        ...working,
        status: 'READY',
        outputVerified: true,
        qcFailures: [],
        failureReason: null,
        posterPath: poster.ok ? poster.posterRelative : null,
      };
      if (!poster.ok) {
        encodeNote = encodeNote
          ? `${encodeNote};poster_skipped_${poster.reason}`
          : `poster_skipped_${poster.reason}`;
      } else {
        encodeNote = encodeNote ? `${encodeNote};poster_ready` : 'poster_ready';
      }
    } else {
      working = {
        ...working,
        status: 'FAILED_RETRYABLE',
        outputVerified: false,
        qcFailures: qc.failures,
        failureReason: 'output_qc_failed',
        posterPath: null,
      };
    }
  }

  const jobs = tribute.renderJobs.map((job) => (job.id === working.id ? working : job));
  let finalRendersUsed = tribute.finalRendersUsed;
  let activity = tribute.activity;
  if (working.status === 'READY' && working.kind === 'final') {
    finalRendersUsed += 1;
    activity = [
      activityEventSchema.parse({
        id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        code: 'render_ready',
        correlationId: working.id.slice(0, 16),
        createdAt: now,
      }),
      ...activity,
    ].slice(0, 200);
  } else if (working.status === 'FAILED_RETRYABLE') {
    activity = [
      activityEventSchema.parse({
        id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        code: 'render_failed',
        correlationId: working.id.slice(0, 16),
        createdAt: now,
      }),
      ...activity,
    ].slice(0, 200);
  }

  const next = await replaceRenderJobs(publicId, jobs, { finalRendersUsed, activity });
  return {
    tribute: next,
    advanced: working,
    note:
      working.status === 'READY'
        ? encodeNote
          ? `ready_after_qc:${encodeNote}`
          : 'ready_after_qc'
        : working.status === 'FAILED_RETRYABLE'
          ? encodeNote
            ? `qc_failed:${encodeNote}`
            : 'qc_failed_no_real_mp4 — local Remotion/ffmpeg encoder unavailable'
          : encodeNote
            ? `advanced_to_${working.status}:${encodeNote}`
            : `advanced_to_${working.status}`,
  };
}

/**
 * Prompt 17 stale-final: a READY job is current only when its enqueue snapshot
 * still matches the published TimelineContract (`hashTimeline`).
 * Historical READY outputs stay downloadable — they must not masquerade as current.
 */
export function isRenderJobCurrentForTribute(
  tribute: Tribute | null,
  job: StoredRenderJob,
): boolean | null {
  if (job.status !== 'READY') {
    return null;
  }
  if (!tribute?.timeline) {
    return false;
  }
  try {
    return hashTimeline(parseTimelineContract(tribute.timeline)) === job.snapshotHash;
  } catch {
    return false;
  }
}

export function summarizeRenderJobs(tribute: Tribute) {
  return tribute.renderJobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    status: job.status,
    snapshotHash: job.snapshotHash.slice(0, 12),
    timelineVersion: job.timelineVersion,
    attemptCount: job.attemptCount,
    qcFailures: job.qcFailures,
    outputVerified: job.outputVerified,
    failureReason: job.failureReason,
    updatedAt: job.updatedAt,
    isCurrent: isRenderJobCurrentForTribute(tribute, job),
    hasPoster: Boolean(job.posterPath),
  }));
}

export function planDownloadFromJobs(tribute: Tribute | null) {
  const entitlement = entitlementView(tribute);
  const ready = tribute?.renderJobs.find(
    (job) => job.kind === 'final' && job.status === 'READY' && job.outputVerified,
  );
  const canMp4 = canIssueSignedDownload({
    kind: 'final',
    jobReady: Boolean(ready),
    outputVerified: Boolean(ready?.outputVerified),
    deleted: false,
    allowsPrivatePlayback: entitlement.allowsPrivatePlayback,
  });
  const isCurrent = ready ? isRenderJobCurrentForTribute(tribute, ready) : null;
  const staleFinal = Boolean(canMp4 && isCurrent === false);
  return {
    canDownloadMp4: canMp4,
    canExportMetadata: Boolean(tribute && entitlement.active),
    readyJobId: ready?.id ?? null,
    hasPoster: Boolean(ready?.posterPath),
    isCurrent,
    staleFinal,
    reason: canMp4
      ? staleFinal
        ? 'Film changed after this READY final — download is the previous ceremony copy. Enqueue a new final to match the current TimelineContract.'
        : 'Verified READY final available — download unlocked.'
      : entitlement.active
        ? 'Memorial Pack active — enqueue a final render and advance the local worker until Output QC marks READY (ffmpeg slideshow or CREATOR_USE_REMOTION=1).'
        : 'Memorial Pack required for ceremony download.',
  };
}

export async function resolveReadyFinalAbsolutePath(tribute: Tribute): Promise<string | null> {
  const ready = tribute.renderJobs.find(
    (job) => job.kind === 'final' && job.status === 'READY' && job.outputVerified && job.outputPath,
  );
  if (!ready?.outputPath) {
    return null;
  }
  const absolute = path.isAbsolute(ready.outputPath)
    ? ready.outputPath
    : path.join(process.cwd(), ready.outputPath);
  try {
    await access(absolute);
    return absolute;
  } catch {
    return null;
  }
}

function absoluteUnderCwd(relativeOrAbsolute: string): string {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(process.cwd(), relativeOrAbsolute);
}

/** Owner-local READY JPEG for Account / Share desk — never a public URL. */
export async function resolveOwnerPosterAbsolutePath(
  jobId: string,
): Promise<{ absolute: string; tributePublicId: string } | null> {
  if (!jobId.startsWith('rjob_') || jobId.length > 80) {
    return null;
  }
  const tributes = await listTributes();
  for (const tribute of tributes) {
    const job = tribute.renderJobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      continue;
    }
    if (job.status !== 'READY' || !job.outputVerified || !job.posterPath) {
      return null;
    }
    if (!job.posterPath.endsWith('.poster.jpg') && !job.posterPath.endsWith('.jpg')) {
      return null;
    }
    const absolute = absoluteUnderCwd(job.posterPath);
    try {
      await access(absolute);
      return { absolute, tributePublicId: tribute.publicId };
    } catch {
      return null;
    }
  }
  return null;
}

export async function resolveReadyFinalPosterAbsolutePath(
  tribute: Tribute,
): Promise<string | null> {
  const ready = tribute.renderJobs.find(
    (job) =>
      job.kind === 'final' &&
      job.status === 'READY' &&
      job.outputVerified &&
      job.posterPath,
  );
  if (!ready?.posterPath) {
    return null;
  }
  const absolute = absoluteUnderCwd(ready.posterPath);
  try {
    await access(absolute);
    return absolute;
  } catch {
    return null;
  }
}

/** Deterministic fingerprint for tests — not used as a secret. */
export function shortSnapshotFingerprint(timelineJson: string): string {
  return createHash('sha256').update(timelineJson).digest('hex').slice(0, 16);
}
