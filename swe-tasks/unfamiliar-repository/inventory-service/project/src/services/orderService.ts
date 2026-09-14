import { checkAvailability } from "./inventoryService";
import { saveOrder } from "../repositories/orderRepository";
import { nextOrderId } from "../utils/id";
import type { Order } from "../types";

// Placeholder order flow: today this only checks availability, it does not yet reserve stock.
// See routes/orders.ts for how this is surfaced to callers.
export function placeOrder(sku: string, quantity: number): Order {
  const available = checkAvailability(sku);
  if (available < quantity) {
    throw new Error(`cannot place order for ${sku}: only ${available} available`);
  }
  const order: Order = { id: nextOrderId(), sku, quantity };
  saveOrder(order);
  return order;
}
