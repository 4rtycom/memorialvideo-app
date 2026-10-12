import { packageKeySchema, type PackageKey } from '@memorialvideo/contracts';

import { PACKAGE_POLICIES } from './entitlement';

export type CheckoutRequest = {
  orderId: string;
  packageKey: PackageKey;
  successUrl: string;
  cancelUrl: string;
};

export type PaymentEvent = {
  providerEventId: string;
  orderId: string;
  type: 'checkout.completed' | 'checkout.failed' | 'checkout.cancelled';
};

export function assertPaidPackage(packageKey: PackageKey): void {
  if (PACKAGE_POLICIES[packageKey].maxFinalRenders === 0) {
    throw new Error('preview cannot be purchased as a final package');
  }
}

function isAllowedReturnUrl(url: string, allowLocalHttp: boolean): boolean {
  if (url.startsWith('https://')) {
    return true;
  }
  return allowLocalHttp && (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost'));
}

export function parseCheckoutRequest(
  input: unknown,
  options: { allowLocalHttp?: boolean } = {},
): CheckoutRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('checkout request is required');
  }
  const value = input as Record<string, unknown>;
  const packageKey = packageKeySchema.parse(value.packageKey);
  assertPaidPackage(packageKey);
  if (typeof value.orderId !== 'string' || value.orderId.length < 8) {
    throw new Error('order id is required');
  }
  if (typeof value.successUrl !== 'string' || !isAllowedReturnUrl(value.successUrl, Boolean(options.allowLocalHttp))) {
    throw new Error('success url must be https');
  }
  if (typeof value.cancelUrl !== 'string' || !isAllowedReturnUrl(value.cancelUrl, Boolean(options.allowLocalHttp))) {
    throw new Error('cancel url must be https');
  }
  return {
    orderId: value.orderId,
    packageKey,
    successUrl: value.successUrl,
    cancelUrl: value.cancelUrl,
  };
}

export function planCheckoutStart(input: {
  mode: 'stripe' | 'local_fake' | 'unavailable';
  request: CheckoutRequest;
}):
  | { action: 'unavailable' }
  | { action: 'local_fake'; checkoutUrl: string }
  | {
      action: 'stripe';
      session: {
        mode: 'payment';
        success_url: string;
        cancel_url: string;
        client_reference_id: string;
        metadata: { order_id: string; package_key: string; project_public_id?: string };
      };
    } {
  if (input.mode === 'unavailable') {
    return { action: 'unavailable' };
  }
  if (input.mode === 'local_fake') {
    const params = new URLSearchParams({
      orderId: input.request.orderId,
      packageKey: input.request.packageKey,
      successUrl: input.request.successUrl,
      cancelUrl: input.request.cancelUrl,
    });
    return { action: 'local_fake', checkoutUrl: `/dev/checkout-fake?${params.toString()}` };
  }
  return {
    action: 'stripe',
    session: {
      mode: 'payment',
      success_url: input.request.successUrl,
      cancel_url: input.request.cancelUrl,
      client_reference_id: input.request.orderId,
      metadata: {
        order_id: input.request.orderId,
        package_key: input.request.packageKey,
      },
    },
  };
}

export function shouldGrantEntitlement(event: PaymentEvent, alreadyProcessedIds: ReadonlySet<string>): boolean {
  if (alreadyProcessedIds.has(event.providerEventId)) {
    return false;
  }
  return event.type === 'checkout.completed';
}
