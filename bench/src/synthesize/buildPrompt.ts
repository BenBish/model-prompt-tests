export interface SynthesisPeer {
  modelId: string;
  outputText: string;
}

export function buildSynthesisSystemPrompt(): string {
  return [
    "You are the chairman of a multi-model council.",
    "You will be given the original user task and several candidate answers, each labeled with its model id.",
    "Optional peer-ranking context (best-first) may also be provided — treat it as a hint, not ground truth.",
    "Write one best combined answer for a human reader. Prefer accuracy, completeness, and the original constraints.",
    "Cite which candidate model ids you drew from. Do not invent sources.",
    "This is answer production, not grading. Do not assign rubric scores.",
  ].join(" ");
}

export function buildSynthesisUserPrompt(
  originalPromptText: string,
  peers: SynthesisPeer[],
  peerRankOrder?: string[],
): string {
  const answers = peers
    .map(
      (peer) =>
        `### Candidate \`${peer.modelId}\`\n\n${peer.outputText.trim() || "(empty)"}`,
    )
    .join("\n\n");

  const rankBlock =
    peerRankOrder && peerRankOrder.length > 0
      ? `\n\nPeer ranking (best first, optional hint):\n${peerRankOrder.map((id, i) => `${i + 1}. \`${id}\``).join("\n")}`
      : "";

  return `Original task:\n\n${originalPromptText}\n\nCandidate answers:\n\n${answers}${rankBlock}\n\nReturn a JSON object with "answer" (the synthesized response) and "provenance" ({ "usedModelIds": string[], "notes": string }).`;
}

export function synthesisJsonSchema(): { name: string; schema: Record<string, unknown> } {
  return {
    name: "chairman_synthesis",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["answer", "provenance"],
      properties: {
        answer: { type: "string" },
        provenance: {
          type: "object",
          additionalProperties: false,
          required: ["usedModelIds", "notes"],
          properties: {
            usedModelIds: { type: "array", items: { type: "string" } },
            notes: { type: "string" },
          },
        },
      },
    },
  };
}

export interface ValidatedSynthesis {
  answer: string;
  usedModelIds: string[];
  notes: string;
}

export function validateSynthesisResult(
  raw: unknown,
  allowedModelIds: string[],
): ValidatedSynthesis | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.answer !== "string" || rec.answer.trim() === "") return undefined;
  const provenance = rec.provenance;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
    return undefined;
  }
  const prov = provenance as Record<string, unknown>;
  if (!Array.isArray(prov.usedModelIds) || !prov.usedModelIds.every((id) => typeof id === "string")) {
    return undefined;
  }
  if (typeof prov.notes !== "string") return undefined;

  const allowed = new Set(allowedModelIds);
  const usedModelIds = (prov.usedModelIds as string[]).filter((id) => allowed.has(id));

  return {
    answer: rec.answer.trim(),
    usedModelIds,
    notes: prov.notes.trim(),
  };
}
