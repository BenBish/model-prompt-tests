import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "../db/client";
import { CALIBRATION_PROMPT_IDS, calibrationCalibrateCommand, calibrationRunCommand } from "./subset";
import { loadHumanLabels } from "./humanLabels";
import { calibrateFromDb } from "./compare";
import { renderCalibrationMarkdown } from "./renderReport";

export function printCalibrationSubset(): void {
  console.log("Calibration subset (BSH-151):");
  for (const id of CALIBRATION_PROMPT_IDS) {
    console.log(`  ${id}`);
  }
  console.log("\nReproduce:");
  console.log(`  ${calibrationRunCommand()}`);
  console.log(`  ${calibrationCalibrateCommand()}`);
}

export async function cmdCalibrate(
  repoRoot: string,
  values: Record<string, unknown>,
): Promise<void> {
  if (values.subset === true) {
    printCalibrationSubset();
    return;
  }

  const db = openDb(`${repoRoot}/bench/data/bench.sqlite`);
  const humanPath = values.human;
  const humanByKey =
    typeof humanPath === "string" && humanPath.trim() !== ""
      ? await loadHumanLabels(humanPath)
      : undefined;

  const result = calibrateFromDb(db, {
    runBatchId: typeof values.batch === "string" ? values.batch : undefined,
    allRuns: values["all-runs"] === true,
    humanByKey,
  });

  const markdown = renderCalibrationMarkdown(result);
  const out = values.out;
  if (typeof out === "string" && out.trim() !== "") {
    mkdirSync(dirname(out), { recursive: true });
    await Bun.write(out, markdown);
    console.log(`Calibration report written to ${out}`);
  } else {
    console.log(markdown);
  }

  console.log(
    `Compared ${result.groups.length} group(s); skipped ${result.skippedGroups}. ` +
      `Mean Spearman (peer vs judge): ${
        result.meanSpearmanPeerVsJudge === undefined ? "n/a" : result.meanSpearmanPeerVsJudge.toFixed(3)
      }. Recommendation: side signal only.`,
  );
}
