import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (!output) throw new Error("--output is required");
await mkdir(output, { recursive: true });
await writeFile(join(output, "results.json"), JSON.stringify({ status: "passed", metrics: { accuracy: 1 }, transcript: [{ role: "assistant", content: "fixture" }] }));
await writeFile(join(output, "runner.log"), "offline fixture completed\n");
console.log("fixture runner ok");
