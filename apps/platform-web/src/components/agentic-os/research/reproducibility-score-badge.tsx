/**
 * Research OS Phase 6 — reproducibility score badge.
 *
 * Renders the rollup score as a 0-100% pill. When `score` is null
 * (no scored items), renders a neutral "—" with a "No scored items"
 * tooltip-style title attribute.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

interface Props {
  score: number | null;
  size?: 'sm' | 'md';
}

function styleForScore(score: number | null): string {
  if (score == null) return 'border-border-subtle bg-surface-0 text-text-secondary';
  if (score >= 0.8) return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300';
  if (score >= 0.5) return 'border-sky-500/50 bg-sky-500/10 text-sky-300';
  if (score >= 0.25) return 'border-amber-500/50 bg-amber-500/10 text-amber-300';
  return 'border-red-500/50 bg-red-500/10 text-red-300';
}

export function ReproducibilityScoreBadge({ score, size = 'sm' }: Props) {
  const pct = score == null ? '—' : `${Math.round(score * 100)}%`;
  const sizing = size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  const title = score == null ? 'No scored items' : `Reproducibility score: ${pct}`;
  return (
    <span
      className={`inline-flex items-center font-medium uppercase tracking-wide rounded-full border ${sizing} ${styleForScore(score)}`}
      title={title}
      data-testid="repro-score-badge"
      data-score={score == null ? 'null' : String(score)}
    >
      Repro {pct}
    </span>
  );
}
