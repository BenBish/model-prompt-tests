import { expect, test } from "bun:test";
import { debounce } from "../src/debounce";

test("only invokes the function once when called rapidly multiple times", async () => {
  let calls = 0;
  let lastArg: number | undefined;
  const debounced = debounce((n: number) => {
    calls++;
    lastArg = n;
  }, 20);
  debounced(1);
  debounced(2);
  debounced(3);
  await Bun.sleep(60);
  expect(calls).toBe(1);
  expect(lastArg).toBe(3);
});
