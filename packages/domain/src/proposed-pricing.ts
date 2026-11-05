/**
 * Public consumer packs. Glenn corrected these figures on 2026-10-27
 * (10 / 20 / 40 minutes; 120 / 250 / 500 uploads). Earlier 2026-10-25
 * sign-off used 8 / 150–700 and is superseded.
 * They are not PackageKey entitlements — paid checkout grants the Memorial Pack
 * (`ceremony`) entitlement and records the selected consumer pack tier.
 * Runtime still requires Stripe secrets + per-pack Price IDs (honest XB-005).
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
  /** Code path supports purchase; live charge still needs Stripe env (XB-005). */
  purchasable: true;
};

export const PROPOSED_CONSUMER_PLANS: readonly ProposedPlan[] = [
  {
    id: 'memorial-tribute',
    amountEur: 29,
    filmMinutes: 10,
    uploadCap: 120,
    displayName: 'Memorial Tribute',
    recommended: false,
    purchasable: true,
  },
  {
    id: 'life-story',
    amountEur: 49,
    filmMinutes: 20,
    uploadCap: 250,
    displayName: 'Life Story',
    recommended: true,
    purchasable: true,
  },
  {
    id: 'forever-legacy',
    amountEur: 79,
    filmMinutes: 40,
    uploadCap: 500,
    displayName: 'Forever Legacy',
    recommended: false,
    purchasable: true,
  },
];

export function proposedPlanById(id: string): ProposedPlan | undefined {
  return PROPOSED_CONSUMER_PLANS.find((plan) => plan.id === id);
}

/** True when pack SKUs are modeled as purchasable in domain (runtime Stripe env separate). */
export function proposedPlansPurchasable(): boolean {
  return PROPOSED_CONSUMER_PLANS.some((plan) => plan.purchasable);
}

/**
 * Artificial `stripe_not_wired` block removed (MV-AUD-001 / Gate A).
 * Missing Stripe secrets surface as `stripe_not_configured` at the checkout route.
 */
export function approvedPackCheckoutBlock(_packageKey: string): null {
  return null;
}
