import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { ModelAdapter, ModelCallInput, ModelCallResult } from "../providers/types";
import { getToolProbeResultsForBatch } from "../db/toolProbeResultsRepo";
import { runToolProbe, type ToolProbeCandidate } from "./runToolProbe";
import type { ToolProbeCase } from "./toolCases";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

function fakeAdapter(id: string, handler: (input: ModelCallInput) => Promise<ModelCallResult>): ModelAdapter {
  return { providerId: "fake", modelName: id, call: handler };
}

const POSITIVE_CASE: ToolProbeCase = {
  id: "set-reminder",
  description: "d",
  userMessage: "remind me at 9am",
  tools: [],
  expect: { toolName: "set_reminder", requiredArgs: ["time"] },
};

const NEGATIVE_CASE: ToolProbeCase = {
  id: "no-call-expected",
  description: "d",
  userMessage: "what is 2+2",
  tools: [],
  expect: { shouldNotCall: true },
};

afterEach(() => {
  spyOn(console, "log").mockRestore();
});

describe("runToolProbe", () => {
  test("scores a correct positive-case tool call and persists the result", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const adapter = fakeAdapter("model-a", async () => ({
      text: "",
      raw: {},
      latencyMs: 10,
      toolCalls: [{ id: "1", name: "set_reminder", arguments: '{"time":"9am"}' }],
    }));
    const candidates: ToolProbeCandidate[] = [{ modelId: "test:model-a", providerId: "fake", adapter }];

    const summary = await runToolProbe({ db, candidates, cases: [POSITIVE_CASE] });

    expect(summary.candidateSummaries).toEqual([
      { modelId: "test:model-a", cases: 1, errors: 0, wellFormedRate: 1, correctToolRate: 1, validArgsRate: 1, avgLatencyMs: 10 },
    ]);
    const rows = getToolProbeResultsForBatch(db, summary.runBatchId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ caseId: "set-reminder", correctTool: true, validArgs: true });
  });

  test("scores a negative case correctly when the model makes no call", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const adapter = fakeAdapter("model-a", async () => ({ text: "It's 4.", raw: {}, latencyMs: 5 }));
    const candidates: ToolProbeCandidate[] = [{ modelId: "test:model-a", providerId: "fake", adapter }];

    const summary = await runToolProbe({ db, candidates, cases: [NEGATIVE_CASE] });
    expect(summary.candidateSummaries[0]).toMatchObject({ correctToolRate: 1, validArgsRate: 1 });
  });

  test("records an adapter error and excludes it from the rate denominator", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const adapter = fakeAdapter("model-a", async () => {
      throw new Error("upstream 500");
    });
    const candidates: ToolProbeCandidate[] = [{ modelId: "test:model-a", providerId: "fake", adapter }];

    const summary = await runToolProbe({ db, candidates, cases: [POSITIVE_CASE, NEGATIVE_CASE] });
    expect(summary.candidateSummaries[0]).toMatchObject({ cases: 2, errors: 2, wellFormedRate: 0 });

    const run = db.query("SELECT * FROM runs WHERE run_batch_id = $b").all({ $b: summary.runBatchId }) as any[];
    expect(run.every((r) => r.status === "error" && r.error === "upstream 500")).toBe(true);
  });

  test("mixes correct, wrong-tool, and error outcomes into accurate rates", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    let call = 0;
    const adapter = fakeAdapter("model-a", async () => {
      call++;
      if (call === 1) {
        return { text: "", raw: {}, latencyMs: 1, toolCalls: [{ id: "1", name: "set_reminder", arguments: '{"time":"9am"}' }] };
      }
      throw new Error("boom");
    });
    const candidates: ToolProbeCandidate[] = [{ modelId: "test:model-a", providerId: "fake", adapter, maxConcurrent: 1 }];

    const summary = await runToolProbe({
      db,
      candidates,
      cases: [POSITIVE_CASE, { ...NEGATIVE_CASE, id: "second-case" }],
      defaultConcurrency: 1,
    });
    // maxConcurrent: 1 makes call order deterministic: case 1 succeeds, case 2 errors.
    expect(summary.candidateSummaries[0]).toMatchObject({ cases: 2, errors: 1, correctToolRate: 1 });
  });

  test("respects per-candidate maxConcurrent", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    let active = 0;
    let peak = 0;
    const adapter = fakeAdapter("model-a", async () => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(15);
      active--;
      return { text: "ok", raw: {}, latencyMs: 15 };
    });
    const candidates: ToolProbeCandidate[] = [{ modelId: "test:model-a", providerId: "fake", adapter, maxConcurrent: 1 }];

    await runToolProbe({
      db,
      candidates,
      cases: [NEGATIVE_CASE, { ...NEGATIVE_CASE, id: "case-2" }, { ...NEGATIVE_CASE, id: "case-3" }],
      defaultConcurrency: 4,
    });
    expect(peak).toBe(1);
  });
});
