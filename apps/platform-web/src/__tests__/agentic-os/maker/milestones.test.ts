/**
 * Maker OS — unit tests for milestones.ts (Phase 3 milestone helpers).
 *
 * Covers:
 *   - MILESTONE_STATUS_VALUES + labels.
 *   - milestoneStatus precedence: done > overdue > due_soon > upcoming > undated.
 *   - sortMilestones: due-dated first by date, undated last by sort_order.
 *   - summarizeMilestones: done / overdue / dueSoon counts.
 *   - Validators reject invalid input.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  MILESTONE_STATUS_VALUES,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STORED_STATUS_VALUES,
  MILESTONE_STORED_STATUS_LABELS,
  MILESTONE_PRIORITY_VALUES,
  MILESTONE_PRIORITY_LABELS,
  milestoneStatus,
  sortMilestones,
  sortMilestonesByDeadline,
  summarizeMilestones,
  validateDueAt,
  validateMilestoneLabel,
  validateSortOrder,
  validateMilestoneStatus,
  validateMilestonePriority,
  type BuildMilestone,
} from '@/lib/agentic-os/maker/milestones';

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

describe('MILESTONE_STATUS_VALUES + labels', () => {
  it('contains the 5 locked values', () => {
    expect(MILESTONE_STATUS_VALUES).toEqual([
      'done',
      'overdue',
      'due_soon',
      'upcoming',
      'undated',
    ]);
  });

  it('every status has a label', () => {
    for (const s of MILESTONE_STATUS_VALUES) {
      expect(MILESTONE_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe('milestoneStatus precedence', () => {
  it('done wins regardless of due_at', () => {
    expect(
      milestoneStatus(
        { completedAt: '2026-05-11T00:00:00Z', dueAt: '2026-04-01' },
        TODAY,
      ),
    ).toBe('done');
  });

  it('overdue when due_at < today and not complete', () => {
    expect(milestoneStatus({ completedAt: null, dueAt: '2026-05-10' }, TODAY)).toBe(
      'overdue',
    );
  });

  it('due_soon when due_at is within 7 days inclusive', () => {
    expect(milestoneStatus({ completedAt: null, dueAt: '2026-05-11' }, TODAY)).toBe(
      'due_soon',
    );
    expect(milestoneStatus({ completedAt: null, dueAt: '2026-05-18' }, TODAY)).toBe(
      'due_soon',
    );
  });

  it('upcoming when due_at is > 7 days away', () => {
    expect(milestoneStatus({ completedAt: null, dueAt: '2026-05-19' }, TODAY)).toBe(
      'upcoming',
    );
    expect(milestoneStatus({ completedAt: null, dueAt: '2026-12-31' }, TODAY)).toBe(
      'upcoming',
    );
  });

  it('undated when due_at is null', () => {
    expect(milestoneStatus({ completedAt: null, dueAt: null }, TODAY)).toBe('undated');
  });

  it('undated when due_at fails to parse', () => {
    expect(milestoneStatus({ completedAt: null, dueAt: 'not-a-date' }, TODAY)).toBe(
      'undated',
    );
  });
});

describe('sortMilestones', () => {
  it('sorts due-dated milestones by date ASC', () => {
    const out = sortMilestones([
      makeMilestone({ id: 'a', dueAt: '2026-06-01' }),
      makeMilestone({ id: 'b', dueAt: '2026-05-15' }),
      makeMilestone({ id: 'c', dueAt: '2026-05-20' }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('places undated milestones after dated ones', () => {
    const out = sortMilestones([
      makeMilestone({ id: 'a', dueAt: null, sortOrder: 5 }),
      makeMilestone({ id: 'b', dueAt: '2026-12-01' }),
      makeMilestone({ id: 'c', dueAt: null, sortOrder: 2 }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('ties broken by sortOrder ASC then createdAt ASC', () => {
    const out = sortMilestones([
      makeMilestone({
        id: 'a',
        dueAt: '2026-06-01',
        sortOrder: 3,
        createdAt: '2026-01-01',
      }),
      makeMilestone({
        id: 'b',
        dueAt: '2026-06-01',
        sortOrder: 1,
        createdAt: '2026-01-01',
      }),
      makeMilestone({
        id: 'c',
        dueAt: '2026-06-01',
        sortOrder: 1,
        createdAt: '2026-02-01',
      }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate input', () => {
    const input = [
      makeMilestone({ id: 'a', dueAt: '2026-06-01' }),
      makeMilestone({ id: 'b', dueAt: '2026-05-15' }),
    ];
    sortMilestones(input);
    expect(input.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('summarizeMilestones', () => {
  it('counts done, overdue, dueSoon separately', () => {
    const stats = summarizeMilestones(
      [
        makeMilestone({ id: '1', completedAt: '2026-04-01T00:00:00Z' }),
        makeMilestone({ id: '2', dueAt: '2026-04-01' }), // overdue
        makeMilestone({ id: '3', dueAt: '2026-05-12' }), // due soon
        makeMilestone({ id: '4', dueAt: '2026-12-01' }), // upcoming
        makeMilestone({ id: '5', dueAt: null }), // undated
      ],
      TODAY,
    );
    expect(stats.total).toBe(5);
    expect(stats.done).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.dueSoon).toBe(1);
  });

  it('handles an empty list cleanly', () => {
    const stats = summarizeMilestones([], TODAY);
    expect(stats).toEqual({ total: 0, done: 0, overdue: 0, dueSoon: 0 });
  });
});

describe('validateMilestoneLabel', () => {
  it('accepts non-empty short label', () => {
    expect(validateMilestoneLabel('Frame welded')).toBeNull();
  });

  it('rejects empty / whitespace', () => {
    expect(validateMilestoneLabel('')).toMatch(/required/);
    expect(validateMilestoneLabel('  ')).toMatch(/required/);
  });

  it('rejects > 200 chars', () => {
    expect(validateMilestoneLabel('x'.repeat(201))).toMatch(/200/);
  });

  it('rejects non-string', () => {
    expect(validateMilestoneLabel(0 as never)).toMatch(/string/);
  });
});

describe('validateDueAt', () => {
  it('accepts null and ISO calendar date', () => {
    expect(validateDueAt(null)).toBeNull();
    expect(validateDueAt('2026-12-31')).toBeNull();
  });

  it('rejects non-string', () => {
    expect(validateDueAt(0 as never)).toMatch(/string/);
  });

  it('rejects malformed date', () => {
    expect(validateDueAt('2026/12/31')).toMatch(/YYYY-MM-DD/);
    expect(validateDueAt('2026-12-32')).toMatch(/calendar/);
    expect(validateDueAt('foo')).toMatch(/YYYY-MM-DD/);
  });
});

describe('validateSortOrder', () => {
  it('accepts null and integers', () => {
    expect(validateSortOrder(null)).toBeNull();
    expect(validateSortOrder(0)).toBeNull();
    expect(validateSortOrder(-5)).toBeNull();
    expect(validateSortOrder(1000)).toBeNull();
  });

  it('rejects non-integer / non-numeric', () => {
    expect(validateSortOrder(1.5)).toMatch(/integer/);
    expect(validateSortOrder('1' as never)).toMatch(/number/);
    expect(validateSortOrder(Number.NaN)).toMatch(/number/);
  });
});

// ─── Phase 6 — stored status / priority / deadline alias ──────────────────

describe('MILESTONE_STORED_STATUS_VALUES + labels', () => {
  it('contains the 6 locked stored statuses', () => {
    expect(MILESTONE_STORED_STATUS_VALUES).toEqual([
      'pending',
      'at_risk',
      'blocked',
      'on_track',
      'done',
      'missed',
    ]);
  });

  it('every stored status has a label', () => {
    for (const s of MILESTONE_STORED_STATUS_VALUES) {
      expect(MILESTONE_STORED_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe('MILESTONE_PRIORITY_VALUES + labels', () => {
  it('contains the 4 locked priority values', () => {
    expect(MILESTONE_PRIORITY_VALUES).toEqual([
      'low',
      'medium',
      'high',
      'critical',
    ]);
  });

  it('every priority has a label', () => {
    for (const p of MILESTONE_PRIORITY_VALUES) {
      expect(MILESTONE_PRIORITY_LABELS[p]).toBeTruthy();
    }
  });
});

describe('validateMilestoneStatus', () => {
  it('accepts each locked stored status', () => {
    for (const s of MILESTONE_STORED_STATUS_VALUES) {
      expect(validateMilestoneStatus(s)).toBeNull();
    }
  });
  it('rejects unknown value', () => {
    expect(validateMilestoneStatus('bogus')).toMatch(/status must be one of/);
  });
  it('rejects non-string', () => {
    expect(validateMilestoneStatus(0 as never)).toMatch(/status must be one of/);
  });
});

describe('validateMilestonePriority', () => {
  it('accepts each locked priority value', () => {
    for (const p of MILESTONE_PRIORITY_VALUES) {
      expect(validateMilestonePriority(p)).toBeNull();
    }
  });
  it('rejects unknown value', () => {
    expect(validateMilestonePriority('urgent')).toMatch(/priority must be one of/);
  });
  it('rejects non-string', () => {
    expect(validateMilestonePriority(0 as never)).toMatch(/priority must be one of/);
  });
});

describe('sortMilestonesByDeadline', () => {
  it('is an alias for sortMilestones', () => {
    expect(sortMilestonesByDeadline).toBe(sortMilestones);
  });

  it('sorts dated milestones ascending by due_at', () => {
    const out = sortMilestonesByDeadline([
      makeMilestone({ id: 'late', dueAt: '2026-12-01' }),
      makeMilestone({ id: 'soon', dueAt: '2026-05-15' }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['soon', 'late']);
  });
});
