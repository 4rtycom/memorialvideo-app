import { describe, expect, it, vi } from 'vitest';
import { MAX_AUTO_ATTEMPTS, pickWork, runWorkerCycle, type WorkerDeps } from './render-worker';
import type { StoredRenderJob, Tribute } from './store';

const job = (over: Partial<StoredRenderJob>): StoredRenderJob =>
  ({ id: 'job1', status: 'QUEUED', attemptCount: 0, queuedAt: '2026-01-01T00:00:00Z', ...over }) as StoredRenderJob;
const tribute = (publicId: string, jobs: StoredRenderJob[]): Tribute => ({ publicId, renderJobs: jobs, memories: [] }) as unknown as Tribute;

function deps(tributes: Tribute[], steps: StoredRenderJob[], over: Partial<WorkerDeps> = {}): WorkerDeps & Record<string, ReturnType<typeof vi.fn>> {
  let i = 0;
  const base = {
    listTributes: vi.fn(async () => tributes),
    getTribute: vi.fn(async () => null),
    advance: vi.fn(async () => ({ advanced: steps[Math.min(i++, steps.length - 1)] ?? null, note: 'ok' })),
    requeue: vi.fn(async () => true),
    markFailed: vi.fn(async () => undefined),
    hydrate: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => undefined),
    report: vi.fn(async () => undefined),
    log: vi.fn(),
    ...over,
  };
  return base as never;
}

describe('pickWork', () => {
  it('prefers active, then oldest queued, then retryable under the cap', () => {
    const a = tribute('a', [job({ id: 'q2', queuedAt: '2026-01-02T00:00:00Z' })]);
    const b = tribute('b', [job({ id: 'q1' })]);
    expect(pickWork([a, b])?.job.id).toBe('q1');
    const c = tribute('c', [job({ id: 'r', status: 'RENDERING' })]);
    expect(pickWork([a, b, c])?.job.id).toBe('r');
    const d = tribute('d', [job({ id: 'f', status: 'FAILED_RETRYABLE', attemptCount: 0 })]);
    expect(pickWork([d])).toMatchObject({ action: 'retry' });
    const e = tribute('e', [job({ id: 'g', status: 'FAILED_RETRYABLE', attemptCount: MAX_AUTO_ATTEMPTS - 1 })]);
    expect(pickWork([e])).toBeNull();
  });
});

describe('runWorkerCycle', () => {
  it('is idle without work', async () => {
    expect(await runWorkerCycle(deps([], []))).toBe('idle');
  });

  it('renders, publishes and cleans up a READY job', async () => {
    const t = tribute('t1', [job({})]);
    const d = deps([t], [job({ status: 'RENDERING' }), job({ status: 'READY' })]);
    expect(await runWorkerCycle(d)).toBe('worked');
    expect(d.hydrate).toHaveBeenCalledOnce();
    expect(d.advance).toHaveBeenCalledTimes(2);
    expect(d.publish).toHaveBeenCalledOnce();
    expect(d.cleanup).toHaveBeenCalledOnce();
    expect(d.report).not.toHaveBeenCalled();
  });

  it('marks the job retryable when the upload fails and reports it', async () => {
    const t = tribute('t1', [job({})]);
    const d = deps([t], [job({ status: 'READY' })], { publish: vi.fn(async () => { throw new Error('boom'); }) });
    await runWorkerCycle(d);
    expect(d.markFailed).toHaveBeenCalledWith('t1', 'job1', 'upload_failed');
    expect(d.report).toHaveBeenCalledOnce();
  });

  it('requeues a retryable failure and reports only when attempts are exhausted', async () => {
    const t = tribute('t1', [job({ status: 'FAILED_RETRYABLE', attemptCount: 0 })]);
    const d = deps([t], []);
    await runWorkerCycle(d);
    expect(d.requeue).toHaveBeenCalledWith('t1', 'job1');

    const t2 = tribute('t2', [job({})]);
    const last = job({ status: 'FAILED_RETRYABLE', attemptCount: MAX_AUTO_ATTEMPTS - 1, failureReason: 'encode' });
    const d2 = deps([t2], [last]);
    await runWorkerCycle(d2);
    expect(d2.report).toHaveBeenCalledOnce();
  });

  it('reports hydrate errors without throwing', async () => {
    const t = tribute('t1', [job({})]);
    const d = deps([t], [], { hydrate: vi.fn(async () => { throw new Error('storage down'); }) });
    await expect(runWorkerCycle(d)).resolves.toBe('worked');
    expect(d.report).toHaveBeenCalledOnce();
  });
});
