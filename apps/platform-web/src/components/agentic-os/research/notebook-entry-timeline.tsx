'use client';

/**
 * Research OS Wave D — per-experiment notebook timeline (TimelineView).
 *
 * Renders the lab-notebook entries as a horizontal time-axis using the
 * shared `TimelineView` primitive, one lane per entry kind. Each entry is
 * a milestone *point* (notebook entries are discrete-time events with no
 * duration). Clicking a point selects it and reveals the full
 * `NotebookEntryCard` below the axis — deep edit / archive affordances
 * preserved, just reached through the timeline instead of a flat list.
 *
 * The kind-filter chips are the existing `NotebookEntryFilterChips`
 * component, rendered *alongside* the timeline. `EntitySearch` is
 * search-input-only with no declarative filter-chip API (known
 * `_shared/views` gap #1), so — as prior sub-waves did — the native
 * kind filter stays next to the primitive rather than being forced into
 * it. Selecting a single kind collapses the timeline to that one lane.
 *
 * This is the timeline rendering of the same data the list view shows;
 * `NotebookTimeline` hosts the list/timeline toggle so neither view nor
 * any capability is removed.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { useMemo, useState } from 'react';
import { TimelineView } from '@/components/agentic-os/_shared/views';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';
import {
  toNotebookTimelineItems,
  deriveNotebookTimelineRange,
  notebookTimelineLanes,
  type NotebookTimelineItem,
} from '@/lib/agentic-os/research/notebook-timeline-view';
import { ENTRY_KIND_COLOR } from '@/lib/agentic-os/research/entry-kinds';
import type { EntryKindFilter } from './notebook-entry-filter-chips';
import { NotebookEntryKindPill } from './notebook-entry-kind-pill';
import { NotebookEntryCard } from './notebook-entry-card';

interface Props {
  /** Entries already filtered by the parent (kind / tag / archived scope). */
  entries: NotebookEntry[];
  /** The active kind filter — collapses the timeline to one lane when set. */
  kind: EntryKindFilter;
  /** Bubble up a mutation so the parent can refetch. */
  onMutated: () => void;
}

function entryAtLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NotebookEntryTimeline({ entries, kind, onMutated }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo(() => toNotebookTimelineItems(entries), [entries]);
  const range = useMemo(() => deriveNotebookTimelineRange(items), [items]);
  const lanes = useMemo(() => notebookTimelineLanes(kind), [kind]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  return (
    <div data-testid="notebook-entry-timeline">
      <TimelineView<NotebookTimelineItem>
        items={items}
        range={range}
        lanes={lanes}
        slug="research"
        emptyLabel="No entries in this range — add a notebook entry to see it here."
        onItemClick={(item) =>
          setSelectedId((cur) => (cur === item.id ? null : item.id))
        }
        renderItem={(item) => {
          const isSelected = item.id === selectedId;
          return (
            <span
              title={`${item.entry.title} · ${entryAtLabel(item.entry.entryAt)}`}
              data-testid={`notebook-timeline-point-${item.id}`}
              data-selected={isSelected || undefined}
              className={`block h-3 w-3 rotate-45 rounded-[2px] border ring-2 ring-surface-1 transition ${
                ENTRY_KIND_COLOR[item.entry.entryKind]
              } ${isSelected ? 'scale-150 ring-accent' : 'hover:scale-125'}`}
            />
          );
        }}
      />

      {/* Selected-entry detail — the deep card, reached via the timeline. */}
      {selectedEntry && (
        <div className="mt-4" data-testid="notebook-timeline-selected">
          <div className="mb-2 flex items-center gap-2 text-xs text-text-secondary">
            <NotebookEntryKindPill kind={selectedEntry.entryKind} />
            <span>{entryAtLabel(selectedEntry.entryAt)}</span>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="ml-auto text-text-tertiary hover:text-white"
              data-testid="notebook-timeline-selected-close"
            >
              Close
            </button>
          </div>
          <NotebookEntryCard
            entry={selectedEntry}
            onUpdated={() => onMutated()}
            onArchived={() => {
              setSelectedId(null);
              onMutated();
            }}
          />
        </div>
      )}
    </div>
  );
}
