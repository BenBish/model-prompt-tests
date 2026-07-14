/** Shared page chrome CSS for every generated report/compare/site page. Pair with paletteStyleBlock() for chart colors. */
export function reportBaseStyles(): string {
  return `
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; margin: 0; background: var(--page-bg, #f9f9f7); color: var(--ink, #0b0b0b); }
  .page { max-width: 1180px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) body { --page-bg: #0d0d0d; --ink: #ffffff; }
    :root:not([data-theme="light"]) table { border-color: #333 !important; }
    :root:not([data-theme="light"]) th, :root:not([data-theme="light"]) td { border-color: #333 !important; }
    :root:not([data-theme="light"]) pre { background: #1f2228 !important; color: #ddd !important; }
    :root:not([data-theme="light"]) .chart-card, :root:not([data-theme="light"]) .stat-tile, :root:not([data-theme="light"]) .run-card { background: #16181c !important; border-color: #2c2c2a !important; }
  }
  :root[data-theme="dark"] body { --page-bg: #0d0d0d; --ink: #ffffff; }
  :root[data-theme="dark"] table { border-color: #333 !important; }
  :root[data-theme="dark"] th, :root[data-theme="dark"] td { border-color: #333 !important; }
  :root[data-theme="dark"] pre { background: #1f2228 !important; color: #ddd !important; }
  :root[data-theme="dark"] .chart-card, :root[data-theme="dark"] .stat-tile, :root[data-theme="dark"] .run-card { background: #16181c !important; border-color: #2c2c2a !important; }

  header.report-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  h1 { font-size: 1.4rem; margin: 0; }
  .generated-at { color: #666; font-size: 0.85rem; margin: 0.15rem 0 0; }
  .theme-toggle { border: 1px solid #c3c2b7; background: transparent; color: inherit; border-radius: 999px; padding: 0.3rem 0.8rem; font-size: 0.8rem; cursor: pointer; }

  .stat-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
  .stat-tile { border: 1px solid var(--gridline, #e1e0d9); border-radius: 10px; padding: 0.85rem 1rem; background: #fff; }
  .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #898781; }
  .stat-value { font-size: 1.6rem; font-weight: 600; margin-top: 0.15rem; }
  .stat-sub { font-size: 0.75rem; color: #898781; margin-top: 0.1rem; }

  .filter-bar { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem; }
  .legend-chip { display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid #c3c2b7; background: transparent; color: inherit; border-radius: 999px; padding: 0.25rem 0.7rem 0.25rem 0.5rem; font-size: 0.78rem; cursor: pointer; }
  .legend-chip.active { border-color: currentColor; font-weight: 600; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  [data-model].filtered-out { display: none; }
  tr[data-model].filtered-out { display: none; }

  .chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .chart-card-wide { grid-column: 1 / -1; }
  .chart-card { border: 1px solid var(--gridline, #e1e0d9); border-radius: 12px; padding: 1rem 1.1rem; background: #fff; overflow-x: auto; }
  .chart-figure { margin: 0; }
  .chart-figure h3 { font-size: 0.95rem; margin: 0 0 0.15rem; }
  .chart-caption { font-size: 0.78rem; color: #898781; margin: 0 0 0.6rem; max-width: 60ch; }
  .chart-empty { color: #898781; font-size: 0.85rem; }
  .chart-svg { width: 100%; height: auto; display: block; }

  .grid-line { stroke: var(--gridline, #e1e0d9); stroke-width: 1; }
  .axis-line { stroke: var(--baseline, #c3c2b7); stroke-width: 1; }
  .axis-label { fill: #898781; font-size: 10px; }
  .axis-title { fill: #52514e; font-size: 11px; }
  .point-label { fill: #52514e; font-size: 11px; }
  .point-mark { stroke: var(--chart-surface, #fcfcfb); stroke-width: 2; }
  .hit-target { fill: transparent; cursor: pointer; }
  .frontier-line { fill: none; stroke: #898781; stroke-width: 1.5; stroke-dasharray: 4 3; }
  .dist-range { stroke-width: 2; stroke-linecap: round; opacity: 0.55; }
  .dist-dot { opacity: 0.55; }
  .dist-mean { stroke: var(--chart-surface, #fcfcfb); stroke-width: 2; }
  .dist-row-label, .bar-row-label { fill: #52514e; font-size: 11px; }
  .bar-value-label { fill: #52514e; font-size: 11px; }
  .on-frontier .point-label { font-weight: 600; }
  .compare-connector { stroke: #898781; stroke-width: 2; opacity: 0.5; }
  .delta-up { fill: #0ca30c; font-weight: 600; }
  .delta-down { fill: #d03b3b; font-weight: 600; }

  .heatmap-scroll { overflow-x: auto; }
  table.heatmap { border-collapse: collapse; font-size: 0.78rem; }
  table.heatmap th, table.heatmap td { padding: 0.3rem 0.5rem; text-align: center; }
  .heatmap-row-label { text-align: left !important; white-space: nowrap; font-family: monospace; font-size: 0.72rem; color: #52514e; }
  .heatmap-col-label { white-space: nowrap; font-size: 0.72rem; color: #52514e; }
  .heatmap-cell { border-radius: 4px; min-width: 2.6rem; background: var(--cell-light); color: var(--cell-ink-light); cursor: pointer; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .heatmap-cell { background: var(--cell-dark); color: var(--cell-ink-dark); }
  }
  :root[data-theme="dark"] .heatmap-cell { background: var(--cell-dark); color: var(--cell-ink-dark); }
  .heatmap-empty { background: transparent !important; color: #898781 !important; }

  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; text-align: left; }
  th.prompt-id { white-space: nowrap; font-family: monospace; }
  td.empty { text-align: center; color: #999; }
  .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 0.75rem; color: #fff; font-weight: bold; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f5f5f5; padding: 0.5rem; border-radius: 0.25rem; max-height: 24rem; overflow-y: auto; }
  summary { cursor: pointer; }
  .run-detail h4 { margin-bottom: 0.25rem; }
  hr { border: none; border-top: 1px dashed #ccc; margin: 0.5rem 0; }
  .summary-table { margin-bottom: 2rem; }
  table.sortable thead th[data-col] { cursor: pointer; user-select: none; white-space: nowrap; }
  table.sortable thead th[data-col]::after { content: ""; margin-left: 0.25rem; opacity: 0.4; }
  table.sortable thead th.sorted::after { content: "▲"; opacity: 1; }
  table.sortable thead th.sorted-desc::after { content: "▼"; opacity: 1; }

  .chart-tooltip { position: fixed; z-index: 50; background: #0b0b0b; color: #fff; border-radius: 8px; padding: 0.45rem 0.65rem; font-size: 0.75rem; pointer-events: none; max-width: 260px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
  .chart-tooltip-title { font-weight: 600; margin-bottom: 0.15rem; }

  footer.methodology { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid #e1e0d9; font-size: 0.78rem; color: #52514e; }
  footer.methodology h2 { font-size: 0.9rem; }
  footer.methodology dt { font-weight: 600; margin-top: 0.5rem; }
  footer.methodology dd { margin: 0.1rem 0 0; }

  .run-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
  .run-card { display: block; border: 1px solid var(--gridline, #e1e0d9); border-radius: 12px; padding: 1rem 1.1rem; background: #fff; text-decoration: none; color: inherit; }
  .run-card:hover { border-color: currentColor; }
  .run-card h3 { margin: 0 0 0.25rem; font-size: 1.05rem; }
  .run-card .run-date { font-size: 0.75rem; color: #898781; }
  .run-card .run-models { font-size: 0.78rem; color: #52514e; margin-top: 0.5rem; }
  .run-card .run-winner { margin-top: 0.6rem; font-size: 0.85rem; }
  .run-card .run-winner b { font-size: 1.1rem; }
  .site-intro { max-width: 70ch; color: #52514e; font-size: 0.9rem; }
`;
}
