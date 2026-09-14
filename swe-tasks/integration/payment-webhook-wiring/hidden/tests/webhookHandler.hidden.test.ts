import { beforeEach, expect, test } from "bun:test";
import { seedOrder, getOrderStatus } from "../src/orderService";
import { handleWebhook } from "../src/webhookHandler";

function payload(type: string, orderId: string): string {
  return JSON.stringify({ type, data: { orderId } });
}

beforeEach(() => {
  seedOrder("order-succeeded", "pending");
  seedOrder("order-failed", "pending");
  seedOrder("order-refunded", "paid");
  seedOrder("order-unknown", "pending");
});

test("routes payment.succeeded to markPaid", () => {
  handleWebhook(payload("payment.succeeded", "order-succeeded"));
  expect(getOrderStatus("order-succeeded")).toBe("paid");
});

test("routes payment.failed to markFailed", () => {
  handleWebhook(payload("payment.failed", "order-failed"));
  expect(getOrderStatus("order-failed")).toBe("failed");
});

test("routes payment.refunded to markRefunded", () => {
  handleWebhook(payload("payment.refunded", "order-refunded"));
  expect(getOrderStatus("order-refunded")).toBe("refunded");
});

test("ignores unrecognized event types without throwing or changing status", () => {
  expect(() => handleWebhook(payload("payment.chargeback_warning", "order-unknown"))).not.toThrow();
  expect(getOrderStatus("order-unknown")).toBe("pending");
});
