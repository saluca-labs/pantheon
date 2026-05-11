/**
 * Maker OS — unit tests for steps.ts (Phase 3 build-step helpers).
 *
 * Covers:
 *   - STEP_STATUS_VALUES contains the locked enum.
 *   - isStepComplete + stepStatus precedence (done > blocked > pending).
 *   - sortSteps + nextOrdinal pure behaviour.
 *   - summarizeSteps aggregation (done/blocked/pending counts + est minutes).
 *   - Validators reject invalid input and accept good values.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  STEP_STATUS_VALUES,
  STEP_STATUS_LABELS,
  isStepComplete,
  stepStatus,
  sortSteps,
  nextOrdinal,
  summarizeSteps,
  validateStepTitle,
  validateEstMinutes,
  validateOrdinal,
  type BuildStep,
} from '@/lib/agentic-os/maker/steps';

function makeStep(over: Partial<BuildStep> = {}): BuildStep {
  return {
    id: 's-1',
    projectId: 'p-1',
    ordinal: 1,
    title: 'Step',
    body: null,
    estMinutes: null,
    completedAt: null,
    blockerText: null,
    metadata: {},
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('STEP_STATUS_VALUES + STEP_STATUS_LABELS', () => {
  it('contains the 3 locked values', () => {
    expect(STEP_STATUS_VALUES).toEqual(['pending', 'blocked', 'done']);
  });

  it('every value has a label', () => {
    for (const v of STEP_STATUS_VALUES) {
      expect(STEP_STATUS_LABELS[v]).toBeTruthy();
    }
  });
});

describe('isStepComplete', () => {
  it('true when completed_at is set', () => {
    expect(isStepComplete(makeStep({ completedAt: '2026-05-11T00:00:00Z' }))).toBe(true);
  });

  it('false when completed_at is null', () => {
    expect(isStepComplete(makeStep({ completedAt: null }))).toBe(false);
  });
});

describe('stepStatus precedence', () => {
  it('returns done when completed_at is set', () => {
    expect(
      stepStatus({ completedAt: '2026-05-11T00:00:00Z', blockerText: 'stuck' }),
    ).toBe('done');
  });

  it('returns blocked when blocker_text set and not complete', () => {
    expect(stepStatus({ completedAt: null, blockerText: 'waiting on tap' })).toBe('blocked');
  });

  it('returns pending when neither completed nor blocked', () => {
    expect(stepStatus({ completedAt: null, blockerText: null })).toBe('pending');
  });

  it('treats whitespace-only blocker as pending', () => {
    expect(stepStatus({ completedAt: null, blockerText: '   ' })).toBe('pending');
  });
});

describe('sortSteps', () => {
  it('sorts by ordinal ascending', () => {
    const out = sortSteps([
      makeStep({ id: 'a', ordinal: 3 }),
      makeStep({ id: 'b', ordinal: 1 }),
      makeStep({ id: 'c', ordinal: 2 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns a new array (does not mutate input)', () => {
    const input = [makeStep({ id: 'a', ordinal: 2 }), makeStep({ id: 'b', ordinal: 1 })];
    sortSteps(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('nextOrdinal', () => {
  it('returns 1 for an empty list', () => {
    expect(nextOrdinal([])).toBe(1);
  });

  it('returns MAX(ordinal) + 1', () => {
    expect(
      nextOrdinal([
        makeStep({ ordinal: 5 }),
        makeStep({ ordinal: 2 }),
        makeStep({ ordinal: 8 }),
      ]),
    ).toBe(9);
  });
});

describe('summarizeSteps', () => {
  it('counts done/blocked/pending separately', () => {
    const stats = summarizeSteps([
      makeStep({ id: '1', completedAt: '2026-05-11T00:00:00Z' }),
      makeStep({ id: '2', blockerText: 'stuck' }),
      makeStep({ id: '3' }),
      makeStep({ id: '4' }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.done).toBe(1);
    expect(stats.blocked).toBe(1);
    expect(stats.pending).toBe(2);
  });

  it('sums totalEstMinutes across all steps', () => {
    const stats = summarizeSteps([
      makeStep({ estMinutes: 30 }),
      makeStep({ estMinutes: 90 }),
      makeStep({ estMinutes: null }),
    ]);
    expect(stats.totalEstMinutes).toBe(120);
  });

  it('excludes done steps from remainingEstMinutes', () => {
    const stats = summarizeSteps([
      makeStep({ estMinutes: 30, completedAt: '2026-05-11T00:00:00Z' }),
      makeStep({ estMinutes: 90 }),
    ]);
    expect(stats.totalEstMinutes).toBe(120);
    expect(stats.remainingEstMinutes).toBe(90);
  });

  it('handles an empty list with zero totals', () => {
    const stats = summarizeSteps([]);
    expect(stats).toEqual({
      total: 0,
      done: 0,
      blocked: 0,
      pending: 0,
      totalEstMinutes: 0,
      remainingEstMinutes: 0,
    });
  });
});

describe('validateStepTitle', () => {
  it('accepts a normal title', () => {
    expect(validateStepTitle('Cut the channel')).toBeNull();
  });

  it('rejects empty / whitespace only', () => {
    expect(validateStepTitle('')).toMatch(/required/);
    expect(validateStepTitle('   ')).toMatch(/required/);
  });

  it('rejects > 200 characters', () => {
    expect(validateStepTitle('x'.repeat(201))).toMatch(/200 characters/);
  });

  it('rejects non-string input', () => {
    expect(validateStepTitle(42 as any)).toMatch(/string/);
  });
});

describe('validateEstMinutes', () => {
  it('accepts null', () => {
    expect(validateEstMinutes(null)).toBeNull();
  });

  it('accepts positive integers and zero', () => {
    expect(validateEstMinutes(0)).toBeNull();
    expect(validateEstMinutes(15)).toBeNull();
    expect(validateEstMinutes(3600)).toBeNull();
  });

  it('rejects negative numbers, non-integers, and NaN', () => {
    expect(validateEstMinutes(-1)).toMatch(/non-negative/);
    expect(validateEstMinutes(1.5)).toMatch(/integer/);
    expect(validateEstMinutes(Number.NaN)).toMatch(/number or null/);
  });

  it('rejects non-numeric input', () => {
    expect(validateEstMinutes('5' as any)).toMatch(/number or null/);
  });
});

describe('validateOrdinal', () => {
  it('accepts positive integers', () => {
    expect(validateOrdinal(1)).toBeNull();
    expect(validateOrdinal(100)).toBeNull();
  });

  it('rejects zero, negative, and non-integer', () => {
    expect(validateOrdinal(0)).toMatch(/positive/);
    expect(validateOrdinal(-1)).toMatch(/positive/);
    expect(validateOrdinal(1.5)).toMatch(/positive/);
  });

  it('rejects non-numeric input', () => {
    expect(validateOrdinal('1' as any)).toMatch(/must be a number/);
  });
});
