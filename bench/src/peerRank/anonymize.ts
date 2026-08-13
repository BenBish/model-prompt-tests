/** Labels used for anonymized peer responses (A, B, C, …). */
export function labelForIndex(index: number): string {
  if (index < 0 || index >= 26) {
    throw new Error(`peer-rank supports at most 26 candidates; got index ${index}`);
  }
  return String.fromCharCode("A".charCodeAt(0) + index);
}

export interface AnonymizedPeer {
  label: string;
  modelId: string;
  outputText: string;
}

export interface Anonymization {
  /** Label → model id (for deanonymization after ranking). */
  labelToModelId: Record<string, string>;
  /** Ordered peers as presented to the ranker (labels A.. in presentation order). */
  peers: AnonymizedPeer[];
}

/**
 * Assign shuffled labels A/B/C… to candidates so the ranker cannot see brand identity.
 * Each call should use a fresh shuffle (pass a custom `random` in tests).
 */
export function anonymizePeers(
  candidates: { modelId: string; outputText: string }[],
  random: () => number = Math.random,
): Anonymization {
  if (candidates.length < 2) {
    throw new Error(`peer-rank requires at least 2 candidates; got ${candidates.length}`);
  }
  if (candidates.length > 26) {
    throw new Error(`peer-rank supports at most 26 candidates; got ${candidates.length}`);
  }

  const shuffled = [...candidates];
  // Fisher–Yates
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  const peers: AnonymizedPeer[] = shuffled.map((c, index) => ({
    label: labelForIndex(index),
    modelId: c.modelId,
    outputText: c.outputText,
  }));

  const labelToModelId: Record<string, string> = {};
  for (const peer of peers) {
    labelToModelId[peer.label] = peer.modelId;
  }

  return { labelToModelId, peers };
}

/** Map a best-first label ranking to model ids using the label mapping. */
export function deanonymizeRanking(
  rankingLabels: string[],
  labelToModelId: Record<string, string>,
): string[] {
  return rankingLabels.map((label) => {
    const modelId = labelToModelId[label];
    if (!modelId) {
      throw new Error(`unknown ranking label "${label}" (not in label mapping)`);
    }
    return modelId;
  });
}
