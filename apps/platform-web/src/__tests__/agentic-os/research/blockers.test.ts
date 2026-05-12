/**
 * Research OS Phase 6 — top blockers feed pure-helper tests.
 *
 * Locks the spec-locked 2-tier severity recipe (high / medium), the
 * `milestoneBlockerSeverity` rules (overdue beats label), and the
 * ranking + limit-clamping helpers.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCKER_ITEM_KINDS,
  BLOCKER_SEVERITIES,
  BLOCKER_SEVERITY_RANK,
  rankBlockerItems,
  limitBlockerItems,
  clampBlockerLimit,
  milestoneBlockerSeverity,
  type BlockerItem,
} from '@/lib/agentic-os/research/blockers';

function mkBlocker(overrides: Partial<BlockerItem> = {}): BlockerItem {
  return {
    kind: 'milestone',
    id: 'b-1',
    experimentId: 'exp-1',
    experimentName: 'Test experiment',
    title: 'Test milestone',
    severity: 'high',
    dueAt: null,
    status: 'pending',
    reason: null,
    createdAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

const TODAY_ISO = '2026-05-12';
const CUTOFF_ISO = '2026-05-19'; // +7d

describe('BLOCKER_ITEM_KINDS', () => {
  it('locks the two kinds', () => {
    expect([...BLOCKER_ITEM_KINDS]).toEqual(['milestone', 'dependency']);
  });
});

describe('BLOCKER_SEVERITIES / RANK', () => {
  it('locks the 2-tier severity model', () => {
    expect([...BLOCKER_SEVERITIES]).toEqual(['high', 'medium']);
    expect(BLOCKER_SEVERITY_RANK.high).toBeGreaterThan(BLOCKER_SEVERITY_RANK.medium);
  });
});

describe('milestoneBlockerSeverity()', () => {
  it('done → null (excluded)', () => {
    expect(milestoneBlockerSeverity('done', '2026-01-01', TODAY_ISO, CUTOFF_ISO)).toBeNull();
  });

  it('missed → high', () => {
    expect(milestoneBlockerSeverity('missed', null, TODAY_ISO, CUTOFF_ISO)).toBe('high');
  });

  it('blocked → high', () => {
    expect(milestoneBlockerSeverity('blocked', null, TODAY_ISO, CUTOFF_ISO)).toBe('high');
  });

  it('on_track but overdue → high (overdue beats label)', () => {
    expect(milestoneBlockerSeverity('on_track', '2026-05-01', TODAY_ISO, CUTOFF_ISO)).toBe(
      'high',
    );
  });

  it('pending but overdue → high (overdue beats label)', () => {
    expect(milestoneBlockerSeverity('pending', '2026-05-01', TODAY_ISO, CUTOFF_ISO)).toBe(
      'high',
    );
  });

  it('at_risk within 7 days → medium', () => {
    expect(milestoneBlockerSeverity('at_risk', '2026-05-15', TODAY_ISO, CUTOFF_ISO)).toBe(
      'medium',
    );
    expect(milestoneBlockerSeverity('at_risk', CUTOFF_ISO, TODAY_ISO, CUTOFF_ISO)).toBe(
      'medium',
    );
  });

  it('at_risk undated → medium (author-flagged risk marker)', () => {
    expect(milestoneBlockerSeverity('at_risk', null, TODAY_ISO, CUTOFF_ISO)).toBe('medium');
  });

  it('at_risk overdue → high (overdue beats label)', () => {
    expect(milestoneBlockerSeverity('at_risk', '2026-05-01', TODAY_ISO, CUTOFF_ISO)).toBe(
      'high',
    );
  });

  it('at_risk beyond 7 days → null (does not qualify)', () => {
    expect(milestoneBlockerSeverity('at_risk', '2026-06-01', TODAY_ISO, CUTOFF_ISO)).toBeNull();
  });

  it('pending in future → null', () => {
    expect(milestoneBlockerSeverity('pending', '2026-06-01', TODAY_ISO, CUTOFF_ISO)).toBeNull();
  });

  it('on_track in future → null', () => {
    expect(milestoneBlockerSeverity('on_track', '2026-06-01', TODAY_ISO, CUTOFF_ISO)).toBeNull();
  });
});

describe('rankBlockerItems()', () => {
  it('sorts severity DESC first', () => {
    const items = [
      mkBlocker({ id: 'a', severity: 'medium' }),
      mkBlocker({ id: 'b', severity: 'high' }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked[0].id).toBe('b');
    expect(ranked[1].id).toBe('a');
  });

  it('within severity, dueAt ASC NULLS LAST', () => {
    const items = [
      mkBlocker({ id: 'undated', severity: 'high', dueAt: null }),
      mkBlocker({ id: 'late', severity: 'high', dueAt: '2026-06-01' }),
      mkBlocker({ id: 'early', severity: 'high', dueAt: '2026-05-01' }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked.map((i) => i.id)).toEqual(['early', 'late', 'undated']);
  });

  it('within severity + dueAt, createdAt ASC tiebreaker', () => {
    const items = [
      mkBlocker({
        id: 'newer',
        severity: 'medium',
        dueAt: null,
        createdAt: '2026-05-12T12:00:00.000Z',
      }),
      mkBlocker({
        id: 'older',
        severity: 'medium',
        dueAt: null,
        createdAt: '2026-05-10T10:00:00.000Z',
      }),
    ];
    const ranked = rankBlockerItems(items);
    expect(ranked.map((i) => i.id)).toEqual(['older', 'newer']);
  });

  it('does not mutate input', () => {
    const items = [mkBlocker({ id: 'a' }), mkBlocker({ id: 'b' })];
    const before = items.map((i) => i.id);
    rankBlockerItems(items);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe('clampBlockerLimit() / limitBlockerItems()', () => {
  it('defaults non-finite to 25', () => {
    expect(clampBlockerLimit(Number.NaN)).toBe(25);
  });
  it('clamps over-limit to 100 (spec lock)', () => {
    expect(clampBlockerLimit(200)).toBe(100);
    expect(clampBlockerLimit(101)).toBe(100);
  });
  it('clamps below-zero to 0', () => {
    expect(clampBlockerLimit(-5)).toBe(0);
  });
  it('preserves in-range values', () => {
    expect(clampBlockerLimit(25)).toBe(25);
    expect(clampBlockerLimit(50)).toBe(50);
  });
  it('limitBlockerItems clamps + slices', () => {
    const items = Array.from({ length: 150 }, (_, i) =>
      mkBlocker({ id: `${i}` }),
    );
    expect(limitBlockerItems(items, 200).length).toBe(100);
    expect(limitBlockerItems(items, 5).length).toBe(5);
    expect(limitBlockerItems(items, 0).length).toBe(0);
  });
});
