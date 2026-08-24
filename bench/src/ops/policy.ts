export interface RegressionPolicy {
  minimumCorrectness: number;
  maximumErrorRate: number;
  maximumTimeoutRate: number;
  maximumCostUsd: number;
  maximumMedianLatencyMs: number;
  minimumCoverage: number;
  minimumPairedSamples: number;
  maximumPairedRegression: number;
  requireHealthyGraders: boolean;
}

export interface RegressionEvidence {
  experimentId?: string;
  baselineExperimentId?: string;
  correctness?: number;
  errorRate?: number;
  timeoutRate?: number;
  costUsd?: number;
  medianLatencyMs?: number;
  coverage?: number;
  pairedSamples?: number;
  pairedDelta?: number;
  pairedConfidenceLow?: number;
  pairedConfidenceHigh?: number;
  graderHealth?: "healthy" | "unhealthy" | "missing";
}

export interface PolicyFinding {
  gate: string;
  status: "pass" | "fail" | "inconclusive";
  detail: string;
}

export interface PolicyResult {
  verdict: "pass" | "regression" | "inconclusive";
  findings: PolicyFinding[];
}

const finite = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value);

function threshold(gate: string, value: number | undefined, limit: number, operator: "min" | "max"): PolicyFinding {
  if (!finite(value)) return { gate, status: "inconclusive", detail: "required evidence is missing" };
  const pass = operator === "min" ? value >= limit : value <= limit;
  return { gate, status: pass ? "pass" : "fail", detail: `${value} ${operator === "min" ? ">=" : "<="} ${limit}` };
}

export function evaluateRegressionPolicy(policy: RegressionPolicy, evidence: RegressionEvidence): PolicyResult {
  const findings: PolicyFinding[] = [
    evidence.experimentId?.startsWith("exp_")
      ? { gate: "provenance", status: "pass", detail: evidence.experimentId }
      : { gate: "provenance", status: "inconclusive", detail: "immutable experiment id is missing" },
    evidence.baselineExperimentId?.startsWith("exp_")
      ? { gate: "baseline", status: "pass", detail: evidence.baselineExperimentId }
      : { gate: "baseline", status: "inconclusive", detail: "immutable baseline experiment id is missing" },
    threshold("correctness", evidence.correctness, policy.minimumCorrectness, "min"),
    threshold("error-rate", evidence.errorRate, policy.maximumErrorRate, "max"),
    threshold("timeout-rate", evidence.timeoutRate, policy.maximumTimeoutRate, "max"),
    threshold("cost", evidence.costUsd, policy.maximumCostUsd, "max"),
    threshold("latency", evidence.medianLatencyMs, policy.maximumMedianLatencyMs, "max"),
    threshold("coverage", evidence.coverage, policy.minimumCoverage, "min"),
  ];
  if (policy.requireHealthyGraders) {
    findings.push(evidence.graderHealth === "healthy"
      ? { gate: "grader-health", status: "pass", detail: "graders are healthy" }
      : { gate: "grader-health", status: "inconclusive", detail: `grader health is ${evidence.graderHealth ?? "missing"}` });
  }
  if (!finite(evidence.pairedSamples) || evidence.pairedSamples < policy.minimumPairedSamples) {
    findings.push({ gate: "paired-delta", status: "inconclusive", detail: `${evidence.pairedSamples ?? 0} paired samples; ${policy.minimumPairedSamples} required` });
  } else if (!finite(evidence.pairedDelta) || !finite(evidence.pairedConfidenceLow) || !finite(evidence.pairedConfidenceHigh)) {
    findings.push({ gate: "paired-delta", status: "inconclusive", detail: "paired delta/uncertainty is missing" });
  } else {
    const regression = evidence.pairedDelta < -policy.maximumPairedRegression && evidence.pairedConfidenceHigh < -policy.maximumPairedRegression;
    findings.push({ gate: "paired-delta", status: regression ? "fail" : "pass", detail: `delta ${evidence.pairedDelta}; confidence [${evidence.pairedConfidenceLow}, ${evidence.pairedConfidenceHigh}]` });
  }
  return {
    verdict: findings.some((finding) => finding.status === "fail") ? "regression" : findings.some((finding) => finding.status === "inconclusive") ? "inconclusive" : "pass",
    findings,
  };
}
