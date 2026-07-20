import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BenchModelsConfig } from "../config/modelConfig";
import type { HarnessMatrixEntry } from "./harnessConfig";
import type { SweHarness } from "./harness/types";

export const DOCTOR_PROMPT =
  "Do not edit any files. Reply with exactly one word: pong";

export const DOCTOR_TIMEOUT_MS = 60_000;

export interface DoctorHarnessResult {
  harnessId: string;
  kind: string;
  available: boolean;
  availableReason?: string;
  modelAlias?: string;
  modelNative?: string;
  ok: boolean;
  finalMessagePreview?: string;
  exitCode?: number;
  timedOut?: boolean;
  latencyMs?: number;
  error?: string;
}

export interface CreateHarnessFn {
  (entry: HarnessMatrixEntry, modelsConfig: BenchModelsConfig): SweHarness;
}

/**
 * Probe each harness: availability, then a trivial run in a temp dir so JSON-shape
 * drift is caught early (`bench swe doctor`).
 */
export async function runSweDoctor(
  entries: HarnessMatrixEntry[],
  modelsConfig: BenchModelsConfig,
  createHarness: CreateHarnessFn,
  options: { timeoutMs?: number } = {},
): Promise<DoctorHarnessResult[]> {
  const timeoutMs = options.timeoutMs ?? DOCTOR_TIMEOUT_MS;
  const results: DoctorHarnessResult[] = [];

  for (const entry of entries) {
    let harness: SweHarness;
    try {
      harness = createHarness(entry, modelsConfig);
    } catch (err) {
      results.push({
        harnessId: entry.id,
        kind: entry.kind,
        available: false,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const availability = await harness.available();
    if (!availability.ok) {
      results.push({
        harnessId: entry.id,
        kind: entry.kind,
        available: false,
        availableReason: availability.reason,
        ok: false,
        error: availability.reason ?? "unavailable",
      });
      continue;
    }

    // Prefer a configured model alias when the harness has a map; raw-api needs a bench model.
    let modelAlias: string | undefined;
    let modelNative: string | undefined;
    if (entry.kind === "raw-api") {
      const firstModel = modelsConfig.models.find((m) => m.enabled !== false);
      if (!firstModel) {
        results.push({
          harnessId: entry.id,
          kind: entry.kind,
          available: true,
          ok: false,
          error: "no enabled models in bench/models.json for raw-api probe",
        });
        continue;
      }
      modelAlias = firstModel.id;
      modelNative = harness.resolveModel(firstModel.id);
    } else if ("models" in entry && entry.models) {
      modelAlias = Object.keys(entry.models)[0];
      modelNative = modelAlias ? harness.resolveModel(modelAlias) : undefined;
    }

    if (!modelAlias || !modelNative) {
      results.push({
        harnessId: entry.id,
        kind: entry.kind,
        available: true,
        ok: false,
        error: "no model alias available to probe this harness",
      });
      continue;
    }

    const workDir = mkdtempSync(join(tmpdir(), `bench-doctor-${entry.id}-`));
    try {
      const runResult = await harness.run({
        taskPrompt: DOCTOR_PROMPT,
        model: modelNative,
        workDir,
        timeoutMs,
      });
      const preview = runResult.finalMessage.trim().slice(0, 200);
      const ok = !runResult.timedOut && runResult.exitCode === 0;
      results.push({
        harnessId: entry.id,
        kind: entry.kind,
        available: true,
        modelAlias,
        modelNative,
        ok,
        finalMessagePreview: preview || "(empty)",
        exitCode: runResult.exitCode,
        timedOut: runResult.timedOut,
        latencyMs: Math.round(runResult.latencyMs),
        error: ok
          ? undefined
          : runResult.timedOut
            ? "timed out"
            : `exit code ${runResult.exitCode}`,
      });
    } catch (err) {
      results.push({
        harnessId: entry.id,
        kind: entry.kind,
        available: true,
        modelAlias,
        modelNative,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  return results;
}

export function formatDoctorReport(results: DoctorHarnessResult[]): string {
  const lines: string[] = ["SWE harness doctor:", ""];
  for (const r of results) {
    const status = r.ok ? "OK" : "FAIL";
    const modelPart = r.modelAlias ? ` model=${r.modelAlias}` : "";
    const avail = r.available ? "available" : `unavailable (${r.availableReason ?? "n/a"})`;
    lines.push(`[${status}] ${r.harnessId} (${r.kind}) — ${avail}${modelPart}`);
    if (r.finalMessagePreview) {
      lines.push(`  finalMessage: ${JSON.stringify(r.finalMessagePreview)}`);
    }
    if (r.latencyMs !== undefined) {
      lines.push(`  latencyMs: ${r.latencyMs}  exitCode: ${r.exitCode}  timedOut: ${r.timedOut}`);
    }
    if (r.error && !r.ok) {
      lines.push(`  error: ${r.error}`);
    }
    lines.push("");
  }
  const failed = results.filter((r) => !r.ok).length;
  lines.push(
    failed === 0
      ? `All ${results.length} harness(es) passed.`
      : `${failed}/${results.length} harness(es) failed.`,
  );
  return lines.join("\n");
}
