import { describe, expect, test } from "bun:test";
import { validatePairedExperiment } from "./pairedExperiment";

const identity = { underlyingModel: "qwen", immutableRevision: "rev-1", provider: "local", backend: "llama.cpp", harnessVersion: "1", hermetic: true };
const entries: any[] = [
  { id: "raw-api", kind: "raw-api", systemUnderTest: { shared: identity } },
  { id: "codex", kind: "codex", models: { shared: "qwen" }, systemUnderTest: { shared: identity } },
];

describe("validatePairedExperiment", () => {
  test("accepts an exact hermetic 3-repeat raw/API agent pair", () => expect(validatePairedExperiment(entries, ["shared"], 3).kind).toBe("harness-effect"));
  test("rejects ambiguous aliases", () => expect(() => validatePairedExperiment(entries, ["a", "b"], 3)).toThrow("exactly one"));
  test("rejects fewer than three repeats", () => expect(() => validatePairedExperiment(entries, ["shared"], 2)).toThrow("3–5"));
  test("rejects placeholder immutable identities", () => {
    const changed = structuredClone(entries);
    for (const entry of changed) entry.systemUnderTest.shared.immutableRevision = "replace-with-upstream-revision";
    expect(() => validatePairedExperiment(changed, ["shared"], 3)).toThrow("placeholders are not evidence");
  });
  test("labels non-identical pairs as agent-system", () => {
    const changed = structuredClone(entries); changed[1].systemUnderTest.shared = { ...changed[1].systemUnderTest.shared, immutableRevision: "rev-2" };
    expect(validatePairedExperiment(changed, ["shared"], 3).kind).toBe("agent-system");
  });
});
