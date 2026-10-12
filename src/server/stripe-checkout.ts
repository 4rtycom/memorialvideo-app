import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  MEMORIAL_PACK_PACKAGE_KEY,
  PACKAGE_POLICIES,
  parseStripeCommerceEvent,
  planStripeCheckoutSession,
  stripeCheckoutConfigured,
} from '@memorialvideo/domain';

import { creatorEnv } from './env';
import {
  applyStripeCheckoutCommerce,
  attachCheckoutSessionId,
  createPendingCheckoutOrder,
  getTribute,
} from './store';

export function isStripeMemorialPackConfigured(
  env: ReturnType<typeof creatorEnv> = creatorEnv(),
): boolean {
  return stripeCheckoutConfigured({
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    priceId: env.STRIPE_MEMORIAL_PACK_PRICE_ID,
  });
}

export const STRIPE_REQUIRED_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_MEMORIAL_PACK_PRICE_ID',
] as const;

/**
 * Verify Stripe-Signature header (HMAC-SHA256 over `${t}.${payload}`).
 * Supports `whsec_` secrets (Stripe standard).
 */
export function verifyStripeSignature(input: {
  payload: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
}): boolean {
  const parts = Object.fromEntries(
    input.signatureHeader.split(',').map((part) => {
      const [key, ...rest] = part.split('=');
      return [key, rest.join('=')];
    }),
  );
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) {
    return false;
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return false;
  }
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }
  const secretBytes = decodeStripeWebhookSecret(input.secret);
  const digest = createHmac('sha256', secretBytes).update(`${timestamp}.${input.payload}`).digest('hex');
  const left = Buffer.from(digest);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function decodeStripeWebhookSecret(secret: string): Buffer {
  if (secret.startsWith('whsec_')) {
    try {
      return Buffer.from(secret.slice('whsec_'.length), 'base64');
    } catch {
      return Buffer.from(secret);
    }
  }
  return Buffer.from(secret);
}

export type StripeCheckoutStartResult =
  | { checkoutUrl: string; orderId: string; mode: 'stripe' }
  | { error: string; status: number; retryable?: boolean };

/**
 * Create a PENDING order and a Stripe Checkout Session for Memorial Pack.
 * Does not grant entitlement — webhook does. Inject fetch for tests (no invented secrets).
 */
export async function startStripeMemorialPackCheckout(
  input: {
    orderId: string;
    projectPublicId: string;
    successUrl: string;
    cancelUrl: string;
  },
  deps: { fetchFn?: typeof fetch } = {},
): Promise<StripeCheckoutStartResult> {
  const env = creatorEnv();
  if (!isStripeMemorialPackConfigured(env)) {
    return { error: 'stripe_not_configured', status: 503, retryable: true };
  }
  const tribute = await getTribute(input.projectPublicId);
  if (!tribute) {
    return { error: 'not_found', status: 404 };
  }
  const policy = PACKAGE_POLICIES[MEMORIAL_PACK_PACKAGE_KEY];
  if (!policy || policy.maxFinalRenders === 0) {
    return { error: 'invalid', status: 400 };
  }

  const pending = await createPendingCheckoutOrder({
    orderId: input.orderId,
    projectPublicId: input.projectPublicId,
  });
  if (!pending.ok) {
    return { error: pending.reason, status: 404 };
  }
  if (pending.alreadyPaid) {
    return { error: 'already_paid', status: 409 };
  }

  const planned = planStripeCheckoutSession({
    orderId: input.orderId,
    packageKey: MEMORIAL_PACK_PACKAGE_KEY,
    projectPublicId: input.projectPublicId,
    priceId: env.STRIPE_MEMORIAL_PACK_PRICE_ID!,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    integrationSuffix: randomBytes(4).toString('hex'),
  });

  const body = new URLSearchParams();
  body.set('mode', planned.mode);
  body.set('success_url', planned.success_url);
  body.set('cancel_url', planned.cancel_url);
  body.set('client_reference_id', planned.client_reference_id);
  body.set('line_items[0][price]', planned.line_items[0]!.price);
  body.set('line_items[0][quantity]', String(planned.line_items[0]!.quantity));
  body.set('metadata[order_id]', planned.metadata.order_id);
  body.set('metadata[package_key]', planned.metadata.package_key);
  body.set('metadata[project_public_id]', planned.metadata.project_public_id);
  body.set('integration_identifier', planned.integration_identifier);

  const fetchFn = deps.fetchFn ?? fetch;
  const response = await fetchFn('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) {
    return { error: 'stripe_session_failed', status: 502, retryable: true };
  }
  const session = (await response.json()) as { id?: string; url?: string };
  if (!session.url || !session.id) {
    return { error: 'stripe_session_failed', status: 502, retryable: true };
  }
  await attachCheckoutSessionId(input.orderId, session.id);
  return { checkoutUrl: session.url, orderId: input.orderId, mode: 'stripe' };
}

export async function handleStripeWebhookPayload(payload: string): Promise<
  | { ok: true; orderStatus: string; duplicate?: boolean }
  | { ignored: true }
  | { error: string; status: number }
> {
  let body: unknown;
  try {
    body = JSON.parse(payload) as unknown;
  } catch {
    return { error: 'invalid', status: 400 };
  }
  const parsed = parseStripeCommerceEvent(body);
  if (!parsed.ok) {
    if (parsed.reason === 'ignored') {
      return { ignored: true };
    }
    return { error: 'invalid', status: 400 };
  }
  const applied = await applyStripeCheckoutCommerce({
    providerEventId: parsed.providerEventId,
    eventType: parsed.eventType,
    orderId: parsed.orderId,
    projectPublicId: parsed.projectPublicId,
    providerCheckoutId: parsed.sessionId,
  });
  if (!applied.ok) {
    return { error: applied.reason, status: applied.reason === 'not_found' ? 404 : 500 };
  }
  return { ok: true, orderStatus: applied.orderStatus, duplicate: applied.duplicate };
}
