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
  draft: 'text-slate-300 bg-slate-500/15 border-slate-500/40',
  active: 'text-blue-300 bg-blue-500/15 border-blue-500/40',
  testing: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
  supported: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
  refuted: 'text-red-300 bg-red-500/15 border-red-500/40',
  inconclusive: 'text-violet-300 bg-violet-500/15 border-violet-500/40',
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
