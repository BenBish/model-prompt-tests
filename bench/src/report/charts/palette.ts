// Reference palette per the dataviz skill (references/palette.md). Categorical
// order is the CVD-safety mechanism -- keep it fixed, never reorder or cycle.
export const CATEGORICAL_SLOTS = [
  { name: "blue", light: "#2a78d6", dark: "#3987e5" },
  { name: "aqua", light: "#1baf7a", dark: "#199e70" },
  { name: "yellow", light: "#eda100", dark: "#c98500" },
  { name: "green", light: "#008300", dark: "#008300" },
  { name: "violet", light: "#4a3aa7", dark: "#9085e9" },
  { name: "red", light: "#e34948", dark: "#e66767" },
  { name: "magenta", light: "#e87ba4", dark: "#d55181" },
  { name: "orange", light: "#eb6834", dark: "#d95926" },
] as const;

export const MUTED_SLOT = { light: "#898781", dark: "#898781" };

export const CHROME = {
  surface: { light: "#fcfcfb", dark: "#1a1a19" },
  page: { light: "#f9f9f7", dark: "#0d0d0d" },
  textPrimary: { light: "#0b0b0b", dark: "#ffffff" },
  textSecondary: { light: "#52514e", dark: "#c3c2b7" },
  textMuted: { light: "#898781", dark: "#898781" },
  gridline: { light: "#e1e0d9", dark: "#2c2c2a" },
  baseline: { light: "#c3c2b7", dark: "#383835" },
  divergingMid: { light: "#f0efec", dark: "#383835" },
} as const;

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Assigns each model id a fixed categorical slot (1-8), stable across every chart in the report. */
export function assignSeriesSlots(modelIds: string[]): Map<string, number> {
  const slots = new Map<string, number>();
  modelIds.forEach((modelId, index) => {
    slots.set(modelId, index < CATEGORICAL_SLOTS.length ? index + 1 : 0);
  });
  return slots;
}

export function seriesVar(slot: number): string {
  return slot === 0 ? "var(--series-other)" : `var(--series-${slot})`;
}

/** CSS custom-property block declaring every color role used by the charts, light + dark. */
export function paletteStyleBlock(): string {
  const seriesLight = CATEGORICAL_SLOTS.map((s, i) => `  --series-${i + 1}: ${s.light};`).join("\n");
  const seriesDark = CATEGORICAL_SLOTS.map((s, i) => `  --series-${i + 1}: ${s.dark};`).join("\n");
  return `
.viz-root {
  color-scheme: light;
  --chart-surface: ${CHROME.surface.light};
  --text-primary: ${CHROME.textPrimary.light};
  --text-secondary: ${CHROME.textSecondary.light};
  --text-muted: ${CHROME.textMuted.light};
  --gridline: ${CHROME.gridline.light};
  --baseline: ${CHROME.baseline.light};
  --diverging-mid: ${CHROME.divergingMid.light};
  --diverging-pos: ${CATEGORICAL_SLOTS[0].light};
  --diverging-neg: ${CATEGORICAL_SLOTS[5].light};
  --series-other: ${MUTED_SLOT.light};
  --status-good: ${STATUS.good};
  --status-warning: ${STATUS.warning};
  --status-serious: ${STATUS.serious};
  --status-critical: ${STATUS.critical};
${seriesLight}
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz-root {
    color-scheme: dark;
    --chart-surface: ${CHROME.surface.dark};
    --text-primary: ${CHROME.textPrimary.dark};
    --text-secondary: ${CHROME.textSecondary.dark};
    --text-muted: ${CHROME.textMuted.dark};
    --gridline: ${CHROME.gridline.dark};
    --baseline: ${CHROME.baseline.dark};
    --diverging-mid: ${CHROME.divergingMid.dark};
    --diverging-pos: ${CATEGORICAL_SLOTS[0].dark};
    --diverging-neg: ${CATEGORICAL_SLOTS[5].dark};
    --series-other: ${MUTED_SLOT.dark};
${seriesDark}
  }
}
:root[data-theme="dark"] .viz-root {
  color-scheme: dark;
  --chart-surface: ${CHROME.surface.dark};
  --text-primary: ${CHROME.textPrimary.dark};
  --text-secondary: ${CHROME.textSecondary.dark};
  --text-muted: ${CHROME.textMuted.dark};
  --gridline: ${CHROME.gridline.dark};
  --baseline: ${CHROME.baseline.dark};
  --diverging-mid: ${CHROME.divergingMid.dark};
  --diverging-pos: ${CATEGORICAL_SLOTS[0].dark};
  --diverging-neg: ${CATEGORICAL_SLOTS[5].dark};
  --series-other: ${MUTED_SLOT.dark};
${seriesDark}
}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Diverging blue<->red score color for a 1-5 rubric value, centered on the
 * neutral midpoint at 3 (the rubric's "acceptable" point). Blue = high
 * quality, red = low quality, matching palette.md's diverging pair.
 */
export function scoreDivergingColor(score: number, mode: "light" | "dark"): string {
  const clamped = Math.max(1, Math.min(5, score));
  const mid = hexToRgb(CHROME.divergingMid[mode]);
  const pos = hexToRgb(CATEGORICAL_SLOTS[0][mode]); // blue = good
  const neg = hexToRgb(CATEGORICAL_SLOTS[5][mode]); // red = poor
  if (clamped >= 3) {
    const t = (clamped - 3) / 2;
    return rgbToHex([lerp(mid[0], pos[0], t), lerp(mid[1], pos[1], t), lerp(mid[2], pos[2], t)]);
  }
  const t = (3 - clamped) / 2;
  return rgbToHex([lerp(mid[0], neg[0], t), lerp(mid[1], neg[1], t), lerp(mid[2], neg[2], t)]);
}

/** Whether ink text on a diverging cell should be light or dark, by simple luminance. */
export function textColorForFill(hex: string): "#ffffff" | "#0b0b0b" {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0b0b0b" : "#ffffff";
}
