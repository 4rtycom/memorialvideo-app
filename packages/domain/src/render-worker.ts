import type { PackageKey, RenderJobStatus, RenderKind } from '@memorialvideo/contracts';

import { canStartFinalRender } from './entitlement';
import { classifyRetry, nextRenderAttempt, transitionRender } from './state-machine';

export const RENDER_OUTPUT_BUCKET = 'temporary-exports';

export function opaqueRenderOutputKey(projectId: string, jobId: string): string {
  return `projects/${projectId}/renders/${jobId}/output.mp4`;
}

export function opaquePosterOutputKey(projectId: string, jobId: string): string {
  return `projects/${projectId}/renders/${jobId}/poster.jpg`;
}

export const STORAGE_VARIANT_PREFIX = 'storage://project-variants/';
export const STORAGE_ORIGINAL_PREFIX = 'storage://project-originals/';

export function storageVariantKey(src: string): string | null {
  if (src.startsWith(STORAGE_VARIANT_PREFIX)) {
    const key = src.slice(STORAGE_VARIANT_PREFIX.length).trim();
    return key && !key.startsWith('http') ? key : null;
  }
  if (src.startsWith(STORAGE_ORIGINAL_PREFIX)) {
    const key = src.slice(STORAGE_ORIGINAL_PREFIX.length).trim();
    return key && !key.startsWith('http') ? key : null;
  }
  return null;
}

export function storageBucketForSrc(src: string): 'project-variants' | 'project-originals' | null {
  if (src.startsWith(STORAGE_VARIANT_PREFIX)) {
    return 'project-variants';
  }
  if (src.startsWith(STORAGE_ORIGINAL_PREFIX)) {
    return 'project-originals';
  }
  return null;
}

export function planPosterAttachment(input: { jobStatus: string; extractOk: boolean }): {
  attachPoster: boolean;
  failJob: false;
  posterError?: 'poster_extract_failed';
} {
  if (input.jobStatus !== 'READY') {
    return { attachPoster: false, failJob: false };
  }
  if (input.extractOk) {
    return { attachPoster: true, failJob: false };
  }
  return { attachPoster: false, failJob: false, posterError: 'poster_extract_failed' };
}

export function claimQueuedJob(status: RenderJobStatus): RenderJobStatus {
  return transitionRender(status, 'PREPARING');
}

export function beginRendering(status: RenderJobStatus): RenderJobStatus {
  return transitionRender(status, 'RENDERING');
}

export function beginVerification(status: RenderJobStatus): RenderJobStatus {
  return transitionRender(status, 'VERIFYING');
}

export function finishVerifiedJob(input: {
  status: RenderJobStatus;
  qcReady: boolean;
  attemptCount: number;
  retryable: boolean;
}): { status: RenderJobStatus; attemptCount: number } {
  const verifying = input.status === 'VERIFYING' ? input.status : transitionRender(input.status, 'VERIFYING');
  if (input.qcReady) {
    return { status: transitionRender(verifying, 'READY'), attemptCount: input.attemptCount };
  }
  const attempts = nextRenderAttempt(input.attemptCount);
  return { status: classifyRetry(input.attemptCount, input.retryable), attemptCount: attempts };
}

export function consumeFinalRenderSlot(input: {
  kind: RenderKind;
  nextStatus: RenderJobStatus;
  finalRendersUsed: number;
}): number {
  if (input.kind !== 'final' || input.nextStatus !== 'READY') {
    return input.finalRendersUsed;
  }
  return input.finalRendersUsed + 1;
}

export type QueuedJobCandidate = {
  id: string;
  status: RenderJobStatus;
  queuedAt: string;
};

export function selectNextQueuedJob(jobs: readonly QueuedJobCandidate[]): string | null {
  return (
    [...jobs]
      .filter((job) => job.status === 'QUEUED')
      .sort((left, right) => Date.parse(left.queuedAt) - Date.parse(right.queuedAt))[0]?.id ?? null
  );
}

export type JobCompletionPlan = {
  jobStatus: RenderJobStatus;
  attemptCount: number;
  writeOutput: boolean;
  incrementFinalSlot: boolean;
};

export function planJobCompletion(input: {
  kind: RenderKind;
  status: RenderJobStatus;
  qcReady: boolean;
  attemptCount: number;
}): JobCompletionPlan {
  let status = input.status;
  if (status === 'QUEUED') {
    status = claimQueuedJob(status);
  }
  if (status === 'PREPARING') {
    status = beginRendering(status);
  }
  if (status === 'RENDERING') {
    status = beginVerification(status);
  }
  const finished = finishVerifiedJob({
    status,
    qcReady: input.qcReady,
    attemptCount: input.attemptCount,
    retryable: true,
  });
  return {
    jobStatus: finished.status,
    attemptCount: finished.attemptCount,
    writeOutput: finished.status === 'READY',
    incrementFinalSlot: input.kind === 'final' && finished.status === 'READY',
  };
}

export function assertFinalEntitlement(input: {
  kind: RenderKind;
  packageKey?: PackageKey;
  finalRendersUsed: number;
  isTechnicalRetry: boolean;
}): boolean {
  if (input.kind !== 'final') {
    return true;
  }
  if (!input.packageKey) {
    return false;
  }
  return canStartFinalRender({
    packageKey: input.packageKey,
    finalRendersUsed: input.finalRendersUsed,
    isTechnicalRetry: input.isTechnicalRetry,
  });
}
