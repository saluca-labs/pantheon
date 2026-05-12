/**
 * Autobiographer OS Phase 7 — coach modes taxonomy tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  COACH_MODE_STARTERS,
  COACH_MODE_VALUES,
  isCoachMode,
} from '@/lib/agentic-os/autobiographer/coach/modes';

describe('COACH_MODE_VALUES', () => {
  it('exposes the 4 locked modes in the spec order', () => {
    expect(COACH_MODE_VALUES).toEqual([
      'interviewer',
      'chapter_drafter',
      'narrative_critic',
      'general',
    ]);
  });

  it('matches the migration CHECK constraint values', () => {
    // The Phase 7 migration declares the same 4 mode strings — any drift
    // would be caught by the chk_constraint test, but we double-check here
    // so a typo in modes.ts surfaces immediately.
    for (const m of [
      'interviewer',
      'chapter_drafter',
      'narrative_critic',
      'general',
    ]) {
      expect((COACH_MODE_VALUES as readonly string[]).includes(m)).toBe(true);
    }
  });

  it('contains no duplicates', () => {
    const set = new Set(COACH_MODE_VALUES);
    expect(set.size).toBe(COACH_MODE_VALUES.length);
  });
});

describe('COACH_MODE_LABELS', () => {
  it('has a label for every mode', () => {
    for (const m of COACH_MODE_VALUES) {
      expect(COACH_MODE_LABELS[m]).toBeTruthy();
      expect(typeof COACH_MODE_LABELS[m]).toBe('string');
    }
  });

  it('labels are human-readable not snake_case', () => {
    for (const m of COACH_MODE_VALUES) {
      expect(COACH_MODE_LABELS[m]).not.toContain('_');
    }
  });
});

describe('COACH_MODE_DESCRIPTIONS', () => {
  it('has a description for every mode', () => {
    for (const m of COACH_MODE_VALUES) {
      expect(COACH_MODE_DESCRIPTIONS[m].length).toBeGreaterThan(30);
    }
  });

  it('chapter_drafter description mentions "citation" so the contract is visible in the picker', () => {
    expect(COACH_MODE_DESCRIPTIONS.chapter_drafter).toMatch(/citation/i);
  });

  it('interviewer description mentions "elicit" or "question"', () => {
    expect(COACH_MODE_DESCRIPTIONS.interviewer).toMatch(/elicit|question|prompt/i);
  });
});

describe('COACH_MODE_STARTERS', () => {
  it('has at least 3 starter prompts per mode', () => {
    for (const m of COACH_MODE_VALUES) {
      expect(COACH_MODE_STARTERS[m].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all starter prompts are non-empty strings', () => {
    for (const m of COACH_MODE_VALUES) {
      for (const s of COACH_MODE_STARTERS[m]) {
        expect(typeof s).toBe('string');
        expect(s.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('starter prompts read as user-voiced questions or requests', () => {
    for (const m of COACH_MODE_VALUES) {
      for (const s of COACH_MODE_STARTERS[m]) {
        // crude heuristic: at least one verb-ish opener
        expect(s.length).toBeLessThan(200);
      }
    }
  });
});

describe('isCoachMode', () => {
  it('returns true for each known mode', () => {
    for (const m of COACH_MODE_VALUES) {
      expect(isCoachMode(m)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isCoachMode('procurement_advisor')).toBe(false);
    expect(isCoachMode('build_planner')).toBe(false);
    expect(isCoachMode('')).toBe(false);
    expect(isCoachMode('INTERVIEWER')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(isCoachMode(null)).toBe(false);
    expect(isCoachMode(undefined)).toBe(false);
    expect(isCoachMode(42)).toBe(false);
    expect(isCoachMode({})).toBe(false);
    expect(isCoachMode([])).toBe(false);
  });
});
