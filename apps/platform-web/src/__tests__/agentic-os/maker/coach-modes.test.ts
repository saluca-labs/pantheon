/**
 * Maker OS Phase 7 — coach modes taxonomy tests.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  COACH_MODE_STARTERS,
  COACH_MODE_VALUES,
  isCoachMode,
} from '@/lib/agentic-os/maker/coach/modes';

describe('COACH_MODE_VALUES', () => {
  it('exposes the 4 locked modes in the spec order', () => {
    expect(COACH_MODE_VALUES).toEqual([
      'procurement_advisor',
      'build_planner',
      'shop_safety',
      'general',
    ]);
  });

  it('is exposed as a readonly tuple at the type level', () => {
    // Touch the const to confirm export is readonly via TS.
    const v: readonly string[] = COACH_MODE_VALUES;
    expect(v.length).toBe(4);
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
      expect(COACH_MODE_DESCRIPTIONS[m].length).toBeGreaterThan(20);
    }
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
});

describe('isCoachMode', () => {
  it('returns true for each known mode', () => {
    for (const m of COACH_MODE_VALUES) {
      expect(isCoachMode(m)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isCoachMode('not_a_mode')).toBe(false);
    expect(isCoachMode('PROCUREMENT_ADVISOR')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isCoachMode(undefined)).toBe(false);
    expect(isCoachMode(null)).toBe(false);
    expect(isCoachMode(42)).toBe(false);
    expect(isCoachMode({})).toBe(false);
    expect(isCoachMode([])).toBe(false);
  });
});
