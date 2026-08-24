export type PromptOutcomeCategory =
  | "passed"
  | "candidate_failure"
  | "timeout"
  | "rate_limit"
  | "provider_error"
  | "connection_error"
  | "harness_error";

export const PROMPT_INFRASTRUCTURE_OUTCOMES = new Set<PromptOutcomeCategory>([
  "timeout",
  "rate_limit",
  "provider_error",
  "connection_error",
  "harness_error",
]);

interface ErrorWithStatus extends Error {
  status?: number;
}

/** Classify a failed prompt call without turning model-produced bad output into infrastructure. */
export function classifyPromptError(error: unknown): PromptOutcomeCategory {
  if (!(error instanceof Error)) return "harness_error";

  const status = (error as ErrorWithStatus).status ?? statusFromMessage(error.message);
  if (status === 429) return "rate_limit";
  if (status !== undefined && status >= 500) return "provider_error";

  if (error.name === "AbortError" || error.name === "TimeoutError" || /timed? out|timeout/i.test(error.message)) {
    return "timeout";
  }
  if (error instanceof TypeError || /ECONN|ENOTFOUND|fetch failed|network error|socket hang up/i.test(error.message)) {
    return "connection_error";
  }

  // These failures happen after a successful provider response: the candidate produced
  // an empty, malformed, or otherwise unusable answer, so they remain candidate outcomes.
  if (
    error instanceof SyntaxError ||
    /did not contain (?:a )?(?:text block|message content)|truncated during reasoning|empty (?:response|content)|malformed (?:response|output)/i.test(
      error.message,
    )
  ) {
    return "candidate_failure";
  }

  return "harness_error";
}

function statusFromMessage(message: string): number | undefined {
  const match = message.match(/error (\d{3}):/i);
  return match ? Number(match[1]) : undefined;
}
