/**
 * Research OS Wave D — notebook-entry timeline-view adapter.
 *
 * Pure adapter logic that maps `NotebookEntry` rows onto the shared
 * `TimelineView` primitive's `TimelineItemBase` shape, and derives the
 * visible `TimelineRange` from the entry set.
 *
 * Notebook entries are *discrete-time* events — they have an `entryAt`
 * instant, no duration — so each maps to a `TimelineView` milestone point
 * (no `end`). The lane is the entry kind, so the timeline reads as one row
 * per kind: note / observation / result / decision / question / todo.
 *
 * No React, no DB — the testable seam under `NotebookEntryTimeline`.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import type { TimelineLane, TimelineRange } from '@/components/agentic-os/_shared/views';
import { ENTRY_KINDS, ENTRY_KIND_LABELS, type EntryKind } from './entry-kinds';
import type { NotebookEntry } from './notebook-entries';

/** A notebook entry projected onto the TimelineView item contract. */
export interface NotebookTimelineItem {
  id: string;
  start: Date;
  /** Always undefined — notebook entries are points, not spans. */
  end?: undefined;
  /** Lane id = the entry kind. */
  laneId: EntryKind;
  /** The source row, carried through for `renderItem`. */
  entry: NotebookEntry;
}

/** One day in epoch millis — used to pad the derived range. */
const DAY_MS = 86_400_000;

/**
 * Lanes for the timeline — one per entry kind, in the canonical
 * `ENTRY_KINDS` order. When `kindFilter` is a concrete kind, only that
 * lane is returned so the timeline collapses to a single row.
 */
export function notebookTimelineLanes(
  kindFilter: EntryKind | 'all',
): TimelineLane[] {
  const kinds = kindFilter === 'all' ? ENTRY_KINDS : [kindFilter];
  return kinds.map((k) => ({ id: k, label: ENTRY_KIND_LABELS[k] }));
}

/**
 * Map notebook entries to timeline items. Entries with an unparseable
 * `entryAt` are dropped (defensive — the DB column is NOT NULL + typed,
 * but client-side optimistic rows could in theory carry a bad value).
 */
export function toNotebookTimelineItems(
  entries: NotebookEntry[],
): NotebookTimelineItem[] {
  const items: NotebookTimelineItem[] = [];
  for (const entry of entries) {
    const t = Date.parse(entry.entryAt);
    if (!Number.isFinite(t)) continue;
    items.push({
      id: entry.id,
      start: new Date(t),
      laneId: entry.entryKind,
      entry,
    });
  }
  return items;
}

/**
 * Derive the visible time window from the entry set: from the earliest to
 * the latest `entryAt`, padded by one day on each side so edge points
 * aren't clipped against the track border. When there are zero (or one)
 * datable entries, falls back to a 30-day window ending today so the
 * timeline still renders a sensible axis.
 *
 * `now` is injectable for deterministic tests.
 */
export function deriveNotebookTimelineRange(
  items: NotebookTimelineItem[],
  now: Date = new Date(),
): TimelineRange {
  if (items.length === 0) {
    return { start: new Date(now.getTime() - 30 * DAY_MS), end: now };
  }
  let min = items[0]!.start.getTime();
  let max = min;
  for (const item of items) {
    const t = item.start.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  // A single entry (or several at the same instant) — give it a window.
  if (min === max) {
    return {
      start: new Date(min - 15 * DAY_MS),
      end: new Date(max + 15 * DAY_MS),
    };
  }
  return {
    start: new Date(min - DAY_MS),
    end: new Date(max + DAY_MS),
  };
}
