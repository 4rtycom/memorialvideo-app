/**
 * Prompt 03 / XB-005 — Stripe Checkout + webhook mapping (pure rules).
 * No Stripe SDK; apps/web performs HTTP. Never log secrets or PII.
 */

import type { PackageKey } from '@memorialvideo/contracts';

import type { CommerceEventType } from './refund';

export type StripeCheckoutSessionPlan = {
  mode: 'payment';
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  line_items: Array<{ price: string; quantity: number }>;
  metadata: {
    order_id: string;
    package_key: PackageKey;
    project_public_id: string;
  };
  /** Stripe Dashboard tracking label; suffix should be random. */
  integration_identifier: string;
};

export function planStripeCheckoutSession(input: {
  orderId: string;
  packageKey: PackageKey;
  projectPublicId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  integrationSuffix: string;
}): StripeCheckoutSessionPlan {
  return {
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.orderId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    metadata: {
      order_id: input.orderId,
      package_key: input.packageKey,
      project_public_id: input.projectPublicId,
    },
    integration_identifier: `memorial-pack-${input.integrationSuffix.slice(0, 8)}`,
  };
}

export type ParsedStripeCommerceEvent =
  | {
      ok: true;
      providerEventId: string;
      eventType: CommerceEventType;
      orderId: string;
      projectPublicId: string | null;
      packageKey: string | null;
      paymentStatus: string | null;
      sessionId: string | null;
    }
  | { ok: false; reason: 'invalid' | 'ignored' };

/** Map Stripe event JSON → commerce domain event (no signature check here). */
export function parseStripeCommerceEvent(body: unknown): ParsedStripeCommerceEvent {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'invalid' };
  }
  const event = body as {
    id?: unknown;
    type?: unknown;
    data?: { object?: Record<string, unknown> };
  };
  if (typeof event.id !== 'string' || typeof event.type !== 'string') {
    return { ok: false, reason: 'invalid' };
  }
  const object = event.data?.object ?? {};
  const metadata =
    object.metadata && typeof object.metadata === 'object'
      ? (object.metadata as Record<string, unknown>)
      : {};
  const orderId =
    (typeof metadata.order_id === 'string' && metadata.order_id) ||
    (typeof metadata.orderId === 'string' && metadata.orderId) ||
    (typeof object.client_reference_id === 'string' && object.client_reference_id) ||
    null;
  const projectPublicId =
    (typeof metadata.project_public_id === 'string' && metadata.project_public_id) ||
    (typeof metadata.projectPublicId === 'string' && metadata.projectPublicId) ||
    null;
  const packageKey =
    (typeof metadata.package_key === 'string' && metadata.package_key) ||
    (typeof metadata.packageKey === 'string' && metadata.packageKey) ||
    null;
  const paymentStatus = typeof object.payment_status === 'string' ? object.payment_status : null;
  const sessionId = typeof object.id === 'string' ? object.id : null;

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (!orderId) {
      return { ok: false, reason: 'invalid' };
    }
    // Fulfill only when paid (or no status field on older fixtures).
    if (paymentStatus && paymentStatus !== 'paid') {
      return { ok: false, reason: 'ignored' };
    }
    return {
      ok: true,
      providerEventId: event.id,
      eventType: 'checkout.completed',
      orderId,
      projectPublicId,
      packageKey,
      paymentStatus,
      sessionId,
    };
  }
  if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    if (!orderId) {
      return { ok: false, reason: 'invalid' };
    }
    return {
      ok: true,
      providerEventId: event.id,
      eventType: event.type === 'checkout.session.expired' ? 'checkout.cancelled' : 'checkout.failed',
      orderId,
      projectPublicId,
      packageKey,
      paymentStatus,
      sessionId,
    };
  }
  if (event.type === 'charge.refunded') {
    const refundOrder =
      orderId ||
      (typeof object.payment_intent === 'string' ? object.payment_intent : null) ||
      sessionId;
    if (!refundOrder) {
      return { ok: false, reason: 'invalid' };
    }
    return {
      ok: true,
      providerEventId: event.id,
      eventType: 'charge.refunded',
      orderId: refundOrder,
      projectPublicId,
      packageKey,
      paymentStatus,
      sessionId,
    };
  }
  if (event.type === 'charge.dispute.created') {
    const disputeOrder = orderId || sessionId;
    if (!disputeOrder) {
      return { ok: false, reason: 'invalid' };
    }
    return {
      ok: true,
      providerEventId: event.id,
      eventType: 'charge.dispute.created',
      orderId: disputeOrder,
      projectPublicId,
      packageKey,
      paymentStatus,
      sessionId,
    };
  }
  return { ok: false, reason: 'ignored' };
}

export function stripeCheckoutConfigured(input: {
  secretKey: string | undefined;
  webhookSecret: string | undefined;
  priceId: string | undefined;
}): boolean {
  return Boolean(
    input.secretKey &&
      input.secretKey.length >= 10 &&
      input.webhookSecret &&
      input.webhookSecret.length >= 10 &&
      input.priceId &&
      input.priceId.startsWith('price_'),
  );
}
