import { expect, test } from "bun:test";
import { debounce } from "../src/debounce";

test("calls the function once after the delay when invoked a single time", async () => {
  let calls = 0;
  const debounced = debounce(() => {
    calls++;
  }, 20);
  debounced();
  await Bun.sleep(60);
  expect(calls).toBe(1);
});
