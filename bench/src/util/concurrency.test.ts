import { describe, expect, test } from "bun:test";
import { createLimiter } from "./concurrency";

describe("createLimiter", () => {
  test.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid concurrency %p",
    (maxConcurrent) => {
      expect(() => createLimiter(maxConcurrent)).toThrow(
        "maxConcurrent must be a positive integer",
      );
    },
  );
});
