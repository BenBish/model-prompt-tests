import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { evaluateRegressionPolicy, type RegressionEvidence, type RegressionPolicy } from "./policy";
import { promoteBaseline } from "./baseline";
import { validateScheduleContract, type ScheduleContract } from "./schedule";

function json<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
function required(value: string | undefined, flag: string): string { if (!value) throw new Error(`missing --${flag}`); return value; }

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "gate") {
    const { values } = parseArgs({ args, options: { policy: { type: "string" }, evidence: { type: "string" }, out: { type: "string" } } });
    const result = evaluateRegressionPolicy(json<RegressionPolicy>(required(values.policy, "policy")), json<RegressionEvidence>(required(values.evidence, "evidence")));
    const output = `${JSON.stringify(result, null, 2)}\n`; if (values.out) await Bun.write(values.out, output); console.log(output.trim());
    if (result.verdict !== "pass") process.exitCode = result.verdict === "regression" ? 2 : 3;
  } else if (command === "validate-contract") {
    const { values } = parseArgs({ args, options: { contract: { type: "string" } } });
    const issues = validateScheduleContract(json<ScheduleContract>(required(values.contract, "contract")));
    console.log(JSON.stringify({ valid: issues.length === 0, issues }, null, 2)); if (issues.length) process.exitCode = 3;
  } else if (command === "promote-baseline") {
    const { values } = parseArgs({ args, options: { audit: { type: "string" }, suite: { type: "string" }, experiment: { type: "string" }, actor: { type: "string" }, reason: { type: "string" } } });
    promoteBaseline(required(values.audit, "audit"), { suite: required(values.suite, "suite"), experimentId: required(values.experiment, "experiment"), promotedAt: new Date().toISOString(), promotedBy: required(values.actor, "actor"), reason: required(values.reason, "reason") });
  } else throw new Error("usage: ops <gate|validate-contract|promote-baseline> ...");
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
