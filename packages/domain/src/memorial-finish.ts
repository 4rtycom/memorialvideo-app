/**
 * Memorial Finish (MV-126 foundation) — provider-neutral plan + job rules.
 * Authenticity lock: improve the recording; never rewrite the memory.
 * Live generative providers stay blocked until counsel (MV-135). External = 0.
 */

export const FINISH_MODES = ['restore', 'refine', 'stabilize', 'title_polish'] as const;
export type FinishMode = (typeof FINISH_MODES)[number];

export const FINISH_JOB_STATUSES = [
  'queued',
  'processing',
  'preview_ready',
  'failed_retryable',
  'failed_final',
  'approved',
  'rejected',
  'deleted',
] as const;
export type FinishJobStatus = (typeof FINISH_JOB_STATUSES)[number];

export type FinishSelection =
  | { kind: 'still_asset'; assetId: string }
  | { kind: 'video_range'; assetId: string; startMs: number; endMs: number }
  | { kind: 'title_asset'; assetId: string };

export type FinishPlanInput = {
  projectPublicId: string;
  selections: readonly FinishSelection[];
  mode: FinishMode;
  /** Family must consent per tribute before any external provider. */
  consentGranted: boolean;
  externalProvidersAllowed: boolean;
};

export type FinishPlanResult =
  | {
      ok: true;
      providerMode: 'local_deterministic' | 'blocked_external';
      selectionCount: number;
      mode: FinishMode;
      requiresFamilyReview: true;
      mutatesOriginal: false;
    }
  | { ok: false; reason: 'no_selection' | 'consent_required' | 'invalid_range' | 'external_blocked' };

export function planMemorialFinish(input: FinishPlanInput): FinishPlanResult {
  if (input.selections.length === 0) {
    return { ok: false, reason: 'no_selection' };
  }
  for (const selection of input.selections) {
    if (selection.kind === 'video_range') {
      if (selection.endMs <= selection.startMs || selection.startMs < 0) {
        return { ok: false, reason: 'invalid_range' };
      }
    }
  }
  if (!input.consentGranted) {
    return { ok: false, reason: 'consent_required' };
  }
  if (input.externalProvidersAllowed) {
    // Production external Finish remains counsel-gated; never auto-enable.
    return { ok: false, reason: 'external_blocked' };
  }
  return {
    ok: true,
    providerMode: 'local_deterministic',
    selectionCount: input.selections.length,
    mode: input.mode,
    requiresFamilyReview: true,
    mutatesOriginal: false,
  };
}

export function canTransitionFinishJob(from: FinishJobStatus, to: FinishJobStatus): boolean {
  const allowed: Record<FinishJobStatus, readonly FinishJobStatus[]> = {
    queued: ['processing', 'failed_retryable', 'deleted'],
    processing: ['preview_ready', 'failed_retryable', 'failed_final', 'deleted'],
    preview_ready: ['approved', 'rejected', 'deleted'],
    failed_retryable: ['queued', 'failed_final', 'deleted'],
    failed_final: ['deleted'],
    approved: ['deleted'],
    rejected: ['deleted'],
    deleted: [],
  };
  return allowed[from].includes(to);
}

/** Finish never replaces the original asset; only derived variants may attach. */
export function finishMutatesOriginal(): false {
  return false;
}

/**
 * Local deterministic Finish operations — no generative rewrite.
 * Video ranges use stabilize_metadata only (not generative restore/upscale).
 */
export type LocalFinishOperation =
  | 'exposure_normalize'
  | 'denoise_light'
  | 'stabilize_metadata'
  | 'stabilize_local_ffmpeg'
  | 'title_contrast_polish';

