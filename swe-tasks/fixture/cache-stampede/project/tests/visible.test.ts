import { test, expect } from "bun:test";
import { AsyncCache } from "../src/cache";
test("caches", async () => {
  let n = 0;
  const c = new AsyncCache(10, () => 0);
  await c.get("x", async () => ++n);
  await c.get("x", async () => ++n);
  expect(n).toBe(1);
});
