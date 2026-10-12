import { NextResponse } from 'next/server';

import { creatorEnv } from '@/server/env';
import {
  handleStripeWebhookPayload,
  isStripeMemorialPackConfigured,
  verifyStripeSignature,
} from '@/server/stripe-checkout';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Stripe webhook → Memorial Pack entitlement (idempotent).
 * Browser redirect alone never grants paid COMPLETE.
 */
export async function POST(request: Request) {
  const env = creatorEnv();
  if (!env.STRIPE_WEBHOOK_SECRET || !isStripeMemorialPackConfigured(env)) {
    return noStore(
      {
        error: 'stripe_not_configured',
        stripeConfigured: false,
        blockers: { xb005_stripe: true },
        retryable: true,
      },
      503,
    );
  }
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  if (!verifyStripeSignature({ payload, signatureHeader: signature, secret: env.STRIPE_WEBHOOK_SECRET })) {
    return noStore({ error: 'invalid_signature' }, 400);
  }
  const result = await handleStripeWebhookPayload(payload);
  if ('ignored' in result) {
    return noStore({ ignored: true });
  }
  if ('error' in result) {
    return noStore({ error: result.error }, result.status);
  }
  return noStore(result);
}
