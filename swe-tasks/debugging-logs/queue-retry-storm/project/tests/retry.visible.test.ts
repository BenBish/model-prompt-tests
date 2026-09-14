import { expect, test } from "bun:test";
import { withRetry } from "../src/retry";

test("retries a failing operation and eventually succeeds", async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "done";
    },
    { baseDelayMs: 1, maxAttempts: 5 },
  );
  expect(result).toBe("done");
  expect(attempts).toBe(3);
});

test("gives up after maxAttempts and rethrows", async () => {
  await expect(
    withRetry(
      async () => {
        throw new Error("permanent");
      },
      { baseDelayMs: 1, maxAttempts: 2 },
    ),
  ).rejects.toThrow("permanent");
});
