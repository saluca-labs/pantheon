/**
 * Research OS Phase 6 — milestone domain pure-helper tests.
 *
 * Locks the milestone status taxonomy, priority taxonomy, derived
 * (display) status computation, deadline sort, and validators.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  MILESTONE_STATUS_VALUES,
  MILESTONE_PRIORITY_VALUES,
  milestoneDerivedStatus,
  sortMilestonesByDeadline,
  validateMilestoneTitle,
  validateMilestoneDueAt,
  validateMilestoneStatus,
  validateMilestonePriority,
  asMilestoneStatus,
  asMilestonePriority,
  type ExperimentMilestone,
} from '@/lib/agentic-os/research/milestones';

function mk(overrides: Partial<ExperimentMilestone> = {}): ExperimentMilestone {
  return {
    id: 'm-1',
    experimentId: 'exp-1',
    userId: 'u-1',
    title: 'Test',
    dueAt: null,
    status: 'pending',
    priority: 'medium',
    isBlocker: false,
    blockedReason: null,
    notesMd: null,
    completedAt: null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

const TODAY = new Date('2026-05-12T00:00:00Z');

describe('MILESTONE_STATUS_VALUES', () => {
  it('locks the 6 stored-status values', () => {
    expect([...MILESTONE_STATUS_VALUES]).toEqual([
      'pending',
      'at_risk',
      'blocked',
      'on_track',
      'done',
      'missed',
    ]);
  });
});

describe('MILESTONE_PRIORITY_VALUES', () => {
  it('locks the 4 priority values', () => {
    expect([...MILESTONE_PRIORITY_VALUES]).toEqual([
      'low',
      'medium',
      'high',
      'critical',
    ]);
  });
});

describe('milestoneDerivedStatus()', () => {
  it('returns done when completedAt is set', () => {
    expect(
      milestoneDerivedStatus(
        mk({ completedAt: '2026-05-10T00:00:00Z' }),
        TODAY,
      ),
    ).toBe('done');
  });

  it('returns undated when dueAt is null and not done', () => {
    expect(milestoneDerivedStatus(mk({}), TODAY)).toBe('undated');
  });

  it('returns overdue when dueAt < today', () => {
    expect(milestoneDerivedStatus(mk({ dueAt: '2026-05-10' }), TODAY)).toBe('overdue');
  });

  it('returns due_soon when dueAt in next 7 days', () => {
    expect(milestoneDerivedStatus(mk({ dueAt: '2026-05-15' }), TODAY)).toBe('due_soon');
    expect(milestoneDerivedStatus(mk({ dueAt: '2026-05-19' }), TODAY)).toBe('due_soon');
  });

  it('returns upcoming when dueAt > today + 7 days', () => {
    expect(milestoneDerivedStatus(mk({ dueAt: '2026-05-25' }), TODAY)).toBe('upcoming');
  });

  it('returns done over derived status (done beats overdue)', () => {
    expect(
      milestoneDerivedStatus(
        mk({ dueAt: '2026-01-01', completedAt: '2026-05-01T00:00:00Z' }),
        TODAY,
      ),
    ).toBe('done');
  });
});

describe('sortMilestonesByDeadline()', () => {
  it('puts dated rows first by dueAt ASC, undated last', () => {
    const a = mk({ id: 'a', dueAt: '2026-06-01' });
    const b = mk({ id: 'b', dueAt: null });
    const c = mk({ id: 'c', dueAt: '2026-05-15' });
    const sorted = sortMilestonesByDeadline([a, b, c]);
    expect(sorted.map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate input', () => {
    const items = [
      mk({ id: 'a', dueAt: '2026-06-01' }),
      mk({ id: 'b', dueAt: '2026-05-15' }),
    ];
    const before = items.map((m) => m.id);
    sortMilestonesByDeadline(items);
    expect(items.map((m) => m.id)).toEqual(before);
  });
});

describe('validateMilestoneTitle()', () => {
  it('returns null for a valid title', () => {
    expect(validateMilestoneTitle('A real title')).toBeNull();
  });
  it('rejects empty string', () => {
    expect(validateMilestoneTitle('')).toMatch(/required/);
  });
  it('rejects whitespace-only', () => {
    expect(validateMilestoneTitle('   ')).toMatch(/required/);
  });
  it('rejects > 200 chars', () => {
    expect(validateMilestoneTitle('x'.repeat(201))).toMatch(/200/);
  });
  it('rejects non-string', () => {
    expect(validateMilestoneTitle(123 as unknown)).toMatch(/string/);
  });
});

describe('validateMilestoneDueAt()', () => {
  it('returns null for valid YYYY-MM-DD', () => {
    expect(validateMilestoneDueAt('2026-05-12')).toBeNull();
  });
  it('returns null for null', () => {
    expect(validateMilestoneDueAt(null)).toBeNull();
  });
  it('rejects garbage string', () => {
    expect(validateMilestoneDueAt('not-a-date')).toMatch(/YYYY-MM-DD/);
  });
  it('rejects malformed dash positions', () => {
    expect(validateMilestoneDueAt('2026/05/12')).toMatch(/YYYY-MM-DD/);
  });
});

describe('validateMilestoneStatus / validateMilestonePriority', () => {
  it('accepts every taxonomy value', () => {
    for (const s of MILESTONE_STATUS_VALUES) {
      expect(validateMilestoneStatus(s)).toBeNull();
    }
    for (const p of MILESTONE_PRIORITY_VALUES) {
      expect(validateMilestonePriority(p)).toBeNull();
    }
  });
  it('rejects unknown values', () => {
    expect(validateMilestoneStatus('lol')).toMatch(/status must be one of/);
    expect(validateMilestonePriority('mid')).toMatch(/priority must be one of/);
  });
});

describe('asMilestoneStatus / asMilestonePriority', () => {
  it('returns the value when valid', () => {
    expect(asMilestoneStatus('pending')).toBe('pending');
    expect(asMilestonePriority('high')).toBe('high');
  });
  it('returns null when invalid', () => {
    expect(asMilestoneStatus('lol')).toBeNull();
    expect(asMilestonePriority('mid')).toBeNull();
  });
});
