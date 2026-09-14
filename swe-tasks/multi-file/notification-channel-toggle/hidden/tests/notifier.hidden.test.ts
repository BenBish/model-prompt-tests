import { expect, test } from "bun:test";
import { normalizePreferences } from "../src/preferences";
import { dispatch } from "../src/notifier";

test("accepts sms as a valid channel end to end", () => {
  const prefs = normalizePreferences({ channels: ["sms"] });
  expect(prefs.channels).toEqual(["sms"]);
  const results = dispatch(prefs, "hello");
  expect(results).toEqual([{ channel: "sms", delivered: true }]);
});

test("still rejects genuinely unknown channels", () => {
  expect(() => normalizePreferences({ channels: ["fax", "telegram"] })).toThrow();
});

test("dispatches a mixed channel list including sms", () => {
  const prefs = normalizePreferences({ channels: ["email", "sms", "push"] });
  const results = dispatch(prefs, "hi");
  expect(results.map((r) => r.channel)).toEqual(["email", "sms", "push"]);
  expect(results.every((r) => r.delivered)).toBe(true);
});
