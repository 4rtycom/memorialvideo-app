export const RELIABILITY_LIMITS = {
  maxAssetsPerProject: 200,
  maxConcurrentRenders: 1,
  maxQueuedPreviewJobs: 8,
  maxQueuedFinalJobs: 1,
  maxDurationFrames: 30 * 60 * 30,
  outputWidth: 1920,
  outputHeight: 1080,
} as const;

export type LoadAdmission =
  | 'accept'
  | 'too_many_assets'
  | 'render_busy'
  | 'preview_quota'
  | 'final_queued';

export function planLoadAdmission(input: {
  assetCount: number;
  renderingCount: number;
  queuedPreviewCount: number;
  queuedFinalCount: number;
  kind: 'preview' | 'final';
}): LoadAdmission {
  if (input.assetCount > RELIABILITY_LIMITS.maxAssetsPerProject) {
    return 'too_many_assets';
  }
  if (input.renderingCount >= RELIABILITY_LIMITS.maxConcurrentRenders) {
    return 'render_busy';
  }
  if (input.kind === 'preview' && input.queuedPreviewCount >= RELIABILITY_LIMITS.maxQueuedPreviewJobs) {
    return 'preview_quota';
  }
  if (input.kind === 'final' && input.queuedFinalCount >= RELIABILITY_LIMITS.maxQueuedFinalJobs) {
    return 'final_queued';
  }
  return 'accept';
}

export function estimateRenderBudget(input: { durationFrames: number; fps: number }): {
  durationSeconds: number;
  outputMegapixels: number;
  overLong: boolean;
} {
  const fps = Math.max(1, input.fps);
  const durationSeconds = input.durationFrames / fps;
  return {
    durationSeconds,
    outputMegapixels:
      (RELIABILITY_LIMITS.outputWidth * RELIABILITY_LIMITS.outputHeight) / 1_000_000,
    overLong: input.durationFrames > RELIABILITY_LIMITS.maxDurationFrames,
  };
}
