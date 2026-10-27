/**
 * Public consumer packs. Glenn corrected these figures on 2026-10-27
 * (10 / 20 / 40 minutes; 120 / 250 / 500 uploads). Earlier 2026-10-25
 * sign-off used 8 / 150–700 and is superseded.
 * They are not PackageKey entitlements. A charge cannot complete while Stripe
 * webhooks are unwired; `purchasable` stays false for that reason.
 */
export const PRICING_OWNER_SIGNOFF = {
  date: '2026-10-27',
  owner: 'Glenn',
  status: 'approved',
} as const;

export const PRICING_PROPOSAL_STATUS = 'owner-approved' as const;

export type ProposedPlanId = 'memorial-tribute' | 'life-story' | 'forever-legacy';

export type ProposedPlan = {
  id: ProposedPlanId;
  amountEur: 29 | 49 | 79;
  /** Inclusive film-length allowance for this pack (minutes). */
  filmMinutes: 10 | 20 | 40;
  uploadCap: 120 | 250 | 500;
  displayName: string;
  recommended: boolean;
  purchasable: false;
};

export const PROPOSED_CONSUMER_PLANS: readonly ProposedPlan[] = [
  {
    id: 'memorial-tribute',
    amountEur: 29,
    filmMinutes: 10,
    uploadCap: 120,
    displayName: 'Memorial Tribute',
    recommended: false,
    purchasable: false,
  },
  {
    id: 'life-story',
    amountEur: 49,
    filmMinutes: 20,
    uploadCap: 250,
    displayName: 'Life Story',
    recommended: true,
    purchasable: false,
  },
  {
    id: 'forever-legacy',
    amountEur: 79,
    filmMinutes: 40,
    uploadCap: 500,
    displayName: 'Forever Legacy',
    recommended: false,
    purchasable: false,
  },
];

export function proposedPlanById(id: string): ProposedPlan | undefined {
  return PROPOSED_CONSUMER_PLANS.find((plan) => plan.id === id);
}

/** False while a charge cannot be completed. Owner approval does not turn this on. */
export function proposedPlansPurchasable(): boolean {
  return PROPOSED_CONSUMER_PLANS.some((plan) => plan.purchasable);
}

/** Approved public packs stop here until signed Stripe webhooks exist. */
export function approvedPackCheckoutBlock(packageKey: string): 'stripe_not_wired' | null {
  if (!proposedPlanById(packageKey)) {
    return null;
  }
  return 'stripe_not_wired';
}
