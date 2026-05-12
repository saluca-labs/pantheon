'use client';

/**
 * Research OS Phase 2 — Filter chip strip.
 *
 * Reverse-time timeline filter row. Six kind chips ("All" + 6 entry
 * kinds), an inline tag-input, and a "Show archived" toggle. Pure
 * controlled component — the parent owns the filter state.
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
      {/* Kind chips */}
      <button
        type="button"
        onClick={() => onKindChange('all')}
        className={`text-[10px] font-medium uppercase tracking-wide px-2 py-1 rounded-full border transition ${
          kind === 'all'
            ? 'text-white bg-[#4361EE]/20 border-[#4361EE]/60'
            : 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e] hover:text-white'
        }`}
        data-testid="filter-kind-all"
      >
        All kinds
      </button>
      {ENTRY_KINDS.map((k) => {
        const active = kind === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onKindChange(k)}
            className={`text-[10px] font-medium uppercase tracking-wide px-2 py-1 rounded-full border transition ${
              active ? ENTRY_KIND_COLOR[k] : 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e] hover:text-white'
            }`}
            data-testid={`filter-kind-${k}`}
          >
            {ENTRY_KIND_LABELS[k]}
          </button>
        );
      })}

      <span className="mx-1 text-[#2a2d3e]" aria-hidden>
        |
      </span>

      {/* Tag input */}
      <div className="relative">
        <input
          type="text"
          value={tag}
          onChange={(e) => onTagChange(e.target.value)}
          placeholder="Filter by tag…"
          className="text-xs px-2 py-1 pr-7 rounded-full bg-[#0f1117] border border-[#2a2d3e] text-white placeholder:text-[#94a3b8] focus:outline-none focus:border-[#4361EE]/60 w-44"
          data-testid="filter-tag-input"
        />
        {tag && (
          <button
            type="button"
            onClick={() => onTagChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-white"
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
            ? 'text-amber-300 bg-amber-500/10 border-amber-500/40'
            : 'text-[#94a3b8] bg-[#0f1117] border-[#2a2d3e] hover:text-white'
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
