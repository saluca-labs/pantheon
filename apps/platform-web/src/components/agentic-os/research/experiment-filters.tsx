'use client';

/**
 * Research OS — ExperimentFilters.
 *
 * Status + sort controls for the experiment list. Pure render component;
 * filter state lives in the parent (ExperimentList).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_STATUS_LABELS,
  type SortKey,
  type StatusFilter,
} from '@/lib/agentic-os/research/experiments';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

interface Props {
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
}

export function ExperimentFilters({
  statusFilter,
  onStatusChange,
  sort,
  onSortChange,
  showArchived,
  onShowArchivedChange,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
      <Field label="Status">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
          className={inputCls}
        >
          <option value="all">All</option>
          {EXPERIMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EXPERIMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sort by">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className={inputCls}
        >
          <option value="created">Recently created</option>
          <option value="name">Name</option>
          <option value="target">Target completion</option>
        </select>
      </Field>
      <Field label="Archived">
        <label className="flex items-center gap-2 h-[38px] px-3 rounded-md border border-border-subtle bg-surface-0 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => onShowArchivedChange(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-text-primary">Show archived</span>
        </label>
      </Field>
    </div>
  );
}
