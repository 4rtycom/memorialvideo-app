/**
 * Public consumer packs. Glenn signed these figures on 2026-10-25.
 * They are not PackageKey entitlements. A charge cannot complete while Stripe
 * webhooks are unwired; `purchasable` stays false for that reason.
 */
export const PRICING_OWNER_SIGNOFF = {
  date: '2026-10-25',
  owner: 'Glenn',
  status: 'approved',
} as const;

export const PRICING_PROPOSAL_STATUS = 'owner-approved' as const;

export type ProposedPlanId = 'memorial-tribute' | 'life-story' | 'forever-legacy';

export type ProposedPlan = {
  id: ProposedPlanId;
  amountEur: 29 | 49 | 79;
  /** Inclusive film-length allowance for this pack (minutes). */
  filmMinutes: 8 | 20 | 40;
  uploadCap: 150 | 350 | 700;
  displayName: string;
  recommended: boolean;
  purchasable: false;
};

export const PROPOSED_CONSUMER_PLANS: readonly ProposedPlan[] = [
  {
    id: 'memorial-tribute',
    amountEur: 29,
    filmMinutes: 8,
    uploadCap: 150,
    displayName: 'Memorial Tribute',
    recommended: false,
    purchasable: false,
  },
  {
    id: 'life-story',
    amountEur: 49,
    filmMinutes: 20,
    uploadCap: 350,
    displayName: 'Life Story',
    recommended: true,
    purchasable: false,
  },
  {
    id: 'forever-legacy',
    amountEur: 79,
    filmMinutes: 40,
    uploadCap: 700,
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
