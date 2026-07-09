const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string | undefined | null): string {
  if (!input) return "";
  return input.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]!);
}
