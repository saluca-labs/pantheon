'use client';

/**
 * Research OS Wave D — hypothesis status-filter chip rail.
 *
 * The shared `EntitySearch` primitive is search-input-only — it has no
 * declarative filter-chip API (known `_shared/views` gap #1). So, the same
 * way prior sub-waves kept native filters next to `EntitySearch`, the
 * Hypothesis Ledger workspace builds its status filter as this local
 * component, rendered alongside `EntitySearch` rather than inside it.
 *
 * Pure controlled component: the parent owns the active filter + the
 * per-status counts. Chips read `all` + the seven lifecycle statuses, each
 * with a count badge.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import {
  HYPOTHESIS_STATUS_ORDER,
  hypothesisStatusLabel,
  type HypothesisStatusFilter,
} from '@/lib/agentic-os/research/hypothesis-workspace';
import type { HypothesisStatus } from '@/lib/agentic-os/research/hypotheses';

/** Per-status chip tint when active — mirrors HypothesisLedger STATUS_COLOR. */
const STATUS_CHIP_ACTIVE: Record<HypothesisStatus, string> = {
  draft: 'text-text-secondary bg-text-secondary/15 border-text-secondary/40',
  active: 'text-accent bg-accent/15 border-accent/40',
  testing: 'text-warning bg-warning/15 border-warning/40',
  supported: 'text-positive bg-positive/15 border-positive/40',
  refuted: 'text-danger bg-danger/15 border-danger/40',
  inconclusive: 'text-accent bg-accent/15 border-accent/40',
  archived: 'text-text-secondary bg-surface-3 border-border-strong',
};

interface Props {
  active: HypothesisStatusFilter;
  counts: Record<HypothesisStatus, number>;
  /** Total across all statuses — the `All` chip's count. */
  total: number;
  onChange: (next: HypothesisStatusFilter) => void;
}

function Chip({
  label,
  count,
  active,
  activeCls,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  active: boolean;
  activeCls: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide transition ${
        active
          ? activeCls
          : 'border-border-subtle bg-surface-0 text-text-secondary hover:text-white'
      }`}
    >
      {label}
      <span
        className={`tabular-nums rounded-full px-1 text-[9px] ${
          active ? 'bg-surface-0/60' : 'bg-surface-2 text-text-tertiary'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function HypothesisStatusFilterChips({
  active,
  counts,
  total,
  onChange,
}: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Filter hypotheses by status"
      data-testid="hypothesis-status-filter-chips"
    >
      <Chip
        label="All"
        count={total}
        active={active === 'all'}
        activeCls="text-white bg-accent/20 border-accent/60"
        onClick={() => onChange('all')}
        testId="hypothesis-status-chip-all"
      />
      {HYPOTHESIS_STATUS_ORDER.map((status) => (
        <Chip
          key={status}
          label={hypothesisStatusLabel(status)}
          count={counts[status]}
          active={active === status}
          activeCls={STATUS_CHIP_ACTIVE[status]}
          onClick={() => onChange(status)}
          testId={`hypothesis-status-chip-${status}`}
        />
      ))}
    </div>
  );
}
