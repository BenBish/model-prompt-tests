import { expect, test } from "bun:test";
import { totalCents } from "../src/cart";

test("applies a valid coupon percent and rounds to whole cents", () => {
  const items = [{ sku: "a", priceCents: 333, quantity: 1 }];
  // 333 * 0.9 = 299.7 -> must round, not truncate to a fractional cent value.
  expect(totalCents(items, 10)).toBe(300);
});

test("rejects invalid coupon percentages", () => {
  const items = [{ sku: "a", priceCents: 1000, quantity: 1 }];
  expect(() => totalCents(items, -5)).toThrow();
  expect(() => totalCents(items, 150)).toThrow();
  expect(() => totalCents(items, Number.NaN)).toThrow();
});

test("treats an explicit 0% coupon as no discount, not a falsy no-op", () => {
  const items = [{ sku: "a", priceCents: 1000, quantity: 1 }];
  expect(totalCents(items, 0)).toBe(1000);
});
