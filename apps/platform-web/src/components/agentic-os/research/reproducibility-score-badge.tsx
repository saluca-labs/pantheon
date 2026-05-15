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
  if (score >= 0.8) return 'border-positive/50 bg-positive/10 text-positive';
  if (score >= 0.5) return 'border-os-research/50 bg-os-research/10 text-os-research';
  if (score >= 0.25) return 'border-warning/50 bg-warning/10 text-warning';
  return 'border-danger/50 bg-danger/10 text-danger';
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
