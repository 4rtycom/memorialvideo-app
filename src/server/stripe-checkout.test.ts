import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function sign(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000).toString()): string {
  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret);
  const digest = createHmac('sha256', secretBytes).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

const MOCK_SECRET = 'sk_test_mock_creator_checkout_key';
const MOCK_WEBHOOK = `whsec_${Buffer.from('creator_webhook_secret_value').toString('base64')}`;
const MOCK_PRICE = 'price_mock_memorial_pack_test';

describe('creator Stripe checkout surface', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-stripe-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_MEMORIAL_PACK_PRICE_ID;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_MEMORIAL_PACK_PRICE_ID;
    vi.resetModules();
  });

  it(
    'reports stripeConfigured false and stripe_not_configured when secrets absent',
    async () => {
      const stripe = await import('./stripe-checkout');
      expect(stripe.isStripeMemorialPackConfigured()).toBe(false);

      const { POST } = await import('../app/api/checkout/route');
      const response = await POST(
        new Request('http://127.0.0.1:3002/api/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            orderId: 'ord_unconfigured01',
            packageKey: 'ceremony',
            successUrl: 'http://127.0.0.1:3002/share?checkout=success',
            cancelUrl: 'http://127.0.0.1:3002/share?checkout=cancel',
          }),
        }),
      );
      // Local without Stripe → local_fake (honest; not paid COMPLETE)
      expect(response.status).toBe(200);
      const localBody = (await response.json()) as {
        mode?: string;
        useLocalFulfill?: boolean;
        stripeConfigured?: boolean;
      };
      expect(localBody.mode).toBe('local_fake');
      expect(localBody.useLocalFulfill).toBe(true);
      expect(localBody.stripeConfigured).toBe(false);

      process.env.APP_ENV = 'production';
      vi.resetModules();
      const prodCheckout = await import('../app/api/checkout/route');
      const unavailable = await prodCheckout.POST(
        new Request('http://127.0.0.1:3002/api/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            orderId: 'ord_unconfigured02',
            packageKey: 'ceremony',
            successUrl: 'https://example.com/share?checkout=success',
            cancelUrl: 'https://example.com/share?checkout=cancel',
          }),
        }),
      );
      expect(unavailable.status).toBe(503);
      const body = (await unavailable.json()) as {
        error?: string;
        stripeConfigured?: boolean;
        retryable?: boolean;
        blockers?: { xb005_stripe?: boolean };
      };
      expect(body.error).toBe('stripe_not_configured');
      expect(body.stripeConfigured).toBe(false);
      expect(body.retryable).toBe(true);
      expect(body.blockers?.xb005_stripe).toBe(true);

      const ready = await import('../app/api/health/ready/route');
      const readyRes = await ready.GET();
      const readyBody = (await readyRes.json()) as {
        stripeConfigured?: boolean;
        checkoutProviderMode?: string;
        blockers?: { xb005_stripe?: boolean };
      };
      expect(readyBody.stripeConfigured).toBe(false);
      expect(readyBody.checkoutProviderMode).toBe('unavailable');
      expect(readyBody.blockers?.xb005_stripe).toBe(true);
    },
    20_000,
  );

  it('creates Checkout Session with mocked Stripe and fulfills via signed webhook', async () => {
    process.env.STRIPE_SECRET_KEY = MOCK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = MOCK_WEBHOOK;
    process.env.STRIPE_MEMORIAL_PACK_PRICE_ID = MOCK_PRICE;
    process.env.APP_ENV = 'preview';

    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Stripe Pack Person' });
    expect(created.entitlement).toBeNull();

    const stripe = await import('./stripe-checkout');
    expect(stripe.isStripeMemorialPackConfigured()).toBe(true);

    const fetchFn = vi.fn(async () =>
      Response.json({
        id: 'cs_test_mock_session_1',
        url: 'https://checkout.stripe.com/c/pay/cs_test_mock_session_1',
      }),
    );

    const started = await stripe.startStripeMemorialPackCheckout(
      {
        orderId: 'ord_mock_stripe_01',
        projectPublicId: created.publicId,
        successUrl: 'https://example.com/share?checkout=success',
        cancelUrl: 'https://example.com/share?checkout=cancel',
      },
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(started).toMatchObject({
      mode: 'stripe',
      orderId: 'ord_mock_stripe_01',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_mock_session_1',
    });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [sessionUrl, sessionInit] = fetchFn.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(String(sessionUrl)).toContain('api.stripe.com/v1/checkout/sessions');
    expect(sessionInit.headers.Authorization).toBe(`Bearer ${MOCK_SECRET}`);

    // Entitlement not granted until webhook
    const before = await store.getTribute(created.publicId);
    expect(before?.entitlement).toBeNull();

    const eventPayload = JSON.stringify({
      id: 'evt_mock_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_mock_session_1',
          payment_status: 'paid',
          client_reference_id: 'ord_mock_stripe_01',
          metadata: {
            order_id: 'ord_mock_stripe_01',
            package_key: 'ceremony',
            project_public_id: created.publicId,
          },
        },
      },
    });

    const { POST: webhookPost } = await import('../app/api/checkout/webhook/route');
    const badSig = await webhookPost(
      new Request('http://127.0.0.1:3002/api/checkout/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=deadbeef' },
        body: eventPayload,
      }),
    );
    expect(badSig.status).toBe(400);

    const good = await webhookPost(
      new Request('http://127.0.0.1:3002/api/checkout/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': sign(eventPayload, MOCK_WEBHOOK) },
        body: eventPayload,
      }),
    );
    expect(good.status).toBe(200);
    const goodBody = (await good.json()) as { ok?: boolean; orderStatus?: string };
    expect(goodBody.ok).toBe(true);
    expect(goodBody.orderStatus).toBe('PAID');

    const after = await store.getTribute(created.publicId);
    expect(after?.entitlement?.packageKey).toBe('ceremony');
    expect(after?.entitlement?.source).toBe('stripe');
    expect(store.entitlementView(after).active).toBe(true);
    expect(store.entitlementView(after).allowsPrivatePlayback).toBe(true);

    // Idempotent replay
    const replay = await webhookPost(
      new Request('http://127.0.0.1:3002/api/checkout/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': sign(eventPayload, MOCK_WEBHOOK) },
        body: eventPayload,
      }),
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { duplicate?: boolean; orderStatus?: string };
    expect(replayBody.duplicate).toBe(true);
    expect(replayBody.orderStatus).toBe('PAID');
  });

  it('keeps local_fake fulfill available in APP_ENV=local without claiming stripe', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Local Pack' });
    const granted = await store.fulfillLocalMemorialPack(created.publicId);
    expect(granted.ok).toBe(true);
    if (!granted.ok) {
      return;
    }
    expect(granted.tribute.entitlement?.source).toBe('local_fake');
    expect(store.entitlementView(granted.tribute).source).toBe('local_fake');
  });

  it('verifies Stripe HMAC signatures', async () => {
    const stripe = await import('./stripe-checkout');
    const payload = '{"id":"evt_sig"}';
    const now = Math.floor(Date.now() / 1000).toString();
    expect(
      stripe.verifyStripeSignature({
        payload,
        signatureHeader: sign(payload, MOCK_WEBHOOK, now),
        secret: MOCK_WEBHOOK,
      }),
    ).toBe(true);
    expect(
      stripe.verifyStripeSignature({
        payload,
        signatureHeader: `t=${now},v1=deadbeef`,
        secret: MOCK_WEBHOOK,
      }),
    ).toBe(false);
  });
});
