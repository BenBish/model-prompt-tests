import { expect, test } from "bun:test";
import { parseEvent } from "../src/paymentGateway";
import { getOrderStatus, markPaid, seedOrder } from "../src/orderService";

test("parseEvent extracts type and orderId from a valid payload", () => {
  const event = parseEvent(JSON.stringify({ type: "payment.succeeded", data: { orderId: "order-1" } }));
  expect(event).toEqual({ type: "payment.succeeded", orderId: "order-1" });
});

test("orderService tracks status transitions directly", () => {
  seedOrder("order-2", "pending");
  markPaid("order-2");
  expect(getOrderStatus("order-2")).toBe("paid");
});
