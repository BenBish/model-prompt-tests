/**
 * Machine-readable batch/experiment identity for a completed run, written to a file rather
 * than printed, so a consumer never has to regex the durable identity out of human-readable
 * stdout (BSH-223).
 */
export interface RunSummary {
  schemaVersion: 1;
  runBatchId: string;
  experimentId?: string;
}

export async function writeRunSummary(path: string, summary: RunSummary): Promise<void> {
  await Bun.write(path, `${JSON.stringify(summary, null, 2)}\n`);
}
