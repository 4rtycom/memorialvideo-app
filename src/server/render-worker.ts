import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoredRenderJob, Tribute } from './store';

export const MAX_AUTO_ATTEMPTS = 3; // first try + two automatic retries
export const MAX_TICKS_PER_JOB = 8;
const TERMINAL: ReadonlySet<StoredRenderJob['status']> = new Set(['READY', 'FAILED_RETRYABLE', 'FAILED_FINAL']);

export type WorkerDeps = {
  listTributes: () => Promise<Tribute[]>;
  getTribute: (publicId: string) => Promise<Tribute | null>;
  advance: (publicId: string) => Promise<{ advanced: StoredRenderJob | null; note: string }>;
  requeue: (publicId: string, jobId: string) => Promise<boolean>;
  markFailed: (publicId: string, jobId: string, reason: string) => Promise<void>;
  hydrate: (tribute: Tribute) => Promise<void>;
  publish: (tribute: Tribute, job: StoredRenderJob) => Promise<void>;
  cleanup: (tribute: Tribute, job: StoredRenderJob) => Promise<void>;
  report: (message: string, publicId: string, jobId: string) => Promise<void>;
  log: (line: string) => void;
};

type Work = { tribute: Tribute; job: StoredRenderJob; action: 'run' | 'retry' };

/** Next job a worker should touch: resume active ones, then queued, then automatic retries. */
export function pickWork(tributes: readonly Tribute[]): Work | null {
  const jobs = tributes.flatMap((tribute) => tribute.renderJobs.map((job) => ({ tribute, job })));
  const active = jobs.find(({ job }) => ['PREPARING', 'RENDERING', 'VERIFYING'].includes(job.status));
  if (active) return { ...active, action: 'run' };
  const queued = jobs
    .filter(({ job }) => job.status === 'QUEUED')
    .sort((a, b) => a.job.queuedAt.localeCompare(b.job.queuedAt))[0];
  if (queued) return { ...queued, action: 'run' };
  const retry = jobs.find(({ job }) => job.status === 'FAILED_RETRYABLE' && job.attemptCount + 1 < MAX_AUTO_ATTEMPTS);
  return retry ? { ...retry, action: 'retry' } : null;
}