export function localFinishOperationsFor(mode: FinishMode, kind: FinishSelection['kind']): readonly LocalFinishOperation[] {
  if (kind === 'video_range') {
    // stabilize_local_ffmpeg is attempted when ffmpeg + source bytes are available;
    // otherwise the job stays metadata-only (honest MV-127 spike).
    return ['stabilize_metadata', 'stabilize_local_ffmpeg'];
  }
  if (kind === 'title_asset' || mode === 'title_polish') {
    return ['title_contrast_polish'];
  }
  if (mode === 'stabilize') {
    return ['stabilize_metadata', 'denoise_light'];
  }
  if (mode === 'refine') {
    return ['exposure_normalize', 'denoise_light'];
  }
  return ['exposure_normalize', 'denoise_light'];
}

export type FinishJobEnqueuePlan =
  | { ok: true; status: 'queued'; operations: readonly LocalFinishOperation[]; canProcessLocally: boolean }
  | { ok: false; reason: 'plan_denied' };

export function planFinishJobEnqueue(input: {
  plan: FinishPlanResult;
  selection: FinishSelection;
}): FinishJobEnqueuePlan {
  if (!input.plan.ok) {
    return { ok: false, reason: 'plan_denied' };
  }
  const operations = localFinishOperationsFor(input.plan.mode, input.selection.kind);
  return { ok: true, status: 'queued', operations, canProcessLocally: true };
}

/** Honest API status once local enqueue path exists. */
export function finishImplementationStatus(plan: FinishPlanResult): 'planned' | 'local_ready' | 'blocked_external' {
  if (!plan.ok) {
    return plan.reason === 'external_blocked' ? 'blocked_external' : 'planned';
  }
  return plan.providerMode === 'local_deterministic' ? 'local_ready' : 'blocked_external';
}

export function advanceLocalFinishJob(input: {
  status: FinishJobStatus;
  canProcessLocally: boolean;
}): FinishJobStatus | null {
  if (!input.canProcessLocally) {
    return null;
  }
  if (input.status === 'queued' && canTransitionFinishJob('queued', 'processing')) {
    return 'processing';
  }
  if (input.status === 'processing' && canTransitionFinishJob('processing', 'preview_ready')) {
    return 'preview_ready';
  }
  return null;
}

/** @deprecated Prefer advanceLocalFinishJob — same local deterministic advance. */
export const advanceLocalFinishStill = advanceLocalFinishJob;

export type FinishReviewDecision = 'approve' | 'reject' | 'approve_for_film';

export type FinishReviewResult =
  | {
      ok: true;
      status: FinishJobStatus;
      approvedForFilm: boolean;
      generativeAlteration: false;
      mutatesOriginal: false;
    }
  | { ok: false; reason: 'not_preview_ready' | 'invalid_decision' };

/** Family review before film use — never auto-applies to TimelineContract. */
export function decideFinishReview(input: {
  status: FinishJobStatus;
  decision: FinishReviewDecision;
}): FinishReviewResult {
  if (input.status !== 'preview_ready') {
    return { ok: false, reason: 'not_preview_ready' };
  }
  if (input.decision === 'approve') {
    if (!canTransitionFinishJob('preview_ready', 'approved')) {
      return { ok: false, reason: 'invalid_decision' };
    }
    return {
      ok: true,
      status: 'approved',
      approvedForFilm: false,
      generativeAlteration: false,
      mutatesOriginal: false,
    };
  }
  if (input.decision === 'approve_for_film') {
    if (!canTransitionFinishJob('preview_ready', 'approved')) {
      return { ok: false, reason: 'invalid_decision' };
    }
    return {
      ok: true,
      status: 'approved',
      approvedForFilm: true,
      generativeAlteration: false,
      mutatesOriginal: false,
    };
  }
  if (input.decision === 'reject') {
    if (!canTransitionFinishJob('preview_ready', 'rejected')) {
      return { ok: false, reason: 'invalid_decision' };
    }
    return {
      ok: true,
      status: 'rejected',
      approvedForFilm: false,
      generativeAlteration: false,
      mutatesOriginal: false,
    };
  }
  return { ok: false, reason: 'invalid_decision' };
}

