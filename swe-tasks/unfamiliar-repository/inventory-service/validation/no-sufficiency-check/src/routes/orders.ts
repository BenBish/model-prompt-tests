import { placeOrder } from "../services/orderService";

export function handlePlaceOrder(sku: string, quantity: number) {
  const order = placeOrder(sku, quantity);
  return { orderId: order.id, sku: order.sku, quantity: order.quantity };
}
