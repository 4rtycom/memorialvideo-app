export type CheckoutProviderMode = 'stripe' | 'local_fake' | 'unavailable';

export function checkoutProviderMode(input: {
  appEnv: 'local' | 'preview' | 'staging' | 'production';
  hasStripeSecret: boolean;
}): CheckoutProviderMode {
  if (input.hasStripeSecret) {
    return 'stripe';
  }
  if (input.appEnv === 'local') {
    return 'local_fake';
  }
  return 'unavailable';
}

/**
 * Prompt 32 — fake Memorial Pack fulfillment must never run outside local.
 * Stripe webhooks are the only production entitlement path.
 */
export function canFulfillLocalFakeCheckout(appEnv: string): boolean {
  return appEnv === 'local';
}
