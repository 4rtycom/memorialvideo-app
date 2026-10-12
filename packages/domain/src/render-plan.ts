import {
  canTransitionRender,
  classifyRetry,
  isTerminalRenderStatus,
  transitionRender,
} from './state-machine';
import type { RenderJobStatus, RenderKind } from '@memorialvideo/contracts';

export const PREVIEW_QUOTA_PER_PROJECT = 8;
export const STALE_HEARTBEAT_MS = 15 * 60 * 1000;

export type ExistingRenderJob = {
  id: string;
  kind: RenderKind;
  snapshotHash: string;
  status: RenderJobStatus;
  lastHeartbeatAt?: string | null;
};

export type RenderPlan =
  | { action: 'reuse_ready'; jobId: string }
  | { action: 'reuse_active'; jobId: string }
  | { action: 'retry_existing'; jobId: string }
  | { action: 'enqueue'; idempotencyKey: string }
  | { action: 'deny'; reason: RenderDenial };

export type RenderDenial =
  | 'entitlement_required'
  | 'final_quota'
  | 'preview_quota'
  | 'terminal_same_snapshot';

export function renderIdempotencyKey(kind: RenderKind, snapshotHash: string): string {
  return `${kind}:${snapshotHash}`;
}

export function planRenderEnqueue(input: {
  kind: RenderKind;
  snapshotHash: string;
  existing: readonly ExistingRenderJob[];
  entitlement: { maxFinalRenders: number; finalRendersUsed: number } | null;
  previewUsed: number;
}): RenderPlan {
  const matches = input.existing.filter(
    (job) => job.kind === input.kind && job.snapshotHash === input.snapshotHash,
  );
  const ready = matches.find((job) => job.status === 'READY');
  if (ready) {
    return { action: 'reuse_ready', jobId: ready.id };
  }
  const active = matches.find((job) =>
    ['QUEUED', 'PREPARING', 'RENDERING', 'VERIFYING'].includes(job.status),
  );
  if (active) {
    return { action: 'reuse_active', jobId: active.id };
  }
  const retryable = matches.find((job) => job.status === 'FAILED_RETRYABLE');
  if (retryable) {
    return { action: 'retry_existing', jobId: retryable.id };
  }
  if (matches.some((job) => job.status === 'FAILED_FINAL' || job.status === 'CANCELED')) {
    return { action: 'deny', reason: 'terminal_same_snapshot' };
  }
  if (input.kind === 'preview' && input.previewUsed >= PREVIEW_QUOTA_PER_PROJECT) {
    return { action: 'deny', reason: 'preview_quota' };
  }
  if (input.kind === 'final') {
    if (!input.entitlement) {
      return { action: 'deny', reason: 'entitlement_required' };
    }
    if (input.entitlement.finalRendersUsed >= input.entitlement.maxFinalRenders) {
      return { action: 'deny', reason: 'final_quota' };
    }
  }
  return { action: 'enqueue', idempotencyKey: renderIdempotencyKey(input.kind, input.snapshotHash) };
}

export function planCancel(status: RenderJobStatus): RenderJobStatus | null {
  if (!canTransitionRender(status, 'CANCELED')) {
    return null;
  }
  return transitionRender(status, 'CANCELED');
}

export function reconcileStaleJobs(
  jobs: readonly ExistingRenderJob[],
  nowMs: number,
  staleAfterMs = STALE_HEARTBEAT_MS,
): Array<{ jobId: string; next: RenderJobStatus }> {
  return jobs.flatMap((job) => {
    if (isTerminalRenderStatus(job.status) || job.status === 'QUEUED') {
      return [];
    }
    const heartbeat = job.lastHeartbeatAt ? Date.parse(job.lastHeartbeatAt) : 0;
    if (!heartbeat || nowMs - heartbeat < staleAfterMs) {
      return [];
    }
    return [{ jobId: job.id, next: classifyRetry(1, true) }];
  });
}
