/**
 * Chart token bridge — mirrors the design-system tokens defined in
 * `src/app/globals.css` for use in JS-string contexts (Recharts SVG
 * attributes, `<style jsx>` blocks, inline-style objects) where Tailwind
 * utility classes don't apply.
 *
 * KEEP IN SYNC with `globals.css` `:root` block. If a token value
 * changes there, update it here too — and ideally in the same commit.
 * `_design/tokens.md` is the human-readable authoritative table.
 *
 * Wave A: introduced as part of the inline-hex audit. Recharts SVG
 * attrs can't read CSS variables in props (React passes strings to
 * the underlying SVG), so we export the hex values here instead of
 * letting them re-leak across the codebase.
 */

/** Surface ladder (4 steps). */
export const SURFACE_0 = '#0b0d12';
export const SURFACE_1 = '#13151c';
export const SURFACE_2 = '#1a1d27';
export const SURFACE_3 = '#1f2230';

/** Borders. */
export const BORDER_SUBTLE = '#23263a';
export const BORDER_STRONG = '#363b54';

/** Text hierarchy. */
export const TEXT_PRIMARY = '#f1f3f9';
export const TEXT_SECONDARY = '#a4acbf';
export const TEXT_TERTIARY = '#6c7589';

/** System accent. */
export const ACCENT = '#5b6cff';

/** Status. */
export const POSITIVE = '#34d399';
export const WARNING = '#fbbf24';
export const ATTENTION = '#fb923c';
export const DANGER = '#f87171';

/** Per-OS accents (keyed by registry slug). */
export const OS_ACCENT: Record<string, string> = {
  health: '#34d399',
  maker: '#fbbf24',
  research: '#38bdf8',
  'secure-dev': '#a78bfa',
  filmmaker: '#fb7185',
  cyber: '#f87171',
  autobiographer: '#818cf8',
  business: '#2dd4bf',
  creator: '#e879f9',
};

/**
 * Multi-series chart fallback palette. Indexes 0-N rotate through these
 * when a `TrendSeries` doesn't supply its own color. Chosen so adjacent
 * series have distinguishable hue+luminance even on `surface-2`.
 */
export const CHART_PALETTE = [
  ACCENT,        // 0 — system accent
  POSITIVE,      // 1 — green
  WARNING,       // 2 — amber
  DANGER,        // 3 — red
  OS_ACCENT['secure-dev']!,    // 4 — violet
  OS_ACCENT['research']!,      // 5 — sky
  OS_ACCENT['creator']!,       // 6 — fuchsia
];

/** Common Recharts style props (axes, grid, tooltip) — drop-in spread. */
export const CHART_AXIS_STROKE = TEXT_SECONDARY;
export const CHART_GRID_STROKE = BORDER_SUBTLE;
export const CHART_TOOLTIP_STYLE = {
  background: SURFACE_2,
  border: `1px solid ${BORDER_SUBTLE}`,
  borderRadius: 8,
  fontSize: 12,
  color: TEXT_PRIMARY,
} as const;
export const CHART_TOOLTIP_LABEL_STYLE = { color: TEXT_SECONDARY } as const;
export const CHART_LEGEND_STYLE = { fontSize: 11, color: TEXT_SECONDARY } as const;
