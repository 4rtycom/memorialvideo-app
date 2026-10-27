import { PACKAGE_KEYS } from '@memorialvideo/contracts';
import { describe, expect, it } from 'vitest';

import {
  PRICING_OWNER_SIGNOFF,
  PROPOSED_CONSUMER_PLANS,
  approvedPackCheckoutBlock,
  proposedPlanById,
  proposedPlansPurchasable,
} from './proposed-pricing';

describe('approved consumer packs', () => {
  it('records Glenn’s 2026-10-27 corrected figures and still blocks a completed charge', () => {
    expect(PRICING_OWNER_SIGNOFF).toEqual({
      date: '2026-10-27',
      owner: 'Glenn',
      status: 'approved',
    });
    expect(PROPOSED_CONSUMER_PLANS.map((plan) => plan.amountEur)).toEqual([29, 49, 79]);
    expect(PROPOSED_CONSUMER_PLANS.map((plan) => plan.filmMinutes)).toEqual([10, 20, 40]);
    expect(PROPOSED_CONSUMER_PLANS.map((plan) => plan.uploadCap)).toEqual([120, 250, 500]);
    expect(PROPOSED_CONSUMER_PLANS.map((plan) => plan.displayName)).toEqual([
      'Memorial Tribute',
      'Life Story',
      'Forever Legacy',
    ]);
    expect(proposedPlansPurchasable()).toBe(false);
    for (const plan of PROPOSED_CONSUMER_PLANS) {
      expect(plan.purchasable).toBe(false);
      expect(PACKAGE_KEYS).not.toContain(plan.id);
      expect(approvedPackCheckoutBlock(plan.id)).toBe('stripe_not_wired');
    }
    expect(proposedPlanById('life-story')?.uploadCap).toBe(250);
    expect(proposedPlanById('not-a-plan')).toBeUndefined();
    expect(approvedPackCheckoutBlock('ceremony')).toBeNull();
  });
});
