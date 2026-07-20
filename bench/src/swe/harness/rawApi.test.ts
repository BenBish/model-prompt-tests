import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ModelAdapter } from "../../providers/types";
import type { RawApiHarnessConfig } from "../harnessConfig";
import { createRawApiHarness, type RawApiModelLookup } from "./rawApi";
import { runCommand } from "./runCommand";
import { buildHarnessEnv } from "./env";

const tempRoots: string[] = [];

async function makeGitRepo(files: Record<string, string>): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "bench-raw-api-"));
  tempRoots.push(root);
  for (const [relPath, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, relPath)), { recursive: true });
    writeFileSync(join(root, relPath), content);
  }
  const env = buildHarnessEnv();
  await runCommand({ cmd: ["git", "init", "-q", "-b", "main"], cwd: root, env, timeoutMs: 10_000 });
  await runCommand({ cmd: ["git", "add", "-A"], cwd: root, env, timeoutMs: 10_000 });
  await runCommand({
    cmd: ["git", "-c", "user.email=bench@test", "-c", "user.name=bench", "commit", "-q", "-m", "baseline"],
    cwd: root,
    env,
    timeoutMs: 10_000,
  });
  return root;
}

function lookupFor(adapter: ModelAdapter): RawApiModelLookup {
  return {
    resolveModel: (alias) => (alias === "test-model" ? "test-model" : undefined),
    getAdapter: (modelId) => (modelId === "test-model" ? adapter : undefined),
  };
}

function fakeAdapter(responses: string[]): { adapter: ModelAdapter; prompts: string[] } {
  const prompts: string[] = [];
  let call = 0;
  const adapter: ModelAdapter = {
    providerId: "test",
    modelName: "test-model",
    async call(input) {
      prompts.push(input.userPrompt);
      const text = responses[Math.min(call, responses.length - 1)]!;
      call++;
      return { text, raw: {}, latencyMs: 1 };
    },
  };
  return { adapter, prompts };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

const baseConfig: RawApiHarnessConfig = { id: "raw-api", kind: "raw-api" };

describe("createRawApiHarness", () => {
  test("resolveModel and available()", async () => {
    const { adapter } = fakeAdapter(["```diff\n```"]);
    const harness = createRawApiHarness(baseConfig, lookupFor(adapter));
    expect(harness.resolveModel("test-model")).toBe("test-model");
    expect(harness.resolveModel("nope")).toBeUndefined();
    expect(await harness.available()).toEqual({ ok: true });
  });

  test("applies a valid diff produced by the model", async () => {
    const workDir = await makeGitRepo({ "src/add.ts": "export function add(a, b) {\n  return a - b;\n}\n" });
    const diff = [
      "--- a/src/add.ts",
      "+++ b/src/add.ts",
      "@@ -1,3 +1,3 @@",
      " export function add(a, b) {",
      "-  return a - b;",
      "+  return a + b;",
      " }",
    ].join("\n");
    const { adapter, prompts } = fakeAdapter([`Here is the fix:\n\`\`\`diff\n${diff}\n\`\`\`\n`]);
    const harness = createRawApiHarness(baseConfig, lookupFor(adapter));

    const result = await harness.run({
      taskPrompt: "Fix the add function.",
      model: "test-model",
      workDir,
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.finalMessage).toBe("applied the model's diff");
    expect(await Bun.file(join(workDir, "src/add.ts")).text()).toContain("return a + b;");
    expect(prompts[0]).toContain("Fix the add function.");
    expect(prompts[0]).toContain("=== src/add.ts ===");
  });

  test("retries once with a corrective message when no diff fence is found", async () => {
    const workDir = await makeGitRepo({ "src/a.ts": "export const x = 1;\n" });
    const diff = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "-export const x = 1;", "+export const x = 2;"].join(
      "\n",
    );
    const { adapter, prompts } = fakeAdapter(["no fence here, sorry", `\`\`\`diff\n${diff}\n\`\`\``]);
    const harness = createRawApiHarness(baseConfig, lookupFor(adapter));

    const result = await harness.run({
      taskPrompt: "Bump x.",
      model: "test-model",
      workDir,
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(0);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("did not contain a valid");
    expect(await Bun.file(join(workDir, "src/a.ts")).text()).toContain("x = 2");
  });

  test("gives up after 2 attempts with no diff fence", async () => {
    const workDir = await makeGitRepo({ "src/a.ts": "x\n" });
    const { adapter } = fakeAdapter(["still no fence", "still no fence again"]);
    const harness = createRawApiHarness(baseConfig, lookupFor(adapter));

    const result = await harness.run({
      taskPrompt: "Do something.",
      model: "test-model",
      workDir,
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.finalMessage).toContain("did not produce a valid unified diff");
  });

  test("reports an apply failure without throwing", async () => {
    const workDir = await makeGitRepo({ "src/a.ts": "one\ntwo\nthree\n" });
    const badDiff = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "-this line does not exist", "+replacement"].join(
      "\n",
    );
    const { adapter } = fakeAdapter([`\`\`\`diff\n${badDiff}\n\`\`\``]);
    const harness = createRawApiHarness(baseConfig, lookupFor(adapter));

    const result = await harness.run({
      taskPrompt: "Do something.",
      model: "test-model",
      workDir,
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.finalMessage).toContain("diff failed to apply");
  });

  test("returns an error result for an unresolved model without throwing", async () => {
    const workDir = await makeGitRepo({ "a.ts": "x\n" });
    const { adapter } = fakeAdapter(["```diff\n```"]);
    const harness = createRawApiHarness(baseConfig, lookupFor(adapter));

    const result = await harness.run({
      taskPrompt: "x",
      model: "not-a-real-model",
      workDir,
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.finalMessage).toContain('unknown bench model id "not-a-real-model"');
  });

  test("omits files over the context budget and lists them in a manifest", async () => {
    const workDir = await makeGitRepo({
      "small.ts": "a",
      "big.ts": "b".repeat(1000),
    });
    const { adapter, prompts } = fakeAdapter(["```diff\n```"]);
    const harness = createRawApiHarness({ ...baseConfig, maxContextBytes: 10 }, lookupFor(adapter));

    await harness.run({ taskPrompt: "x", model: "test-model", workDir, timeoutMs: 5000 });

    expect(prompts[0]).toContain("=== small.ts ===");
    expect(prompts[0]).not.toContain("=== big.ts ===");
    expect(prompts[0]).toContain("omitted due to the context budget: big.ts");
  });
});
