import { relative } from "node:path";
import type { PromptDefinition, RubricEntry } from "../types";

class PromptParseError extends Error {
  constructor(filePath: string, message: string) {
    super(`${filePath}: ${message}`);
    this.name = "PromptParseError";
  }
}

function splitSections(body: string): Map<string, string> {
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

function extractBullets(sectionBody: string | undefined): string[] {
  if (!sectionBody) return [];
  const bulletRegex = /^-\s+(.+)$/gm;
  return [...sectionBody.matchAll(bulletRegex)].map((m) => m[1]!.trim());
}

function extractPromptText(filePath: string, sectionBody: string | undefined): string {
  if (!sectionBody) {
    throw new PromptParseError(filePath, "missing required '## Prompt' section");
  }
  const fenceMatch = sectionBody.match(/```text\n([\s\S]*?)\n```/);
  if (!fenceMatch) {
    throw new PromptParseError(filePath, "'## Prompt' section has no ```text fenced block");
  }
  return fenceMatch[1]!;
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

  const scoresPresent = new Set(entries.map((e) => e.score));
  for (const required of [1, 2, 3, 4, 5]) {
    if (!scoresPresent.has(required as RubricEntry["score"])) {
      throw new PromptParseError(
        filePath,
        `'## Scoring Rubric' is missing an entry for score ${required}`,
      );
    }
  }

  return entries.sort((a, b) => b.score - a.score);
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
    variants: extractVariants(sections.get("Variants")),
    notes: sections.get("Notes")?.trim() || undefined,
  };
}
