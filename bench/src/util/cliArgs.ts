export function parsePositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

/** Returns the first id that appears more than once in the list, if any. */
export function findDuplicate(ids: string[]): string | undefined {
  return ids.find((id, index) => ids.indexOf(id) !== index);
}
