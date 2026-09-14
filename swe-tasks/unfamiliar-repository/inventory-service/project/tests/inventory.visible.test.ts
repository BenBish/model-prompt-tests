import { beforeEach, expect, test } from "bun:test";
import { seed } from "../src/repositories/inventoryRepository";
import { handleAvailability, handleRestock } from "../src/routes/inventory";

beforeEach(() => {
  seed([{ sku: "widget", available: 10, reserved: 0 }]);
});

test("restock increases available stock", () => {
  const result = handleRestock("widget", 5);
  expect(result).toEqual({ sku: "widget", available: 15 });
});

test("availability reports current stock for a known sku", () => {
  expect(handleAvailability("widget")).toEqual({ sku: "widget", available: 10 });
});
