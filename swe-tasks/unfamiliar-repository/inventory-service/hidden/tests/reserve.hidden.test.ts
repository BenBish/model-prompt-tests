import { beforeEach, expect, test } from "bun:test";
import { seed, getStock } from "../src/repositories/inventoryRepository";
import { handleReserve } from "../src/routes/inventory";

beforeEach(() => {
  seed([{ sku: "widget", available: 10, reserved: 0 }]);
});

test("reserving moves stock from available to reserved", () => {
  const result = handleReserve("widget", 4);
  expect(result).toEqual({ sku: "widget", available: 6, reserved: 4 });
  expect(getStock("widget")).toEqual({ sku: "widget", available: 6, reserved: 4 });
});

test("reserving more than available throws and leaves stock unchanged", () => {
  expect(() => handleReserve("widget", 11)).toThrow();
  expect(getStock("widget")).toEqual({ sku: "widget", available: 10, reserved: 0 });
});

test("reserving exactly the remaining stock leaves zero available", () => {
  handleReserve("widget", 10);
  expect(getStock("widget")).toEqual({ sku: "widget", available: 0, reserved: 10 });
});
