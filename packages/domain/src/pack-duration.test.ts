import { describe, expect, it } from 'vitest';

import {
  PACK_DURATION_UPGRADE_THRESHOLDS_SECONDS,
  PACK_FILM_MINUTE_CAPS,
  filmExceedsPackAllowance,
  nextConsumerPack,
  requiredConsumerPackForDurationSeconds,
  resolvePackForFilmDuration,
  upgradeReasonForDurationSeconds,
} from './pack-duration';

describe('pack duration upgrade thresholds', () => {
  it('locks the 8-minute and 20-minute step points', () => {
    expect(PACK_DURATION_UPGRADE_THRESHOLDS_SECONDS.overEightMinutes).toBe(480);
    expect(PACK_DURATION_UPGRADE_THRESHOLDS_SECONDS.overTwentyMinutes).toBe(1200);
    expect(PACK_FILM_MINUTE_CAPS).toEqual({
      'memorial-tribute': 8,
      'life-story': 20,
      'forever-legacy': 40,
    });
  });

  it('keeps Memorial Tribute at exactly 8:00 and steps at +1s', () => {
    expect(requiredConsumerPackForDurationSeconds(0)).toBe('memorial-tribute');
    expect(requiredConsumerPackForDurationSeconds(8 * 60)).toBe('memorial-tribute');
    expect(requiredConsumerPackForDurationSeconds(8 * 60 + 1)).toBe('life-story');
    expect(upgradeReasonForDurationSeconds(8 * 60 + 1)).toBe('over_eight_minutes');
  });

  it('steps again over 20:00 toward Forever Legacy', () => {
    expect(requiredConsumerPackForDurationSeconds(20 * 60)).toBe('life-story');
    expect(requiredConsumerPackForDurationSeconds(20 * 60 + 1)).toBe('forever-legacy');
    expect(upgradeReasonForDurationSeconds(20 * 60 + 1)).toBe('over_twenty_minutes');
    expect(nextConsumerPack('memorial-tribute')).toBe('life-story');
    expect(nextConsumerPack('life-story')).toBe('forever-legacy');
    expect(nextConsumerPack('forever-legacy')).toBeNull();
  });

  it('auto-selects Life Story when duration crosses 8 minutes with no prior pack', () => {
    const result = resolvePackForFilmDuration({ filmDurationSeconds: 8 * 60 + 30 });
    expect(result.selectedPlanId).toBe('life-story');
    expect(result.requiredPlanId).toBe('life-story');
    expect(result.autoUpgraded).toBe(true);
    expect(result.previousPlanId).toBe('memorial-tribute');
    expect(result.reason).toBe('over_eight_minutes');
    expect(result.checkoutBlock).toBe('stripe_not_wired');
  });

  it('auto-moves from Tribute to Forever Legacy when duration crosses 20 minutes', () => {
    const result = resolvePackForFilmDuration({
      filmDurationSeconds: 21 * 60,
      selectedPlanId: 'memorial-tribute',
    });
    expect(result.selectedPlanId).toBe('forever-legacy');
    expect(result.autoUpgraded).toBe(true);
    expect(result.previousPlanId).toBe('memorial-tribute');
    expect(result.reason).toBe('over_twenty_minutes');
  });

  it('does not downgrade a higher voluntary selection', () => {
    const result = resolvePackForFilmDuration({
      filmDurationSeconds: 3 * 60,
      selectedPlanId: 'forever-legacy',
    });
    expect(result.selectedPlanId).toBe('forever-legacy');
    expect(result.requiredPlanId).toBe('memorial-tribute');
    expect(result.autoUpgraded).toBe(false);
    expect(result.reason).toBe('within_allowance');
  });

  it('flags films past the Forever Legacy marketing allowance without inventing a fourth tier', () => {
    const result = resolvePackForFilmDuration({ filmDurationSeconds: 45 * 60 });
    expect(result.selectedPlanId).toBe('forever-legacy');
    expect(result.exceedsTopTierAllowance).toBe(true);
    expect(filmExceedsPackAllowance(25 * 60, 'life-story')).toBe(true);
    expect(filmExceedsPackAllowance(20 * 60, 'life-story')).toBe(false);
  });
});
