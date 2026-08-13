/**
 * Fixed prompt subset for peer-rank vs multi-judge calibration (BSH-151).
 *
 * Chosen to cover distinct lab axes without requiring `run all`:
 * instruction-following, technical correctness, risk judgment, and review taste.
 */
export const CALIBRATION_SELECTOR = "calibration";

export const CALIBRATION_PROMPT_IDS = [
  "instruction-following/five-bullet-summary",
  "debugging/javascript-debounce",
  "safety-risk/failed-production-migration",
  "code-review/senior-pr-review",
] as const;

export type CalibrationPromptId = (typeof CALIBRATION_PROMPT_IDS)[number];

export function isCalibrationSelector(selector: string): boolean {
  return selector === CALIBRATION_SELECTOR || selector === "calibrate-subset";
}

export function calibrationRunCommand(modelsPlaceholder = "<id1,id2,id3>", judgesPlaceholder = "<j1,j2>"): string {
  return (
    `bun run bench run ${CALIBRATION_SELECTOR}` +
    ` --models ${modelsPlaceholder}` +
    ` --judges ${judgesPlaceholder}` +
    ` --peer-rank`
  );
}

export function calibrationCalibrateCommand(batchPlaceholder = "<run_batch_id>"): string {
  return `bun run bench calibrate --batch ${batchPlaceholder} --out docs/peer-rank-calibration.md`;
}
