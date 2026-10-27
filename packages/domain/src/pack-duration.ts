import {
  PROPOSED_CONSUMER_PLANS,
  proposedPlanById,
  type ProposedPlan,
  type ProposedPlanId,
} from './proposed-pricing';

/** Inclusive minute caps: Tribute ≤10, Life Story ≤20, Forever Legacy ≤40. */
export const PACK_FILM_MINUTE_CAPS = {
  'memorial-tribute': 10,
  'life-story': 20,
  'forever-legacy': 40,
} as const satisfies Record<ProposedPlanId, 10 | 20 | 40>;

/** Duration steps that force the next commercial pack (Glenn: >10 then >20). */
export const PACK_DURATION_UPGRADE_THRESHOLDS_SECONDS = {
  /** Over 10:00 → Life Story (next pack after Memorial Tribute). */
  overTenMinutes: 10 * 60,
  /** Over 20:00 → Forever Legacy (next pack after Life Story / +20 step). */
  overTwentyMinutes: 20 * 60,
} as const;

const PLAN_ORDER: readonly ProposedPlanId[] = [
  'memorial-tribute',
  'life-story',
  'forever-legacy',
];

export type PackDurationUpgradeReason =
  | 'within_allowance'
  | 'over_ten_minutes'
  | 'over_twenty_minutes';

export type PackDurationRecommendation = {
  /** Pack required by finished-film duration. */
  requiredPlanId: ProposedPlanId;
  requiredPlan: ProposedPlan;
  /** Selected pack after auto-move (never below required). */
  selectedPlanId: ProposedPlanId;
  selectedPlan: ProposedPlan;
  filmDurationSeconds: number;
  filmDurationMinutes: number;
  reason: PackDurationUpgradeReason;
  /** True when duration forced a higher tier than the caller’s prior selection. */
  autoUpgraded: boolean;
  /** Prior selection when an upgrade was applied; null if none or already sufficient. */
  previousPlanId: ProposedPlanId | null;
  /** True when film exceeds Forever Legacy’s 40-minute marketing allowance (still top tier). */
  exceedsTopTierAllowance: boolean;
  checkoutBlock: 'stripe_not_wired';
};

function planTier(id: ProposedPlanId): number {
  return PLAN_ORDER.indexOf(id);
}

function requirePlan(id: ProposedPlanId): ProposedPlan {
  const plan = proposedPlanById(id);
  if (!plan) {
    throw new Error(`unknown consumer pack: ${id}`);
  }
  return plan;
}

/**
 * Map finished-film duration to the minimum consumer pack.
 * - ≤ 10:00 → Memorial Tribute
 * - > 10:00 → Life Story
 * - > 20:00 → Forever Legacy
 */
export function requiredConsumerPackForDurationSeconds(durationSeconds: number): ProposedPlanId {
  const seconds = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  if (seconds > PACK_DURATION_UPGRADE_THRESHOLDS_SECONDS.overTwentyMinutes) {
    return 'forever-legacy';
  }
  if (seconds > PACK_DURATION_UPGRADE_THRESHOLDS_SECONDS.overTenMinutes) {
    return 'life-story';
  }
  return 'memorial-tribute';
}

export function upgradeReasonForDurationSeconds(durationSeconds: number): PackDurationUpgradeReason {
  const required = requiredConsumerPackForDurationSeconds(durationSeconds);
  if (required === 'forever-legacy') {
    return 'over_twenty_minutes';
  }
  if (required === 'life-story') {
    return 'over_ten_minutes';
  }
  return 'within_allowance';
}

export function nextConsumerPack(planId: ProposedPlanId): ProposedPlanId | null {
  const index = planTier(planId);
  if (index < 0 || index >= PLAN_ORDER.length - 1) {
    return null;
  }
  return PLAN_ORDER[index + 1] ?? null;
}

/**
 * Resolve the pack to present/select for a finished film.
 * Auto-moves upward when duration crosses 10:00 or 20:00; never silently charges
 * (checkout stays stripe_not_wired until paid SKUs exist).
 */
export function resolvePackForFilmDuration(input: {
  filmDurationSeconds: number;
  /** Family’s previously selected pack, if any. */
  selectedPlanId?: ProposedPlanId | null;
}): PackDurationRecommendation {
  const filmDurationSeconds = Number.isFinite(input.filmDurationSeconds)
    ? Math.max(0, input.filmDurationSeconds)
    : 0;
  const requiredPlanId = requiredConsumerPackForDurationSeconds(filmDurationSeconds);
  const requiredPlan = requirePlan(requiredPlanId);
  const reason = upgradeReasonForDurationSeconds(filmDurationSeconds);

  const prior =
    input.selectedPlanId && proposedPlanById(input.selectedPlanId)
      ? input.selectedPlanId
      : null;

  let selectedPlanId = requiredPlanId;
  let autoUpgraded = false;
  let previousPlanId: ProposedPlanId | null = null;

  if (prior) {
    if (planTier(prior) < planTier(requiredPlanId)) {
      selectedPlanId = requiredPlanId;
      autoUpgraded = true;
      previousPlanId = prior;
    } else {
      selectedPlanId = prior;
    }
  } else if (reason !== 'within_allowance') {
    // No prior selection: still surface that duration stepped the default pack up.
    autoUpgraded = true;
    previousPlanId = 'memorial-tribute';
  }

  const selectedPlan = requirePlan(selectedPlanId);
  const topCapSeconds = PACK_FILM_MINUTE_CAPS['forever-legacy'] * 60;

  return {
    requiredPlanId,
    requiredPlan,
    selectedPlanId,
    selectedPlan,
    filmDurationSeconds,
    filmDurationMinutes: filmDurationSeconds / 60,
    reason,
    autoUpgraded,
    previousPlanId,
    exceedsTopTierAllowance: filmDurationSeconds > topCapSeconds,
    checkoutBlock: 'stripe_not_wired',
  };
}

export function consumerPackAllowanceSeconds(planId: ProposedPlanId): number {
  return PACK_FILM_MINUTE_CAPS[planId] * 60;
}

export function filmExceedsPackAllowance(
  filmDurationSeconds: number,
  planId: ProposedPlanId,
): boolean {
  return filmDurationSeconds > consumerPackAllowanceSeconds(planId);
}

/** Ordered commercial packs for UI (same as approved pricing). */
export function orderedConsumerPacks(): readonly ProposedPlan[] {
  return PROPOSED_CONSUMER_PLANS;
}
