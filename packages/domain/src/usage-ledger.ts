import type { PackageKey } from '@memorialvideo/contracts';

/**
 * Prompt 22 — internal usage ledger + cost guardrails.
 * Estimated costs are operational only; never show raw cost in customer UI.
 */

export const USAGE_OPERATIONS = [
  'storage_bytes',
  'upload_duration_ms',
  'transcode',
  'transcription_ms',
  'enhancement',
  'intelligence_call',
  'token_usage',
  'render_attempt',
  'render_minutes',
  'generated_asset',
] as const;

export type UsageOperation = (typeof USAGE_OPERATIONS)[number];

export type UsageUnitKind =
  | 'bytes'
  | 'milliseconds'
  | 'count'
  | 'tokens'
  | 'minutes'
  | 'attempts';

export type UsageEventInput = {
  projectId: string | null;
  actorUserId: string | null;
  operation: UsageOperation;
  provider: string;
  modelOrService?: string | null;
  units: number;
  unitKind: UsageUnitKind;
  estimatedCostMicros: number;
  metadata?: Record<string, string | number | boolean | null>;
};

/** Rough internal unit costs (micros of USD) — ops analytics only. */
export const USAGE_COST_MICROS: Record<UsageOperation, number> = {
  storage_bytes: 0,
  upload_duration_ms: 0,
  transcode: 2000,
  transcription_ms: 5,
  enhancement: 15000,
  intelligence_call: 25000,
  token_usage: 2,
  render_attempt: 50000,
  render_minutes: 80000,
  generated_asset: 1000,
};

export function estimateUsageCostMicros(operation: UsageOperation, units: number): number {
  const per = USAGE_COST_MICROS[operation];
  if (operation === 'storage_bytes') {
    return Math.round((units / (1024 * 1024)) * 10);
  }
  if (operation === 'transcription_ms' || operation === 'upload_duration_ms') {
    return Math.round(per * units);
  }
  if (operation === 'token_usage' || operation === 'render_minutes') {
    return Math.round(per * units);
  }
  return Math.round(per * Math.max(1, units));
}

export type ProjectUsageLimits = {
  maxRenderAttemptsPerDay: number;
  maxEnhancementsPerDay: number;
  maxIntelligenceCallsPerDay: number;
  maxConcurrentJobs: number;
  maxUploadBytesPerDay: number;
};

export const PACKAGE_USAGE_LIMITS: Record<PackageKey, ProjectUsageLimits> = {
  preview: {
    maxRenderAttemptsPerDay: 8,
    maxEnhancementsPerDay: 10,
    maxIntelligenceCallsPerDay: 20,
    maxConcurrentJobs: 2,
    maxUploadBytesPerDay: 500 * 1024 * 1024,
  },
  tribute: {
    maxRenderAttemptsPerDay: 12,
    maxEnhancementsPerDay: 40,
    maxIntelligenceCallsPerDay: 60,
    maxConcurrentJobs: 3,
    maxUploadBytesPerDay: 2 * 1024 * 1024 * 1024,
  },
  ceremony: {
    maxRenderAttemptsPerDay: 20,
    maxEnhancementsPerDay: 80,
    maxIntelligenceCallsPerDay: 120,
    maxConcurrentJobs: 4,
    maxUploadBytesPerDay: 5 * 1024 * 1024 * 1024,
  },
  legacy: {
    maxRenderAttemptsPerDay: 40,
    maxEnhancementsPerDay: 160,
    maxIntelligenceCallsPerDay: 240,
    maxConcurrentJobs: 6,
    maxUploadBytesPerDay: 10 * 1024 * 1024 * 1024,
  },
};

export type UsageWindowCount = {
  renderAttempts: number;
  enhancements: number;
  intelligenceCalls: number;
  uploadBytes: number;
  activeJobs: number;
};

export type UsageBudgetDecision =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'render_attempts_exhausted'
        | 'enhancements_exhausted'
        | 'intelligence_exhausted'
        | 'upload_bytes_exhausted'
        | 'concurrency_limit'
        | 'circuit_open';
    };

export function planUsageBudget(input: {
  packageKey: PackageKey;
  counts: UsageWindowCount;
  operation: UsageOperation;
  circuitOpen?: boolean;
}): UsageBudgetDecision {
  if (input.circuitOpen) {
    return { ok: false, reason: 'circuit_open' };
  }
  const limits = PACKAGE_USAGE_LIMITS[input.packageKey] ?? PACKAGE_USAGE_LIMITS.preview;
  if (input.counts.activeJobs >= limits.maxConcurrentJobs) {
    return { ok: false, reason: 'concurrency_limit' };
  }
  if (input.operation === 'render_attempt' && input.counts.renderAttempts >= limits.maxRenderAttemptsPerDay) {
    return { ok: false, reason: 'render_attempts_exhausted' };
  }
  if (input.operation === 'enhancement' && input.counts.enhancements >= limits.maxEnhancementsPerDay) {
    return { ok: false, reason: 'enhancements_exhausted' };
  }
  if (
    (input.operation === 'intelligence_call' || input.operation === 'token_usage') &&
    input.counts.intelligenceCalls >= limits.maxIntelligenceCallsPerDay
  ) {
    return { ok: false, reason: 'intelligence_exhausted' };
  }
  if (input.operation === 'storage_bytes' && input.counts.uploadBytes >= limits.maxUploadBytesPerDay) {
    return { ok: false, reason: 'upload_bytes_exhausted' };
  }
  return { ok: true };
}

/**
 * Circuit breaker: open after too many failures in a short window.
 * Prevents runaway provider spend from uncontrolled retries.
 */
export function planCircuitBreaker(input: {
  failureCount: number;
  windowMs: number;
  threshold?: number;
  cooldownMs?: number;
  now?: number;
  openedAt?: number | null;
}): { open: boolean; openedAt: number | null } {
  const threshold = input.threshold ?? 8;
  const cooldownMs = input.cooldownMs ?? 15 * 60_000;
  const now = input.now ?? Date.now();
  if (input.openedAt && now - input.openedAt < cooldownMs) {
    return { open: true, openedAt: input.openedAt };
  }
  if (input.failureCount >= threshold && input.windowMs <= 10 * 60_000) {
    return { open: true, openedAt: now };
  }
  return { open: false, openedAt: null };
}

/** Do not re-run intelligence merely because a user revisited a page. */
export function shouldRerunIntelligence(input: {
  lastCompletedAt: string | null | undefined;
  inputFingerprint: string;
  lastFingerprint: string | null | undefined;
}): boolean {
  if (!input.lastCompletedAt || !input.lastFingerprint) {
    return true;
  }
  return input.inputFingerprint !== input.lastFingerprint;
}
