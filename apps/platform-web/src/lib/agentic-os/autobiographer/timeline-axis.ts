/**
 * Autobiographer OS — Timeline axis adapter (Wave D).
 *
 * Pure client-safe shaping helpers that turn the existing
 * `TimelineMemory[]` payload (already loaded by the timeline page) into
 * the `{ items, range, lanes }` shape the shared `TimelineView`
 * primitive consumes. No new API routes or DB queries — this is a
 * presentation-layer reshape over data the page already has.
 *
 * Why an adapter, not a route change: `TimelineView` positions items by
 * an absolute `Date` within a fixed window. Autobiographer memories
 * carry `eraDateEstimate` (a YYYY-MM-DD string) which becomes the
 * item's `start`. Memories with no `eraDateEstimate` cannot be placed
 * on an absolute axis — they're surfaced separately by the page as an
 * "undated" count, and the decade-grouped `TimelineList` remains the
 * home for the full undated + arc-stripe model.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import type { TimelineMemory } from './timeline';

/** A memory shaped for the shared `TimelineView` (one milestone point). */
export interface MemoryAxisItem {
  id: string;
  /** Absolute date the item is positioned by (from `eraDateEstimate`). */
  start: Date;
  /** Lane the item slots into — the parent book id, or `__unbooked__`. */
  laneId: string;
  /** Carried through for the renderItem callback. */
  memory: TimelineMemory;
}

/** Lane bucket for the axis — one per book, plus an unbooked catch-all. */
export interface MemoryAxisLane {
  id: string;
  label: string;
}

const UNBOOKED_LANE = '__unbooked__';

/**
 * Parse a memory's `eraDateEstimate` (a `YYYY-MM-DD` string) into a UTC
 * `Date`. Returns `null` for memories with no estimate or an
 * unparseable value — those are dropped from the axis (and counted
 * separately by the caller).
 */
export function parseEraDate(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Result of shaping memories for the axis. */
export interface MemoryAxisModel {
  items: MemoryAxisItem[];
  lanes: MemoryAxisLane[];
  range: { start: Date; end: Date } | null;
  /** Memories that had no usable `eraDateEstimate` and were dropped. */
  undatedCount: number;
}

/**
 * Reshape a `TimelineMemory[]` into the `TimelineView` model. Lanes are
 * one-per-book (so a cross-book scroll reads as parallel rows), ordered
 * by first appearance, with the unbooked lane (if any) sorted last. The
 * range is the [min, max] of all dated memories, padded by ~6 months
 * either side so edge items aren't flush against the frame.
 */
export function buildMemoryAxisModel(
  memories: TimelineMemory[],
): MemoryAxisModel {
  const items: MemoryAxisItem[] = [];
  let undatedCount = 0;
  const laneOrder: string[] = [];
  const laneLabels = new Map<string, string>();

  for (const m of memories) {
    const start = parseEraDate(m.eraDateEstimate);
    if (!start) {
      undatedCount++;
      continue;
    }
    const laneId = m.bookId ?? UNBOOKED_LANE;
    if (!laneLabels.has(laneId)) {
      laneOrder.push(laneId);
      laneLabels.set(
        laneId,
        laneId === UNBOOKED_LANE ? 'Unbooked' : (m.bookTitle ?? 'Untitled book'),
      );
    }
    items.push({ id: m.id, start, laneId, memory: m });
  }

  if (items.length === 0) {
    return { items: [], lanes: [], range: null, undatedCount };
  }

  // Lanes: declared-book lanes first (insertion order), unbooked last.
  const lanes: MemoryAxisLane[] = laneOrder
    .sort((a, b) => {
      if (a === UNBOOKED_LANE) return 1;
      if (b === UNBOOKED_LANE) return -1;
      return 0;
    })
    .map((id) => ({ id, label: laneLabels.get(id) ?? id }));

  // Range: [min, max] padded by ~6 months so milestones aren't flush.
  let min = items[0]!.start.getTime();
  let max = items[0]!.start.getTime();
  for (const it of items) {
    const t = it.start.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const PAD_MS = 1000 * 60 * 60 * 24 * 183; // ~6 months
  // Guard the degenerate single-date case so the window has width.
  if (min === max) {
    min -= PAD_MS;
    max += PAD_MS;
  } else {
    min -= PAD_MS;
    max += PAD_MS;
  }

  return {
    items,
    lanes,
    range: { start: new Date(min), end: new Date(max) },
    undatedCount,
  };
}
