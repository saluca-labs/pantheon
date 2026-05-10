/**
 * Health OS Phase 1 — risk-flag engine + crisis-guard regression tests.
 *
 * Safety-critical paths exercised:
 *   1. PHQ-9 Q9 ≥ 1 always emits a `crisis-language` flag of `critical`
 *      severity, regardless of the total score. (Suicidal ideation
 *      override.)
 *   2. PHQ-9 score thresholds (10/15/20) emit the right kind/severity.
 *   3. GAD-7 score thresholds (10/15) emit the right kind/severity.
 *   4. Compound-risk fires only when stress ≥ 7, sleep == 'poor', and
 *      support == 'none' all hold.
 *   5. Free-text crisis-guard yields a `crisis-language` flag for known
 *      phrases and zero flags for neutral text.
 *
 * The engine is pure functions over typed inputs, so no mocks are
 * required.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateOnIntake,
  evaluateOnScreener,
  evaluateOnFreeText,
} from '@/lib/agentic-os/health/risk-flags';
import type { MentalProfile, HealthProfile } from '@/lib/agentic-os/health/repo';

function fakeMental(overrides: Partial<MentalProfile> = {}): MentalProfile {
  return {
    userId: 'u',
    tenantId: 't',
    stressBaseline: null,
    sleepQuality: null,
    supportSystem: null,
    currentTherapy: false,
    currentMeds: false,
    medNotes: null,
    goals: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakePhysical(): HealthProfile {
  return {
    userId: 'u',
    sex: null,
    dateOfBirth: null,
    heightCm: null,
    weightKg: null,
    activityLevel: null,
    goals: [],
    conditions: [],
    medications: [],
    allergies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('evaluateOnScreener — PHQ-9 Q9 always-critical override', () => {
  it('emits crisis-language critical when Q9 >= 1, even with low total', () => {
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 1];
    const flags = evaluateOnScreener('phq9', 1, { answers });
    const crisis = flags.find((f) => f.kind === 'crisis-language');
    expect(crisis).toBeDefined();
    expect(crisis?.severity).toBe('critical');
  });

  it('emits crisis-language alongside severity bucket on a max-score response', () => {
    const answers = [3, 3, 3, 3, 3, 3, 3, 3, 3];
    const flags = evaluateOnScreener('phq9', 27, { answers });
    expect(flags.some((f) => f.kind === 'crisis-language' && f.severity === 'critical')).toBe(true);
    expect(flags.some((f) => f.kind === 'phq9-severe' && f.severity === 'critical')).toBe(true);
  });

  it('does NOT emit crisis-language when Q9 == 0 even at high totals', () => {
    const answers = [3, 3, 3, 3, 3, 3, 3, 3, 0];
    const flags = evaluateOnScreener('phq9', 24, { answers });
    expect(flags.some((f) => f.kind === 'crisis-language')).toBe(false);
    expect(flags.some((f) => f.kind === 'phq9-severe')).toBe(true);
  });
});

describe('evaluateOnScreener — PHQ-9 thresholds', () => {
  it.each([
    [10, 'phq9-moderate', 'medium'],
    [14, 'phq9-moderate', 'medium'],
    [15, 'phq9-moderate-severe', 'high'],
    [19, 'phq9-moderate-severe', 'high'],
    [20, 'phq9-severe', 'critical'],
    [27, 'phq9-severe', 'critical'],
  ])('score=%d → kind=%s severity=%s', (score, kind, severity) => {
    const answers = new Array(9).fill(0); // suppress Q9 override
    const flags = evaluateOnScreener('phq9', score, { answers });
    const main = flags.find((f) => f.kind === kind);
    expect(main).toBeDefined();
    expect(main?.severity).toBe(severity);
  });

  it('emits no flags below the moderate threshold', () => {
    const answers = new Array(9).fill(0);
    expect(evaluateOnScreener('phq9', 0, { answers })).toEqual([]);
    expect(evaluateOnScreener('phq9', 9, { answers })).toEqual([]);
  });
});

describe('evaluateOnScreener — GAD-7 thresholds', () => {
  it.each([
    [10, 'gad7-moderate', 'medium'],
    [14, 'gad7-moderate', 'medium'],
    [15, 'gad7-severe', 'critical'],
    [21, 'gad7-severe', 'critical'],
  ])('score=%d → kind=%s severity=%s', (score, kind, severity) => {
    const flags = evaluateOnScreener('gad7', score);
    expect(flags.find((f) => f.kind === kind)?.severity).toBe(severity);
  });

  it('emits no flags below threshold', () => {
    expect(evaluateOnScreener('gad7', 9)).toEqual([]);
  });
});

describe('evaluateOnIntake — compound MH risk', () => {
  it('fires compound-mh-risk only when all three baseline triggers hold', () => {
    const mh = fakeMental({
      stressBaseline: 8,
      sleepQuality: 'poor',
      supportSystem: 'none',
    });
    const flags = evaluateOnIntake(fakePhysical(), mh);
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('high-stress');
    expect(kinds).toContain('poor-sleep');
    expect(kinds).toContain('no-support');
    expect(kinds).toContain('compound-mh-risk');
    expect(flags.find((f) => f.kind === 'compound-mh-risk')?.severity).toBe('high');
  });

  it('does not fire compound-mh-risk when any leg is missing', () => {
    const mh = fakeMental({
      stressBaseline: 8,
      sleepQuality: 'poor',
      supportSystem: 'limited',
    });
    const flags = evaluateOnIntake(fakePhysical(), mh);
    expect(flags.some((f) => f.kind === 'compound-mh-risk')).toBe(false);
    expect(flags.some((f) => f.kind === 'no-support')).toBe(false);
  });

  it('returns empty when mental profile is null', () => {
    expect(evaluateOnIntake(fakePhysical(), null)).toEqual([]);
  });

  it('high-stress fires at stress=7 and not at stress=6', () => {
    expect(
      evaluateOnIntake(fakePhysical(), fakeMental({ stressBaseline: 7 })).some(
        (f) => f.kind === 'high-stress',
      ),
    ).toBe(true);
    expect(
      evaluateOnIntake(fakePhysical(), fakeMental({ stressBaseline: 6 })).some(
        (f) => f.kind === 'high-stress',
      ),
    ).toBe(false);
  });
});

describe('evaluateOnFreeText — crisis-guard rules', () => {
  it('flags crisis phrases as critical', () => {
    const flags = evaluateOnFreeText('I want to kill myself');
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe('crisis-language');
    expect(flags[0]?.severity).toBe('critical');
  });

  it('does not flag neutral text', () => {
    expect(evaluateOnFreeText('I want to live a calmer life')).toEqual([]);
    expect(evaluateOnFreeText('killing it at the gym today')).toEqual([]);
  });

  it('handles null / empty input', () => {
    expect(evaluateOnFreeText(null)).toEqual([]);
    expect(evaluateOnFreeText('')).toEqual([]);
    expect(evaluateOnFreeText(undefined)).toEqual([]);
  });
});
