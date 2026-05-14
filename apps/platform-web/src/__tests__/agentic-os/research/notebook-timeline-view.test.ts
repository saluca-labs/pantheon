/**
 * Research OS Wave D — notebook timeline-view adapter tests.
 *
 * Locks the pure adapter that maps `NotebookEntry` rows onto the shared
 * `TimelineView` contract: lane derivation per kind-filter, entry→item
 * projection (points, not spans), bad-timestamp dropping, and the derived
 * `TimelineRange` (padded window, single-entry fallback, empty fallback).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';
import { ENTRY_KINDS } from '@/lib/agentic-os/research/entry-kinds';
import {
  notebookTimelineLanes,
  toNotebookTimelineItems,
  deriveNotebookTimelineRange,
} from '@/lib/agentic-os/research/notebook-timeline-view';

function mkEntry(overrides: Partial<NotebookEntry> = {}): NotebookEntry {
  return {
    id: 'ne-1',
    userId: 'u-1',
    experimentId: 'exp-1',
    entryKind: 'note',
    title: 'Entry',
    bodyMd: '',
    attachedUrls: [],
    tags: [],
    entryAt: '2026-05-10T12:00:00.000Z',
    archivedAt: null,
    metadata: {},
    createdAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-10T12:00:00.000Z',
    ...overrides,
  };
}

const DAY_MS = 86_400_000;

describe('notebookTimelineLanes()', () => {
  it('returns one lane per entry kind when the filter is "all"', () => {
    const lanes = notebookTimelineLanes('all');
    expect(lanes.map((l) => l.id)).toEqual([...ENTRY_KINDS]);
  });
  it('collapses to a single lane when a concrete kind is filtered', () => {
    const lanes = notebookTimelineLanes('result');
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.id).toBe('result');
    expect(lanes[0]!.label).toBe('Result');
  });
});

describe('toNotebookTimelineItems()', () => {
  it('projects entries to point items keyed + laned by kind', () => {
    const items = toNotebookTimelineItems([
      mkEntry({ id: 'a', entryKind: 'observation' }),
      mkEntry({ id: 'b', entryKind: 'todo' }),
    ]);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(items[0]!.laneId).toBe('observation');
    expect(items[1]!.laneId).toBe('todo');
    // Notebook entries are points — never spans.
    expect(items[0]!.end).toBeUndefined();
    expect(items[0]!.start.getTime()).toBe(Date.parse('2026-05-10T12:00:00.000Z'));
  });
  it('drops entries with an unparseable entryAt', () => {
    const items = toNotebookTimelineItems([
      mkEntry({ id: 'good' }),
      mkEntry({ id: 'bad', entryAt: 'not-a-date' }),
    ]);
    expect(items.map((i) => i.id)).toEqual(['good']);
  });
});

describe('deriveNotebookTimelineRange()', () => {
  it('falls back to a 30-day window ending now when there are no items', () => {
    const now = new Date('2026-05-14T00:00:00.000Z');
    const range = deriveNotebookTimelineRange([], now);
    expect(range.end.getTime()).toBe(now.getTime());
    expect(range.start.getTime()).toBe(now.getTime() - 30 * DAY_MS);
  });

  it('gives a single entry a padded ±15-day window', () => {
    const items = toNotebookTimelineItems([
      mkEntry({ entryAt: '2026-05-10T00:00:00.000Z' }),
    ]);
    const range = deriveNotebookTimelineRange(items);
    const t = Date.parse('2026-05-10T00:00:00.000Z');
    expect(range.start.getTime()).toBe(t - 15 * DAY_MS);
    expect(range.end.getTime()).toBe(t + 15 * DAY_MS);
  });

  it('spans earliest→latest entry padded by one day each side', () => {
    const items = toNotebookTimelineItems([
      mkEntry({ id: 'a', entryAt: '2026-05-01T00:00:00.000Z' }),
      mkEntry({ id: 'b', entryAt: '2026-05-20T00:00:00.000Z' }),
      mkEntry({ id: 'c', entryAt: '2026-05-10T00:00:00.000Z' }),
    ]);
    const range = deriveNotebookTimelineRange(items);
    expect(range.start.getTime()).toBe(
      Date.parse('2026-05-01T00:00:00.000Z') - DAY_MS,
    );
    expect(range.end.getTime()).toBe(
      Date.parse('2026-05-20T00:00:00.000Z') + DAY_MS,
    );
  });
});