/** MV-134 EffectBudget — Finish ceilings; generative ops always off. */
export type FinishEffectBudget = {
  maxJobsPerDay: number;
  maxVideoRangeSecondsPerDay: number;
  maxConcurrentJobs: number;
  generativeOpsAllowed: false;
};

export function defaultFinishEffectBudget(
  packageKey: 'preview' | 'tribute' | 'ceremony' | 'legacy' = 'preview',
): FinishEffectBudget {
  const byPackage: Record<'preview' | 'tribute' | 'ceremony' | 'legacy', Omit<FinishEffectBudget, 'generativeOpsAllowed'>> =
    {
      preview: { maxJobsPerDay: 8, maxVideoRangeSecondsPerDay: 60, maxConcurrentJobs: 2 },
      tribute: { maxJobsPerDay: 24, maxVideoRangeSecondsPerDay: 180, maxConcurrentJobs: 3 },
      ceremony: { maxJobsPerDay: 40, maxVideoRangeSecondsPerDay: 300, maxConcurrentJobs: 4 },
      legacy: { maxJobsPerDay: 80, maxVideoRangeSecondsPerDay: 600, maxConcurrentJobs: 6 },
    };
  return { ...byPackage[packageKey], generativeOpsAllowed: false };
}

export type FinishEffectBudgetDecision =
  | { ok: true }
  | { ok: false; reason: 'jobs_exhausted' | 'video_seconds_exhausted' | 'concurrency_limit' | 'generative_blocked' };

export function planFinishEffectBudget(input: {
  budget: FinishEffectBudget;
  jobsToday: number;
  videoSecondsToday: number;
  activeJobs: number;
  newJobCount: number;
  newVideoSeconds: number;
  requestsGenerative: boolean;
}): FinishEffectBudgetDecision {
  // generativeOpsAllowed is locked false; any generative request is blocked.
  if (input.requestsGenerative) {
    return { ok: false, reason: 'generative_blocked' };
  }
  if (input.activeJobs + input.newJobCount > input.budget.maxConcurrentJobs) {
    return { ok: false, reason: 'concurrency_limit' };
  }
  if (input.jobsToday + input.newJobCount > input.budget.maxJobsPerDay) {
    return { ok: false, reason: 'jobs_exhausted' };
  }
  if (input.videoSecondsToday + input.newVideoSeconds > input.budget.maxVideoRangeSecondsPerDay) {
    return { ok: false, reason: 'video_seconds_exhausted' };
  }
  return { ok: true };
}

/** Family-visible EffectBudget snapshot for Finish jobs list / 429 bodies (Prompt 22). */
export type FinishEffectBudgetSummary = {
  packageKey: 'preview' | 'tribute' | 'ceremony' | 'legacy';
  limits: {
    maxJobsPerDay: number;
    maxVideoRangeSecondsPerDay: number;
    maxConcurrentJobs: number;
  };
  used: {
    jobsToday: number;
    videoSecondsToday: number;
    activeJobs: number;
  };
  remaining: {
    jobs: number;
    videoSeconds: number;
    concurrentSlots: number;
  };
  generativeOpsAllowed: false;
};

export function summarizeFinishEffectBudget(input: {
  packageKey: 'preview' | 'tribute' | 'ceremony' | 'legacy';
  jobsToday: number;
  videoSecondsToday: number;
  activeJobs: number;
}): FinishEffectBudgetSummary {
  const budget = defaultFinishEffectBudget(input.packageKey);
  return {
    packageKey: input.packageKey,
    limits: {
      maxJobsPerDay: budget.maxJobsPerDay,
      maxVideoRangeSecondsPerDay: budget.maxVideoRangeSecondsPerDay,
      maxConcurrentJobs: budget.maxConcurrentJobs,
    },
    used: {
      jobsToday: input.jobsToday,
      videoSecondsToday: input.videoSecondsToday,
      activeJobs: input.activeJobs,
    },
    remaining: {
      jobs: Math.max(0, budget.maxJobsPerDay - input.jobsToday),
      videoSeconds: Math.max(0, budget.maxVideoRangeSecondsPerDay - input.videoSecondsToday),
      concurrentSlots: Math.max(0, budget.maxConcurrentJobs - input.activeJobs),
    },
    generativeOpsAllowed: false,
  };
}


