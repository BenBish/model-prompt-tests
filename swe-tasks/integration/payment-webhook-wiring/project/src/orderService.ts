export type OrderStatus = "pending" | "paid" | "failed" | "refunded";

const orderStatuses = new Map<string, OrderStatus>();

/** Existing, already-tested order status store. Do not modify. */
export function seedOrder(orderId: string, status: OrderStatus = "pending"): void {
  orderStatuses.set(orderId, status);
}

export function getOrderStatus(orderId: string): OrderStatus | undefined {
  return orderStatuses.get(orderId);
}

export function markPaid(orderId: string): void {
  orderStatuses.set(orderId, "paid");
}

export function markFailed(orderId: string): void {
  orderStatuses.set(orderId, "failed");
}

export function markRefunded(orderId: string): void {
  orderStatuses.set(orderId, "refunded");
}