/** One unit of work. Returns 'idle' when there is nothing to do. */
export async function runWorkerCycle(deps: WorkerDeps): Promise<'idle' | 'worked'> {
  const work = pickWork(await deps.listTributes());
  if (!work) return 'idle';
  const { tribute, job } = work;
  const id = `${tribute.publicId}/${job.id}`;

  if (work.action === 'retry') {
    deps.log(`retry ${id} (attempt ${job.attemptCount + 2})`);
    await deps.requeue(tribute.publicId, job.id);
    return 'worked';
  }

  deps.log(`start ${id} status=${job.status}`);
  let latest: StoredRenderJob | null = job;
  try {
    await deps.hydrate(tribute);
    for (let tick = 0; tick < MAX_TICKS_PER_JOB; tick += 1) {
      const result = await deps.advance(tribute.publicId);
      latest = result.advanced ?? latest;
      deps.log(`tick ${tick} ${id} -> ${latest?.status ?? 'none'} (${result.note})`);
      if (!latest || TERMINAL.has(latest.status)) break;
    }
    if (latest?.status === 'READY') {
      try {
        await deps.publish(tribute, latest);
      } catch (error) {
        await deps.markFailed(tribute.publicId, latest.id, 'upload_failed');
        throw error;
      }
      deps.log(`ready ${id}`);
    } else if (latest?.status === 'FAILED_RETRYABLE' && latest.attemptCount + 1 >= MAX_AUTO_ATTEMPTS) {
      await deps.report(`Render failed after ${latest.attemptCount + 1} attempts (${latest.failureReason ?? 'unknown'})`, tribute.publicId, latest.id);
    } else if (latest && !TERMINAL.has(latest.status)) {
      // Not finished within the tick budget: leave it; the next cycle resumes it.
      deps.log(`unfinished ${id} status=${latest.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log(`error ${id}: ${message}`);
    await deps.report(`Render worker error: ${message}`, tribute.publicId, job.id);
  } finally {
    if (latest && TERMINAL.has(latest.status)) {
      await deps.cleanup(tribute, latest).catch(() => undefined);
    }
  }
  return 'worked';
}

/* ---- production wiring (needs Supabase env, ffmpeg, a writable working directory) ---- */

export async function productionDeps(): Promise<WorkerDeps> {
  const [{ listTributes, getTribute, replaceRenderJobs }, render, storage, errorReport, normalize] = await Promise.all([
    import('./store'),
    import('./render'),
    import('./object-storage'),
    import('./error-report'),
    import('./normalize-still'),
  ]);
  const root = path.join(process.cwd(), '.data');
  const jobFile = (jobId: string, suffix: string) => path.join(root, 'renders', `${jobId}${suffix}`);

  return {
    listTributes,
    getTribute,
    advance: async (publicId) => {
      const result = await render.advanceRenderOnce(publicId);
      return { advanced: result.advanced, note: result.note };
    },
    requeue: render.requeueFailedJob,
    markFailed: async (publicId, jobId, reason) => {
      const tribute = await getTribute(publicId);
      if (!tribute) return;
      await replaceRenderJobs(
        publicId,
        tribute.renderJobs.map((job) =>
          job.id === jobId
            ? { ...job, status: 'FAILED_RETRYABLE' as const, outputVerified: false, failureReason: reason, updatedAt: new Date().toISOString() }
            : job,
        ),
      );
    },
    hydrate: async (tribute) => {
      for (const memory of tribute.memories) {
        if (memory.ingestStatus !== 'READY' && memory.ingestStatus !== 'UPLOADED') continue;
        const target = path.join(root, 'media', tribute.publicId, memory.id);
        try {
          await readFile(target);
          continue;
        } catch {
          /* not on disk yet */
        }
        const object = await storage.downloadObject(tribute.publicId, memory.id);
        if (!object) continue;
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, object.bytes);
        const type = (memory.contentType ?? '').toLowerCase();
        if (type.startsWith('image/') && !type.includes('heic') && !type.includes('heif')) {
          // Best-effort, same as local ingest: the encoder prefers the normalized copy when present.
          await normalize.normalizeStillWithFfmpeg({
            sourceAbsolute: target,
            outputAbsolute: normalize.normalizedStillAbsolutePath(target),
          });
        }
      }
    },
    publish: async (tribute, job) => {
      if (!job.outputPath) throw new Error('no_output_path');
      const output = path.isAbsolute(job.outputPath) ? job.outputPath : path.join(process.cwd(), job.outputPath);
      await storage.uploadRenderObject(tribute.publicId, job.id, 'mp4', await readFile(output));
      if (job.kind === 'final') {
        const fresh = (await getTribute(tribute.publicId)) ?? tribute;
        const pack = (await import('./ceremony-pack-local')).assembleCeremonyPackZip(fresh, await readFile(output));
        await storage.uploadRenderObject(tribute.publicId, job.id, 'pack', Buffer.from(pack.bytes));
      }
      if (job.posterPath) {
        const poster = path.isAbsolute(job.posterPath) ? job.posterPath : path.join(process.cwd(), job.posterPath);
        await storage.uploadRenderObject(tribute.publicId, job.id, 'poster', await readFile(poster));
      }
    },
    cleanup: async (tribute, job) => {
      await rm(path.join(root, 'media', tribute.publicId), { recursive: true, force: true });
      for (const suffix of ['.mp4', '.poster.jpg', '.marker']) {
        await rm(jobFile(job.id, suffix), { force: true });
      }
    },
    report: async (message, publicId, jobId) => {
      await errorReport.sendErrorReport(
        errorReport.buildErrorReport(new Error(message), { path: `/worker/render/${publicId}/${jobId}`, method: 'WORKER' }, { routeType: 'worker' }),
        process.env.ERROR_WEBHOOK_URL,
      );
    },
    log: (line) => console.log(`[render-worker] ${line}`),
  };
}
