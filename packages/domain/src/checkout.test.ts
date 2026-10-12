import { describe, expect, it } from 'vitest';

import { parseCheckoutRequest, planCheckoutStart, shouldGrantEntitlement } from './checkout';

describe('checkout', () => {
  it('rejects preview as a paid package', () => {
    expect(() =>
      parseCheckoutRequest({
        orderId: 'order-001',
        packageKey: 'preview',
        successUrl: 'https://memorialvideo.app/ok',
        cancelUrl: 'https://memorialvideo.app/cancel',
      }),
    ).toThrow(/preview/);
  });

  it('grants entitlement only from a new completed payment event', () => {
    expect(
      shouldGrantEntitlement(
        { providerEventId: 'evt_1', orderId: 'order-001', type: 'checkout.completed' },
        new Set(),
      ),
    ).toBe(true);
    expect(
      shouldGrantEntitlement(
        { providerEventId: 'evt_1', orderId: 'order-001', type: 'checkout.completed' },
        new Set(['evt_1']),
      ),
    ).toBe(false);
    expect(
      shouldGrantEntitlement(
        { providerEventId: 'evt_2', orderId: 'order-001', type: 'checkout.failed' },
        new Set(),
      ),
    ).toBe(false);
  });

  it('allows local http return URLs and plans a Stripe session without PII', () => {
    const request = parseCheckoutRequest(
      {
        orderId: 'order-local-1',
        packageKey: 'ceremony',
        successUrl: 'http://127.0.0.1:3000/en/create',
        cancelUrl: 'http://localhost:3000/en/create',
      },
      { allowLocalHttp: true },
    );
    const planned = planCheckoutStart({ mode: 'stripe', request });
    expect(planned.action).toBe('stripe');
    if (planned.action === 'stripe') {
      expect(JSON.stringify(planned.session)).not.toMatch(/@|email/i);
      expect(planned.session.metadata.order_id).toBe('order-local-1');
    }
  });

  it('plans local fake checkout with order and package query params', () => {
    const request = parseCheckoutRequest(
      {
        orderId: 'order-local-2',
        packageKey: 'ceremony',
        successUrl: 'http://localhost:3000/en/create',
        cancelUrl: 'http://localhost:3000/en/pricing',
      },
      { allowLocalHttp: true },
    );
    const planned = planCheckoutStart({ mode: 'local_fake', request });
    expect(planned.action).toBe('local_fake');
    if (planned.action === 'local_fake') {
      expect(planned.checkoutUrl).toContain('/dev/checkout-fake?');
      expect(planned.checkoutUrl).toContain('orderId=order-local-2');
      expect(planned.checkoutUrl).toContain('packageKey=ceremony');
    }
  });
});
