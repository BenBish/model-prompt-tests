import { escapeHtml } from "../../util/html";

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const fn = ((value: number) => {
    if (span === 0) return (r0 + r1) / 2;
    const t = (value - d0) / span;
    return r0 + t * (r1 - r0);
  }) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** "Nice" round-number ticks spanning a domain, per marks-and-anatomy.md guidance. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  const step = niceResidual * magnitude;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

export function attrs(map: Record<string, string | number | undefined>): string {
  return Object.entries(map)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
    .join(" ");
}

export function el(tag: string, attributes: Record<string, string | number | undefined>, inner = ""): string {
  return `<${tag} ${attrs(attributes)}>${inner}</${tag}>`;
}

export function selfClose(tag: string, attributes: Record<string, string | number | undefined>): string {
  return `<${tag} ${attrs(attributes)} />`;
}

export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/** A chart figure wrapper: title, caption, and an SVG/HTML body. Every chart renders inside one. */
export function chartFigure(title: string, caption: string | undefined, body: string): string {
  return `
    <figure class="chart-figure">
      <figcaption>
        <h3>${escapeHtml(title)}</h3>
        ${caption ? `<p class="chart-caption">${escapeHtml(caption)}</p>` : ""}
      </figcaption>
      ${body}
    </figure>
  `;
}
