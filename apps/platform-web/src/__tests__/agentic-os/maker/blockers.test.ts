/**
 * Maker OS — unit tests for blockers.ts (Phase 6 severity ranking).
 *
 * Covers:
 *   - BLOCKER_SEVERITIES enumeration + rank order.
 *   - rankBlockerItems precedence: missed > blocked > overdue > at_risk > open_dep.
 *   - Tie-break by oldest dueAt for milestones, then createdAt, then id.
 *   - limitBlockerItems clamps at the 100 ceiling.
 *   - milestoneSeverity helper from milestones.ts (Phase 6 path).
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCKER_ITEM_KINDS,
  BLOCKER_SEVERITIES,
  BLOCKER_SEVERITY_RANK,
  BLOCKER_SEVERITY_LABELS,
  rankBlockerItems,
  limitBlockerItems,
  type BlockerItem,
} from '@/lib/agentic-os/maker/blockers';
import {
  milestoneSeverity,
  SEVERITY_SCORES,
  type BuildMilestone,
} from '@/lib/agentic-os/maker/milestones';

function makeItem(over: Partial<BlockerItem>): BlockerItem {
  return {
    kind: 'milestone',
    id: 'i-1',
    projectId: 'p-1',
    projectName: 'P1',
    title: 'Frame welded',
    severity: 'overdue',
    dueAt: null,
    status: 'pending',
    reason: null,
    createdAt: '2026-05-11T00:00:00Z',
    ...over,
  };
}

function makeMilestone(over: Partial<BuildMilestone> = {}): BuildMilestone {
  return {
    id: 'm-1',
    projectId: 'p-1',
    label: 'Frame welded',
    dueAt: null,
    completedAt: null,
    sortOrder: 0,
    notes: null,
    status: 'pending',
    priority: 'medium',
    isBlocker: false,
    blockedReason: null,
    metadata: {},
    createdAt: '2026-05-11T00:00:00Z',
    updatedAt: '2026-05-11T00:00:00Z',
    ...over,
  };
}

const TODAY = new Date('2026-05-11T12:00:00Z');

describe('BLOCKER_SEVERITIES + rank', () => {
  it('lists the 5 locked severities', () => {
    expect(BLOCKER_SEVERITIES).toEqual([
      'missed',
      'blocked',
      'overdue',
      'at_risk',
      'open_dependency',
    ]);
  });

  it('every severity has a label', () => {
    for (const s of BLOCKER_SEVERITIES) {
      expect(BLOCKER_SEVERITY_LABELS[s]).toBeTruthy();
    }
  });

  it('rank order is strictly descending', () => {
    expect(BLOCKER_SEVERITY_RANK.missed).toBe(5);
    expect(BLOCKER_SEVERITY_RANK.blocked).toBe(4);
    expect(BLOCKER_SEVERITY_RANK.overdue).toBe(3);
    expect(BLOCKER_SEVERITY_RANK.at_risk).toBe(2);
    expect(BLOCKER_SEVERITY_RANK.open_dependency).toBe(1);
  });

  it('item kinds are milestone + dependency only', () => {
    expect(BLOCKER_ITEM_KINDS).toEqual(['milestone', 'dependency']);
  });
});

describe('rankBlockerItems', () => {
  it('orders by severity rank (highest first)', () => {
    const items = [
      makeItem({ id: '1', severity: 'open_dependency', kind: 'dependency' }),
      makeItem({ id: '2', severity: 'missed' }),
      makeItem({ id: '3', severity: 'at_risk' }),
      makeItem({ id: '4', severity: 'overdue' }),
      makeItem({ id: '5', severity: 'blocked' }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked.map((i) => i.severity)).toEqual([
      'missed',
      'blocked',
      'overdue',
      'at_risk',
      'open_dependency',
    ]);
  });

  it('ties on milestone dueAt: oldest first', () => {
    const items = [
      makeItem({ id: 'a', severity: 'overdue', dueAt: '2026-04-10' }),
      makeItem({ id: 'b', severity: 'overdue', dueAt: '2026-04-01' }),
      makeItem({ id: 'c', severity: 'overdue', dueAt: '2026-04-15' }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('items with dueAt come before items without (same severity)', () => {
    const items = [
      makeItem({ id: 'no-due', severity: 'overdue', dueAt: null }),
      makeItem({ id: 'has-due', severity: 'overdue', dueAt: '2026-04-01' }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked.map((i) => i.id)).toEqual(['has-due', 'no-due']);
  });

  it('ties on createdAt for dependencies (and undated milestones)', () => {
    const items = [
      makeItem({
        id: 'newer',
        severity: 'open_dependency',
        kind: 'dependency',
        createdAt: '2026-05-10T00:00:00Z',
      }),
      makeItem({
        id: 'older',
        severity: 'open_dependency',
        kind: 'dependency',
        createdAt: '2026-04-01T00:00:00Z',
      }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked.map((i) => i.id)).toEqual(['older', 'newer']);
  });

  it('final tie-break by id (deterministic)', () => {
    const items = [
      makeItem({
        id: 'zzz',
        severity: 'overdue',
        dueAt: '2026-04-01',
        createdAt: '2026-04-01T00:00:00Z',
      }),
      makeItem({
        id: 'aaa',
        severity: 'overdue',
        dueAt: '2026-04-01',
        createdAt: '2026-04-01T00:00:00Z',
      }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked.map((i) => i.id)).toEqual(['aaa', 'zzz']);
  });

  it('does not mutate the input array', () => {
    const items = [
      makeItem({ id: '1', severity: 'open_dependency' }),
      makeItem({ id: '2', severity: 'missed' }),
    ];
    const before = items.map((i) => i.id).join(',');
    rankBlockerItems(items);
    expect(items.map((i) => i.id).join(',')).toBe(before);
  });
});

describe('limitBlockerItems', () => {
  it('returns at most N items', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      makeItem({ id: `i-${i}` }),
    );
    expect(limitBlockerItems(items, 5)).toHaveLength(5);
    expect(limitBlockerItems(items, 25)).toHaveLength(25);
  });

  it('caps at the 100 ceiling', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      makeItem({ id: `i-${i}` }),
    );
    expect(limitBlockerItems(items, 1000)).toHaveLength(100);
  });

  it('handles limit < 1 gracefully', () => {
    const items = [makeItem({ id: '1' })];
    expect(limitBlockerItems(items, 0)).toHaveLength(0);
    expect(limitBlockerItems(items, -5)).toHaveLength(0);
  });
});

describe('SEVERITY_SCORES (milestones helper)', () => {
  it('matches the BLOCKER_SEVERITY_RANK numbers', () => {
    expect(SEVERITY_SCORES.missed).toBe(BLOCKER_SEVERITY_RANK.missed);
    expect(SEVERITY_SCORES.blocked).toBe(BLOCKER_SEVERITY_RANK.blocked);
    expect(SEVERITY_SCORES.overdue).toBe(BLOCKER_SEVERITY_RANK.overdue);
    expect(SEVERITY_SCORES.at_risk).toBe(BLOCKER_SEVERITY_RANK.at_risk);
    expect(SEVERITY_SCORES.open_dependency).toBe(
      BLOCKER_SEVERITY_RANK.open_dependency,
    );
  });
});

describe('milestoneSeverity', () => {
  it('returns null when status=done', () => {
    expect(
      milestoneSeverity(makeMilestone({ status: 'done' }), TODAY),
    ).toBeNull();
  });

  it('returns missed when status=missed', () => {
    expect(
      milestoneSeverity(makeMilestone({ status: 'missed' }), TODAY),
    ).toBe('missed');
  });

  it('returns blocked when status=blocked', () => {
    expect(
      milestoneSeverity(makeMilestone({ status: 'blocked' }), TODAY),
    ).toBe('blocked');
  });

  it('returns overdue when dueAt < today and status != done', () => {
    expect(
      milestoneSeverity(
        makeMilestone({ status: 'pending', dueAt: '2026-04-01' }),
        TODAY,
      ),
    ).toBe('overdue');
  });

  it('returns at_risk for an at_risk milestone within 7 days', () => {
    expect(
      milestoneSeverity(
        makeMilestone({ status: 'at_risk', dueAt: '2026-05-15' }),
        TODAY,
      ),
    ).toBe('at_risk');
  });

  it('returns at_risk for undated at_risk milestones (lowest tier)', () => {
    expect(
      milestoneSeverity(
        makeMilestone({ status: 'at_risk', dueAt: null }),
        TODAY,
      ),
    ).toBe('at_risk');
  });

  it('returns null for at_risk milestones beyond the 7-day window', () => {
    expect(
      milestoneSeverity(
        makeMilestone({ status: 'at_risk', dueAt: '2026-06-01' }),
        TODAY,
      ),
    ).toBeNull();
  });

  it('overdue beats at_risk when both apply', () => {
    expect(
      milestoneSeverity(
        makeMilestone({ status: 'at_risk', dueAt: '2026-04-01' }),
        TODAY,
      ),
    ).toBe('overdue');
  });

  it('returns null for a pending in-window milestone', () => {
    expect(
      milestoneSeverity(
        makeMilestone({ status: 'pending', dueAt: '2026-12-01' }),
        TODAY,
      ),
    ).toBeNull();
  });

  it('returns null for on_track', () => {
    expect(
      milestoneSeverity(
        makeMilestone({ status: 'on_track', dueAt: '2026-05-12' }),
        TODAY,
      ),
    ).toBeNull();
  });
});
