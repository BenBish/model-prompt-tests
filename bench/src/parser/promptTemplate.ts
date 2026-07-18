import { relative } from "node:path";
import type { PromptDefinition, RubricDimension, RubricEntry } from "../types";

export class PromptParseError extends Error {
  constructor(filePath: string, message: string) {
    super(`${filePath}: ${message}`);
    this.name = "PromptParseError";
  }
}

export function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headingRegex = /^##\s+(.+)$/gm;
  const matches = [...body.matchAll(headingRegex)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const heading = match[1]!.trim();
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : body.length;
    sections.set(heading, body.slice(start, end).trim());
  }

  return sections;
}

export function extractBullets(sectionBody: string | undefined): string[] {
  if (!sectionBody) return [];
  const bulletRegex = /^-\s+(.+)$/gm;
  return [...sectionBody.matchAll(bulletRegex)].map((m) => m[1]!.trim());
}

/** Extracts a ```text fenced block from a section, e.g. `## Prompt` or a SWE task's `## Task`. */
export function extractFencedText(
  filePath: string,
  sectionName: string,
  sectionBody: string | undefined,
): string {
  if (!sectionBody) {
    throw new PromptParseError(filePath, `missing required '## ${sectionName}' section`);
  }
  const fenceMatch = sectionBody.match(/```text\r?\n([\s\S]*?)\r?\n```/);
  if (!fenceMatch) {
    throw new PromptParseError(filePath, `'## ${sectionName}' section has no \`\`\`text fenced block`);
  }
  return fenceMatch[1]!;
}

function extractPromptText(filePath: string, sectionBody: string | undefined): string {
  return extractFencedText(filePath, "Prompt", sectionBody);
}

function extractRubric(filePath: string, sectionBody: string | undefined): RubricEntry[] {
  if (!sectionBody) {
    throw new PromptParseError(filePath, "missing required '## Scoring Rubric' section");
  }
  const rubricRegex = /^-\s+`(\d)`:\s*(.+)$/gm;
  const entries = [...sectionBody.matchAll(rubricRegex)].map((m) => ({
    score: Number(m[1]!) as RubricEntry["score"],
    description: m[2]!.trim(),
  }));

  const invalidScores = entries.filter((entry) => entry.score < 1 || entry.score > 5);
  if (invalidScores.length > 0) {
    throw new PromptParseError(
      filePath,
      `'## Scoring Rubric' contains invalid score(s): ${invalidScores
        .map((entry) => entry.score)
        .join(", ")}`,
    );
  }

  const scoresPresent = new Set(entries.map((e) => e.score));
  for (const required of [1, 2, 3, 4, 5]) {
    if (!scoresPresent.has(required as RubricEntry["score"])) {
      throw new PromptParseError(
        filePath,
        `'## Scoring Rubric' is missing an entry for score ${required}`,
      );
    }
  }
  if (entries.length !== scoresPresent.size) {
    throw new PromptParseError(filePath, "'## Scoring Rubric' contains duplicate scores");
  }

  return entries.sort((a, b) => b.score - a.score);
}

const DIMENSION_LINE_REGEX = /^-\s+`([a-z0-9-]+)`\s+\(weight\s+(\d+)\):\s*(.+)$/gm;
const MIN_DIMENSIONS = 2;
const MAX_DIMENSIONS = 5;

export function extractDimensions(
  filePath: string,
  sectionBody: string | undefined,
): RubricDimension[] | undefined {
  if (sectionBody === undefined) return undefined;

  const entries = [...sectionBody.matchAll(DIMENSION_LINE_REGEX)].map((m) => ({
    id: m[1]!,
    weight: Number(m[2]!),
    description: m[3]!.trim(),
  }));

  if (entries.length === 0) {
    throw new PromptParseError(
      filePath,
      "'## Scoring Dimensions' section has no entries matching '- `id` (weight N): description'",
    );
  }

  const invalidWeights = entries.filter((e) => e.weight < 1 || e.weight > 5);
  if (invalidWeights.length > 0) {
    throw new PromptParseError(
      filePath,
      `'## Scoring Dimensions' contains invalid weight(s): ${invalidWeights
        .map((e) => `${e.id}=${e.weight}`)
        .join(", ")} (must be 1-5)`,
    );
  }

  const ids = entries.map((e) => e.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new PromptParseError(filePath, "'## Scoring Dimensions' contains duplicate dimension ids");
  }

  if (entries.length < MIN_DIMENSIONS || entries.length > MAX_DIMENSIONS) {
    throw new PromptParseError(
      filePath,
      `'## Scoring Dimensions' must have between ${MIN_DIMENSIONS} and ${MAX_DIMENSIONS} entries, found ${entries.length}`,
    );
  }

  return entries;
}

function extractVariants(sectionBody: string | undefined): PromptDefinition["variants"] {
  if (!sectionBody) return undefined;

  const easier = sectionBody.match(/^-\s+Easier:\s*(.*)$/m)?.[1]?.trim();
  const harder = sectionBody.match(/^-\s+Harder:\s*(.*)$/m)?.[1]?.trim();
  const differentAngle = sectionBody.match(/^-\s+Different angle:\s*(.*)$/m)?.[1]?.trim();

  if (!easier && !harder && !differentAngle) return undefined;

  return {
    easier: easier || undefined,
    harder: harder || undefined,
    differentAngle: differentAngle || undefined,
  };
}

export async function parsePromptFile(
  filePath: string,
  repoRoot: string,
): Promise<PromptDefinition> {
  const raw = await Bun.file(filePath).text();

  const titleMatch = raw.match(/^#\s+(.+)$/m);
  if (!titleMatch) {
    throw new PromptParseError(filePath, "missing required H1 title (e.g. '# Prompt Title')");
  }

  const sections = splitSections(raw);

  const id = relative(repoRoot, filePath).replace(/\.md$/, "");

  return {
    id,
    filePath,
    title: titleMatch[1]!.trim(),
    promptText: extractPromptText(filePath, sections.get("Prompt")),
    whatThisTests: extractBullets(sections.get("What This Tests")),
    strongSignals: extractBullets(sections.get("Strong Answer Signals")),
    weakSignals: extractBullets(sections.get("Weak Answer Signals")),
    rubric: extractRubric(filePath, sections.get("Scoring Rubric")),
    dimensions: extractDimensions(filePath, sections.get("Scoring Dimensions")),
    variants: extractVariants(sections.get("Variants")),
    notes: sections.get("Notes")?.trim() || undefined,
  };
}
