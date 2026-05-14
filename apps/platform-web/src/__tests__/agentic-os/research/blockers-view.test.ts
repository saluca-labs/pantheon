/**
 * Research OS Wave D — workshop-blockers saved-view helper tests.
 *
 * Locks the filter + grouping logic + the built-in "Top blockers" default
 * view under the workshop blockers surface: the default view shape,
 * query equality, `filterBlockers` (kind / severity axes), and
 * experiment grouping.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import type { BlockerItem } from '@/lib/agentic-os/research/blockers';
import {
  ALL_BLOCKERS_QUERY,
  TOP_BLOCKERS_DEFAULT_VIEW,
  TOP_BLOCKERS_VIEW_ID,
  blockerQueryEquals,
  filterBlockers,
  groupBlockersByExperiment,
} from '@/lib/agentic-os/research/blockers-view';

function mkBlocker(overrides: Partial<BlockerItem> = {}): BlockerItem {
  return {
    kind: 'milestone',
    id: 'm-1',
    experimentId: 'exp-1',
    experimentName: 'Experiment One',
    title: 'Blocked milestone',
    severity: 'high',
    dueAt: null,
    status: 'blocked',
    reason: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TOP_BLOCKERS_DEFAULT_VIEW', () => {
  it('is a stable built-in high-severity view', () => {
    expect(TOP_BLOCKERS_DEFAULT_VIEW.id).toBe(TOP_BLOCKERS_VIEW_ID);
    expect(TOP_BLOCKERS_DEFAULT_VIEW.name).toBe('Top blockers');
    expect(TOP_BLOCKERS_DEFAULT_VIEW.query).toEqual({
      kind: 'all',
      severity: 'high',
    });
  });
  it('ALL_BLOCKERS_QUERY is the neutral reset', () => {
    expect(ALL_BLOCKERS_QUERY).toEqual({ kind: 'all', severity: 'all' });
  });
});

describe('blockerQueryEquals()', () => {
  it('is true for identical queries', () => {
    expect(
      blockerQueryEquals(
        { kind: 'milestone', severity: 'high' },
        { kind: 'milestone', severity: 'high' },
      ),
    ).toBe(true);
  });
  it('is false when any axis differs', () => {
    expect(
      blockerQueryEquals(
        { kind: 'milestone', severity: 'high' },
        { kind: 'dependency', severity: 'high' },
      ),
    ).toBe(false);
    expect(
      blockerQueryEquals(
        { kind: 'all', severity: 'high' },
        { kind: 'all', severity: 'all' },
      ),
    ).toBe(false);
  });
});

describe('filterBlockers()', () => {
  const list = [
    mkBlocker({ id: 'a', kind: 'milestone', severity: 'high' }),
    mkBlocker({ id: 'b', kind: 'milestone', severity: 'medium' }),
    mkBlocker({ id: 'c', kind: 'dependency', severity: 'medium' }),
  ];

  it('the Top blockers default view keeps only high-severity items', () => {
    expect(
      filterBlockers(list, TOP_BLOCKERS_DEFAULT_VIEW.query).map((i) => i.id),
    ).toEqual(['a']);
  });
  it('the reset query keeps everything', () => {
    expect(filterBlockers(list, ALL_BLOCKERS_QUERY).map((i) => i.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
  it('narrows by kind', () => {
    expect(
      filterBlockers(list, { kind: 'dependency', severity: 'all' }).map(
        (i) => i.id,
      ),
    ).toEqual(['c']);
  });
  it('applies kind + severity together', () => {
    expect(
      filterBlockers(list, { kind: 'milestone', severity: 'medium' }).map(
        (i) => i.id,
      ),
    ).toEqual(['b']);
  });
});

describe('groupBlockersByExperiment()', () => {
  it('groups items by experiment, preserving first-seen order', () => {
    const groups = groupBlockersByExperiment([
      mkBlocker({ id: 'a', experimentId: 'exp-2', experimentName: 'Two' }),
      mkBlocker({ id: 'b', experimentId: 'exp-1', experimentName: 'One' }),
      mkBlocker({ id: 'c', experimentId: 'exp-2', experimentName: 'Two' }),
    ]);
    expect(groups.map((g) => g.experimentId)).toEqual(['exp-2', 'exp-1']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['b']);
  });
  it('returns [] for an empty list', () => {
    expect(groupBlockersByExperiment([])).toEqual([]);
  });
});
