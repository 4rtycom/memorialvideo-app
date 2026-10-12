import { describe, expect, it } from 'vitest';

import { parseStripeCommerceEvent, planStripeCheckoutSession, stripeCheckoutConfigured } from './stripe-commerce';

describe('stripe commerce mapping', () => {
  it('plans a Memorial Pack Checkout Session without PII', () => {
    const session = planStripeCheckoutSession({
      orderId: 'ord_abcdef12',
      packageKey: 'ceremony',
      projectPublicId: 'mv_opaque_project',
      priceId: 'price_test_memorial',
      successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
      integrationSuffix: 'abcdefgh',
    });
    expect(session.mode).toBe('payment');
    expect(session.line_items).toEqual([{ price: 'price_test_memorial', quantity: 1 }]);
    expect(session.metadata).toEqual({
      order_id: 'ord_abcdef12',
      package_key: 'ceremony',
      project_public_id: 'mv_opaque_project',
    });
    expect(JSON.stringify(session)).not.toMatch(/email|@|sk_live|whsec_/);
  });

  it('maps checkout.session.completed when payment_status is paid', () => {
    const parsed = parseStripeCommerceEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          client_reference_id: 'ord_abcdef12',
          payment_status: 'paid',
          metadata: {
            order_id: 'ord_abcdef12',
            package_key: 'ceremony',
            project_public_id: 'mv_opaque',
          },
        },
      },
    });
    expect(parsed).toMatchObject({
      ok: true,
      eventType: 'checkout.completed',
      orderId: 'ord_abcdef12',
      projectPublicId: 'mv_opaque',
    });
  });

  it('ignores unpaid completed sessions and unknown types', () => {
    expect(
      parseStripeCommerceEvent({
        id: 'evt_2',
        type: 'checkout.session.completed',
        data: { object: { metadata: { order_id: 'ord_x' }, payment_status: 'unpaid' } },
      }),
    ).toEqual({ ok: false, reason: 'ignored' });
    expect(parseStripeCommerceEvent({ id: 'evt_3', type: 'customer.created', data: { object: {} } })).toEqual({
      ok: false,
      reason: 'ignored',
    });
  });

  it('requires secret, webhook secret, and price_ id', () => {
    expect(
      stripeCheckoutConfigured({
        secretKey: 'sk_test_xxxxxxxxxx',
        webhookSecret: 'whsec_xxxxxxxxxx',
        priceId: 'price_abc',
      }),
    ).toBe(true);
    expect(
      stripeCheckoutConfigured({
        secretKey: 'sk_test_xxxxxxxxxx',
        webhookSecret: 'whsec_xxxxxxxxxx',
        priceId: undefined,
      }),
    ).toBe(false);
  });
});
