import { expect, test } from "bun:test";
import { add } from "../src/add";

test("adds negative numbers and zero correctly", () => {
  expect(add(-1, -1)).toBe(-2);
  expect(add(0, 5)).toBe(5);
  expect(add(-3, 7)).toBe(4);
});