export function videoRangeSeconds(selection: FinishSelection): number {
  if (selection.kind !== 'video_range') {
    return 0;
  }
  return Math.max(0, Math.ceil((selection.endMs - selection.startMs) / 1000));
}

/** Film binding requires approved + approved_for_film; never mutates originals. */
export function canApplyFinishInFilm(input: {
  status: FinishJobStatus;
  approvedForFilm: boolean;
}): boolean {
  return input.status === 'approved' && input.approvedForFilm === true;
}

export type FinishFilmBindingPlan =
  | {
      ok: true;
      matchedSceneCount: number;
      mutatesOriginal: false;
      /** Original asset bytes are never rewritten. */
      changesMediaBytes: false;
      /** True when a Finish-derived variant src will be selected for Remotion. */
      usesDerivedSrc: boolean;
    }
  | { ok: false; reason: 'not_film_approved' | 'asset_not_in_timeline' };

/** Finish-derived Remotion srcs live under project-variants `…/finish-…`. */
export function isFinishDerivedSrc(src: string): boolean {
  return (
    src.startsWith('storage://project-variants/') &&
    (src.includes('/finish-') || src.includes('/variants/finish'))
  );
}

/**
 * Resolves which src Remotion / snapshots should play for a Finish-bound asset.
 * Prefers an explicit derived Finish variant; otherwise keeps the original src.
 */
export function resolveFinishPlaybackSrc(input: {
  originalSrc: string;
  finishJobId?: string | null;
  derivedSrc?: string | null;
}): { src: string; usesDerived: boolean; finishJobId?: string } {
  const finishJobId =
    typeof input.finishJobId === 'string' && input.finishJobId.length > 0 ? input.finishJobId : undefined;
  const derived =
    typeof input.derivedSrc === 'string' && isFinishDerivedSrc(input.derivedSrc) ? input.derivedSrc : null;
  if (finishJobId && derived) {
    return { src: derived, usesDerived: true, finishJobId };
  }
  return { src: input.originalSrc, usesDerived: false, finishJobId };
}

/**
 * Plans binding a film-approved Finish job onto timeline scenes by asset id.
 * Originals stay immutable; optional derivedSrc may be selected for Remotion (MV-130).
 */
export function planFinishFilmBinding(input: {
  status: FinishJobStatus;
  approvedForFilm: boolean;
  assetId: string;
  timelineAssetIds: readonly string[];
  derivedSrc?: string | null;
}): FinishFilmBindingPlan {
  if (!canApplyFinishInFilm(input)) {
    return { ok: false, reason: 'not_film_approved' };
  }
  const matchedSceneCount = input.timelineAssetIds.filter((id) => id === input.assetId).length;
  if (matchedSceneCount === 0) {
    return { ok: false, reason: 'asset_not_in_timeline' };
  }
  const usesDerivedSrc = Boolean(
    input.derivedSrc && isFinishDerivedSrc(input.derivedSrc),
  );
  return { ok: true, matchedSceneCount, mutatesOriginal: false, changesMediaBytes: false, usesDerivedSrc };
}

/**
 * MV-127 local video spike plan — ffmpeg may produce a derived clip; generative restore stays blocked.
 */
export function planLocalVideoFinishSpike(input: {
  ffmpegAvailable: boolean;
}): {
  operations: readonly LocalFinishOperation[];
  canProduceDerivedBytes: boolean;
  generative: false;
  mutatesOriginal: false;
  blockedGenerativeRestore: true;
} {
  return {
    operations: ['stabilize_metadata', 'stabilize_local_ffmpeg'],
    canProduceDerivedBytes: input.ffmpegAvailable,
    generative: false,
    mutatesOriginal: false,
    blockedGenerativeRestore: true,
  };
}
