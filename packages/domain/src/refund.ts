export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED'
  | 'EXPIRED'
  | 'FAILED';

export type CommerceEventType =
  | 'checkout.completed'
  | 'checkout.failed'
  | 'checkout.cancelled'
  | 'charge.refunded'
  | 'charge.dispute.created';

export function nextOrderStatus(current: OrderStatus, event: CommerceEventType): OrderStatus {
  if (event === 'checkout.completed' && current === 'PENDING') {
    return 'PAID';
  }
  if (event === 'checkout.failed' && current === 'PENDING') {
    return 'FAILED';
  }
  if (event === 'checkout.cancelled' && current === 'PENDING') {
    return 'EXPIRED';
  }
  if (event === 'charge.refunded' && current === 'PAID') {
    return 'REFUNDED';
  }
  if (event === 'charge.dispute.created' && (current === 'PAID' || current === 'REFUNDED')) {
    return 'DISPUTED';
  }
  return current;
}

export function shouldRevokeEntitlement(status: OrderStatus): boolean {
  return status === 'REFUNDED' || status === 'DISPUTED' || status === 'FAILED' || status === 'EXPIRED';
}
