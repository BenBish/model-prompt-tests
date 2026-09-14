import type { Order } from "../types";

const orders: Order[] = [];

export function saveOrder(order: Order): void {
  orders.push(order);
}

export function listOrders(): Order[] {
  return [...orders];
}
