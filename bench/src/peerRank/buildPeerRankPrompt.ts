import type { AnonymizedPeer } from "./anonymize";

export function buildPeerRankSystemPrompt(): string {
  return [
    "You are an impartial evaluator comparing multiple anonymized answers to the same user prompt.",
    "The responses are labeled Response A, Response B, etc. — you do not know which model wrote which.",
    "Rank every response from best to worst on overall quality: accuracy, insight, completeness, and clarity.",
    "You must include every label exactly once in the ranking.",
    "Respond with a single JSON object only (no markdown fences).",
  ].join(" ");
}

export function buildPeerRankUserPrompt(
  originalPromptText: string,
  peers: AnonymizedPeer[],
): string {
  const sections = peers.map(
    (peer) => `### Response ${peer.label}\n\n${peer.outputText.trim()}`,
  );
  const labels = peers.map((p) => p.label).join(", ");
  return [
    "## Original user prompt",
    "",
    originalPromptText.trim(),
    "",
    "## Candidate responses (anonymized)",
    "",
    ...sections.flatMap((s, i) => (i === 0 ? [s] : ["", s])),
    "",
    "## Your task",
    "",
    `Rank all of these responses from best to worst. Labels present: ${labels}.`,
    'Return JSON of the form: {"ranking":["B","A","C"],"rationale":"brief justification"}',
    "where ranking is an array of labels best-first and includes every label exactly once.",
  ].join("\n");
}

export function peerRankJsonSchema(labels: string[]): {
  name: string;
  schema: Record<string, unknown>;
} {
  return {
    name: "submit_ranking",
    schema: {
      type: "object",
      properties: {
        ranking: {
          type: "array",
          items: { type: "string", enum: labels },
          minItems: labels.length,
          maxItems: labels.length,
        },
        rationale: { type: "string", minLength: 1 },
      },
      required: ["ranking", "rationale"],
      additionalProperties: false,
    },
  };
}
