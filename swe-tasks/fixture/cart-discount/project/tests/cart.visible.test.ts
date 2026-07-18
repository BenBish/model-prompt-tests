import { expect, test } from "bun:test";
import { itemCount, totalCents } from "../src/cart";

test("totals item prices by quantity", () => {
  const items = [{ sku: "a", priceCents: 500, quantity: 2 }];
  expect(totalCents(items)).toBe(1000);
  expect(itemCount(items)).toBe(2);
});
