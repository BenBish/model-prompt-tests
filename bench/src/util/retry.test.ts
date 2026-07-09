import { expect, test } from "bun:test";
import { withRetry } from "./retry";

test("does not retry unclassified configuration errors", async () => {
  let calls = 0;

  await expect(
    withRetry(
      async () => {
        calls++;
        throw new Error("missing configuration");
      },
      { attempts: 3, baseDelayMs: 1 },
    ),
  ).rejects.toThrow("missing configuration");

  expect(calls).toBe(1);
});

test("retries fetch-style network errors", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return "ok";
    },
    { attempts: 2, baseDelayMs: 1 },
  );

  expect(result).toBe("ok");
  expect(calls).toBe(2);
});
