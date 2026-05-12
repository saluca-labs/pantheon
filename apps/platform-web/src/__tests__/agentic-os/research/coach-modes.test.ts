/**
 * Research OS Phase 7 — coach modes taxonomy tests.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  COACH_MODE_STARTERS,
  COACH_MODE_VALUES,
  EXPERIMENT_REQUIRED_MODES,
  isCoachMode,
  modeRequiresExperiment,
} from '@/lib/agentic-os/research/coach/modes';

describe('COACH_MODE_VALUES', () => {
  it('exposes the 4 locked modes in the spec order', () => {
    expect(COACH_MODE_VALUES).toEqual([
      'lit_reviewer',
      'hypothesis_critic',
      'methods_advisor',
      'general',
    ]);
  });

  it('matches the migration CHECK constraint values', () => {
    for (const m of [
      'lit_reviewer',
      'hypothesis_critic',
      'methods_advisor',
      'general',
    ]) {
      expect((COACH_MODE_VALUES as readonly string[]).includes(m)).toBe(true);
    }
  });

  it('contains no duplicates', () => {
    const set = new Set(COACH_MODE_VALUES);
    expect(set.size).toBe(COACH_MODE_VALUES.length);
  });

  it('does NOT include any Autobiographer mode strings', () => {
    for (const stray of ['interviewer', 'chapter_drafter', 'narrative_critic']) {
      expect((COACH_MODE_VALUES as readonly string[]).includes(stray)).toBe(false);
    }
  });

  it('does NOT include any Maker mode strings', () => {
    for (const stray of ['procurement_advisor', 'build_planner', 'shop_safety']) {
      expect((COACH_MODE_VALUES as readonly string[]).includes(stray)).toBe(false);
    }
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

  it('lit_reviewer description mentions papers or literature', () => {
    expect(COACH_MODE_DESCRIPTIONS.lit_reviewer.toLowerCase()).toMatch(
      /paper|literature|theme/,
    );
  });

  it('hypothesis_critic description mentions falsifiability or confounders', () => {
    expect(COACH_MODE_DESCRIPTIONS.hypothesis_critic.toLowerCase()).toMatch(
      /falsifia|confound|methodolog|skeptic/,
    );
  });

  it('methods_advisor description mentions IRB / IACUC / EHS or regulated', () => {
    expect(COACH_MODE_DESCRIPTIONS.methods_advisor.toLowerCase()).toMatch(
      /irb|iacuc|ehs|regulat/,
    );
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

  it('all starter prompts are under 200 chars', () => {
    for (const m of COACH_MODE_VALUES) {
      for (const s of COACH_MODE_STARTERS[m]) {
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
    expect(isCoachMode('interviewer')).toBe(false);
    expect(isCoachMode('chapter_drafter')).toBe(false);
    expect(isCoachMode('procurement_advisor')).toBe(false);
    expect(isCoachMode('')).toBe(false);
    expect(isCoachMode('LIT_REVIEWER')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(isCoachMode(null)).toBe(false);
    expect(isCoachMode(undefined)).toBe(false);
    expect(isCoachMode(42)).toBe(false);
    expect(isCoachMode({})).toBe(false);
    expect(isCoachMode([])).toBe(false);
  });
});

describe('EXPERIMENT_REQUIRED_MODES + modeRequiresExperiment', () => {
  it('methods_advisor is the only experiment-required mode', () => {
    expect([...EXPERIMENT_REQUIRED_MODES].sort()).toEqual(['methods_advisor']);
  });

  it('modeRequiresExperiment returns true for methods_advisor', () => {
    expect(modeRequiresExperiment('methods_advisor')).toBe(true);
  });

  it('modeRequiresExperiment returns false for the other 3 modes', () => {
    expect(modeRequiresExperiment('lit_reviewer')).toBe(false);
    expect(modeRequiresExperiment('hypothesis_critic')).toBe(false);
    expect(modeRequiresExperiment('general')).toBe(false);
  });
});
