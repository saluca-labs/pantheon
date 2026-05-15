'use client';

/**
 * Research OS Phase 2 — Filter chip strip.
 *
 * Reverse-time timeline filter row. Six kind chips ("All" + 6 entry
 * kinds), an inline tag-input, and a "Show archived" toggle. Pure
 * controlled component — the parent owns the filter state.
 *
 * Wave E.2b coherence: the kind-chip row delegates to the shared
 * `KindFilterChips` primitive. The tag input and the archived toggle
 * remain composed here — neither is a closed-set kind filter, so they
 * sit alongside the chip rail as siblings (the same composition pattern
 * the other research / maker consumers use).
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { Archive, X } from 'lucide-react';
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  ENTRY_KIND_COLOR,
  type EntryKind,
} from '@/lib/agentic-os/research/entry-kinds';
import { KindFilterChips } from '@/components/agentic-os/_shared/views';

export type EntryKindFilter = EntryKind | 'all';

interface Props {
  kind: EntryKindFilter;
  tag: string;
  archived: boolean;
  onKindChange: (next: EntryKindFilter) => void;
  onTagChange: (next: string) => void;
  onArchivedChange: (next: boolean) => void;
}

export function NotebookEntryFilterChips({
  kind,
  tag,
  archived,
  onKindChange,
  onTagChange,
  onArchivedChange,
}: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 mb-4"
      data-testid="notebook-filter-chips"
    >
      {/* Kind chips — shared primitive */}
      <KindFilterChips<EntryKind>
        value={kind === 'all' ? null : kind}
        onChange={(next) => onKindChange(next ?? 'all')}
        options={ENTRY_KINDS.map((k) => ({
          value: k,
          label: ENTRY_KIND_LABELS[k],
          // Per-kind accent: preserves the existing notebook palette
          // (note/observation/result/…) on the active chip. The raw-palette
          // colors that live in `ENTRY_KIND_COLOR` are pre-existing tech
          // debt — they're the *same* color tokens the kind pill + the
          // timeline-point dot already use, so tokenizing them is a
          // research-OS-wide migration tracked separately.
          activeColor: ENTRY_KIND_COLOR[k],
          testId: `filter-kind-${k}`,
        }))}
        allLabel="All kinds"
        ariaLabel="Filter notebook entries by kind"
        testIdPrefix="filter-kind"
      />

      <span className="mx-1 text-text-tertiary" aria-hidden>
        |
      </span>

      {/* Tag input */}
      <div className="relative">
        <input
          type="text"
          value={tag}
          onChange={(e) => onTagChange(e.target.value)}
          placeholder="Filter by tag…"
          className="text-xs px-2 py-1 pr-7 rounded-full bg-surface-0 border border-border-subtle text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent/60 w-44"
          data-testid="filter-tag-input"
        />
        {tag && (
          <button
            type="button"
            onClick={() => onTagChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
            aria-label="Clear tag filter"
            data-testid="filter-tag-clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Archived toggle */}
      <label
        className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide px-2 py-1 rounded-full border cursor-pointer transition ${
          archived
            ? 'text-warning bg-warning/10 border-warning/40'
            : 'text-text-secondary bg-surface-0 border-border-subtle hover:text-text-primary'
        }`}
        data-testid="filter-archived-toggle"
      >
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => onArchivedChange(e.target.checked)}
          className="sr-only"
        />
        <Archive className="w-3 h-3" />
        Show archived
      </label>
    </div>
  );
}
