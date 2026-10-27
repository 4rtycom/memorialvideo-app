import { NextResponse } from 'next/server';

import {
  approvedPackCheckoutBlock,
  checkoutProviderMode,
  MEMORIAL_PACK_PACKAGE_KEY,
  parseCheckoutRequest,
  planCheckoutStart,
  proposedPlanById,
} from '@memorialvideo/domain';

import { creatorEnv } from '@/server/env';
import { allowRequest } from '@/server/rate-limit';
import { loadActiveTribute } from '@/server/session';
import {
  isStripeMemorialPackConfigured,
  startStripeMemorialPackCheckout,
  STRIPE_REQUIRED_ENV,
} from '@/server/stripe-checkout';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Memorial Pack checkout start.
 * - Stripe configured → Checkout Session URL (entitlement only via webhook).
 * - Local without Stripe → local_fake hint (use /api/checkout/local-fulfill).
 * - Otherwise → stripe_not_configured (XB-005), never fake paid COMPLETE.
 */
export async function POST(request: Request) {
  if (!allowRequest('creator-checkout', 10)) {
    return noStore({ error: 'rate_limited', retryable: true }, 429);
  }

  const env = creatorEnv();
  const stripeReady = isStripeMemorialPackConfigured(env);
  const mode = checkoutProviderMode({
    appEnv: env.APP_ENV,
    hasStripeSecret: stripeReady,
  });

  try {
    const payload = (await request.json()) as {
      projectPublicId?: string;
      orderId?: string;
      packageKey?: string;
      consumerPackId?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    // Approved consumer packs (Memorial Tribute / Life Story / Forever Legacy) stay unwired.
    const consumerPackId =
      typeof payload.consumerPackId === 'string' ? payload.consumerPackId : undefined;
    if (consumerPackId && proposedPlanById(consumerPackId)) {
      return noStore(
        {
          error: 'stripe_not_wired',
          checkoutBlock: approvedPackCheckoutBlock(consumerPackId),
          consumerPackId,
          mode: 'unavailable',
          stripeConfigured: false,
          retryable: true,
          note: 'Consumer pack selected and explained only — no silent charge while Stripe pack SKUs are unwired.',
        },
        503,
      );
    }
    if (payload.packageKey && proposedPlanById(payload.packageKey)) {
      return noStore(
        {
          error: 'stripe_not_wired',
          checkoutBlock: approvedPackCheckoutBlock(payload.packageKey),
          consumerPackId: payload.packageKey,
          mode: 'unavailable',
          stripeConfigured: false,
          retryable: true,
        },
        503,
      );
    }

    const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const checkout = parseCheckoutRequest(
      {
        orderId: payload.orderId,
        packageKey: payload.packageKey ?? MEMORIAL_PACK_PACKAGE_KEY,
        successUrl: payload.successUrl ?? `${origin}/share?checkout=success`,
        cancelUrl: payload.cancelUrl ?? `${origin}/share?checkout=cancel`,
      },
      { allowLocalHttp: env.APP_ENV === 'local' },
    );

    const planned = planCheckoutStart({ mode, request: checkout });

    if (planned.action === 'unavailable') {
      return noStore(
        {
          error: 'stripe_not_configured',
          mode: 'unavailable',
          stripeConfigured: false,
          retryable: true,
          blockers: { xb005_stripe: true },
          requiredEnv: [...STRIPE_REQUIRED_ENV],
        },
        503,
      );
    }

    if (planned.action === 'local_fake') {
      return noStore({
        mode: 'local_fake',
        orderId: checkout.orderId,
        packageKey: checkout.packageKey,
        useLocalFulfill: true,
        stripeConfigured: false,
        note: 'Local-only path. POST /api/checkout/local-fulfill grants Memorial Pack; not live paid COMPLETE.',
      });
    }

    if (!stripeReady) {
      return noStore(
        {
          error: 'stripe_not_configured',
          mode,
          stripeConfigured: false,
          retryable: true,
          blockers: { xb005_stripe: true },
          requiredEnv: [...STRIPE_REQUIRED_ENV],
        },
        503,
      );
    }

    let projectPublicId =
      typeof payload.projectPublicId === 'string' ? payload.projectPublicId.trim() : '';
    if (!projectPublicId) {
      const active = await loadActiveTribute();
      projectPublicId = active?.publicId ?? '';
    }
    if (!projectPublicId) {
      return noStore({ error: 'project_required', mode, retryable: false }, 400);
    }

    const started = await startStripeMemorialPackCheckout({
      orderId: checkout.orderId,
      projectPublicId,
      successUrl: checkout.successUrl,
      cancelUrl: checkout.cancelUrl,
    });
    if ('error' in started) {
      return noStore(
        {
          error: started.error,
          mode: 'stripe',
          stripeConfigured: true,
          retryable: Boolean(started.retryable),
          ...(started.error === 'stripe_not_configured'
            ? { blockers: { xb005_stripe: true }, requiredEnv: [...STRIPE_REQUIRED_ENV] }
            : {}),
        },
        started.status,
      );
    }
    return noStore(started);
  } catch {
    return noStore({ error: 'invalid', retryable: false }, 400);
  }
}
