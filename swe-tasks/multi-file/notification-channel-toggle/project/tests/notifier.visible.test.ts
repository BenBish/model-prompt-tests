import { expect, test } from "bun:test";
import { normalizePreferences } from "../src/preferences";
import { dispatch } from "../src/notifier";

test("normalizes and dispatches email and push channels", () => {
  const prefs = normalizePreferences({ channels: ["email", "push"] });
  const results = dispatch(prefs, "hello");
  expect(results).toEqual([
    { channel: "email", delivered: true },
    { channel: "push", delivered: true },
  ]);
});

test("drops unknown channels but keeps known ones", () => {
  const prefs = normalizePreferences({ channels: ["email", "fax"] });
  expect(prefs.channels).toEqual(["email"]);
});
