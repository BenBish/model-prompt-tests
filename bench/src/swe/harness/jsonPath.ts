/**
 * Walk a dotted path like `result` or `message.content` through a JSON value.
 * Returns undefined when any segment is missing.
 */
export function getJsonPath(value: unknown, path: string): unknown {
  if (!path) return value;
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Try to extract a final message string from CLI stdout using an optional resultPath.
 * Supports a single JSON object, or JSONL (uses the last parseable line that yields the path).
 * Falls back to the full stdout when nothing matches.
 */
export function extractMessageFromStdout(stdout: string, resultPath?: string): { message: string; parsed?: unknown } {
  const trimmed = stdout.trim();
  if (!trimmed) return { message: "" };

  // Whole-stdout JSON object.
  try {
    const obj = JSON.parse(trimmed) as unknown;
    if (resultPath) {
      const value = getJsonPath(obj, resultPath);
      if (typeof value === "string") return { message: value, parsed: obj };
      if (value !== undefined && value !== null) {
        return { message: typeof value === "string" ? value : JSON.stringify(value), parsed: obj };
      }
    } else if (typeof obj === "object" && obj !== null && "result" in (obj as object)) {
      const result = (obj as { result?: unknown }).result;
      if (typeof result === "string") return { message: result, parsed: obj };
    }
    if (!resultPath) return { message: trimmed, parsed: obj };
  } catch {
    // fall through to JSONL
  }

  // JSONL: walk lines newest-first for a hit on resultPath.
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let lastParsed: unknown;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]!) as unknown;
      lastParsed = obj;
      if (resultPath) {
        const value = getJsonPath(obj, resultPath);
        if (typeof value === "string" && value.length > 0) {
          return { message: value, parsed: obj };
        }
      } else if (typeof obj === "object" && obj !== null) {
        const record = obj as Record<string, unknown>;
        for (const key of ["result", "message", "last_agent_message", "content"]) {
          if (typeof record[key] === "string" && (record[key] as string).length > 0) {
            return { message: record[key] as string, parsed: obj };
          }
        }
      }
    } catch {
      // skip non-JSON lines
    }
  }

  return { message: trimmed, parsed: lastParsed };
}
