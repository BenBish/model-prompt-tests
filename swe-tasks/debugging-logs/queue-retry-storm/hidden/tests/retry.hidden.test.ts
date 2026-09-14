import { expect, test } from "bun:test";
import { withRetry } from "../src/retry";

test("waits for the backoff delay to resolve before making the next attempt", async () => {
  let sleepCalls = 0;
  let resolveSleep: (() => void) | undefined;
  const blockingSleep = (_ms: number) => {
    sleepCalls++;
    return new Promise<void>((resolve) => {
      resolveSleep = resolve;
    });
  };

  let attempts = 0;
  const promise = withRetry(
    async () => {
      attempts++;
      if (attempts < 2) throw new Error("transient");
      return "ok";
    },
    { baseDelayMs: 10, maxAttempts: 5 },
    blockingSleep,
  );

  // Let the event loop run a few ticks without ever resolving the backoff sleep.
  await new Promise((r) => setTimeout(r, 20));
  expect(sleepCalls).toBe(1);
  expect(attempts).toBe(1); // must still be blocked on the unresolved backoff delay

  resolveSleep?.();
  const result = await promise;
  expect(result).toBe("ok");
  expect(attempts).toBe(2);
});
