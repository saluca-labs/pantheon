/**
 * Autobiographer OS — sensitive-kinds taxonomy + validators.
 *
 * Locks the canonical token set + each helper's behaviour. Bumping a
 * label is OK; renaming a token requires a coordinated migration.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  SENSITIVE_KINDS,
  SENSITIVE_KIND_ACCENTS,
  SENSITIVE_KIND_DESCRIPTIONS,
  SENSITIVE_KIND_LABELS,
  asSensitiveKind,
  hasAnySensitiveKind,
  normalizeSensitiveKinds,
  validateSensitiveKindsStrict,
} from '@/lib/agentic-os/autobiographer/sensitive-kinds';

describe('SENSITIVE_KINDS taxonomy', () => {
  it('locks the 8-kind canonical set', () => {
    expect([...SENSITIVE_KINDS]).toEqual([
      'sexual',
      'abuse',
      'mental_health',
      'legal',
      'financial',
      'death',
      'medical',
      'other',
    ]);
  });

  it('every kind has a label, description, and accent', () => {
    for (const k of SENSITIVE_KINDS) {
      expect(SENSITIVE_KIND_LABELS[k]).toBeTruthy();
      expect(SENSITIVE_KIND_DESCRIPTIONS[k]).toBeTruthy();
      expect(SENSITIVE_KIND_ACCENTS[k]).toBeTruthy();
    }
  });
});

describe('asSensitiveKind', () => {
  it('returns the kind on canonical match', () => {
    expect(asSensitiveKind('death')).toBe('death');
    expect(asSensitiveKind('mental_health')).toBe('mental_health');
  });

  it('returns null on uppercase / extra spaces / typos', () => {
    expect(asSensitiveKind('Death')).toBeNull();
    expect(asSensitiveKind('mental health')).toBeNull();
    expect(asSensitiveKind('sexuall')).toBeNull();
  });

  it('returns null for non-strings', () => {
    expect(asSensitiveKind(null)).toBeNull();
    expect(asSensitiveKind(undefined)).toBeNull();
    expect(asSensitiveKind(42)).toBeNull();
    expect(asSensitiveKind({})).toBeNull();
  });
});

describe('normalizeSensitiveKinds', () => {
  it('returns sorted deduped list of valid kinds', () => {
    const out = normalizeSensitiveKinds(['death', 'legal', 'death', 'medical']);
    expect(out).toEqual(['death', 'legal', 'medical']);
  });

  it('drops invalid values silently', () => {
    const out = normalizeSensitiveKinds(['death', 'BOGUS', null, 7]);
    expect(out).toEqual(['death']);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeSensitiveKinds(null)).toEqual([]);
    expect(normalizeSensitiveKinds('death')).toEqual([]);
    expect(normalizeSensitiveKinds({})).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(normalizeSensitiveKinds([])).toEqual([]);
  });
});

describe('validateSensitiveKindsStrict', () => {
  it('returns sorted deduped list when every value is valid', () => {
    expect(validateSensitiveKindsStrict(['legal', 'abuse', 'legal'])).toEqual(
      ['abuse', 'legal'],
    );
  });

  it('throws on any unknown value', () => {
    expect(() =>
      validateSensitiveKindsStrict(['death', 'BOGUS']),
    ).toThrow(/Invalid sensitive_kind/);
  });

  it('throws on non-array input', () => {
    expect(() => validateSensitiveKindsStrict(null as never)).toThrow(
      /must be an array/,
    );
  });

  it('empty array returns []', () => {
    expect(validateSensitiveKindsStrict([])).toEqual([]);
  });
});

describe('hasAnySensitiveKind', () => {
  it('returns true when at least one valid kind is present', () => {
    expect(hasAnySensitiveKind(['death'])).toBe(true);
    expect(hasAnySensitiveKind(['BOGUS', 'death'])).toBe(true);
  });

  it('returns false for empty / invalid / missing', () => {
    expect(hasAnySensitiveKind([])).toBe(false);
    expect(hasAnySensitiveKind(['BOGUS'])).toBe(false);
    expect(hasAnySensitiveKind(null)).toBe(false);
    expect(hasAnySensitiveKind(undefined)).toBe(false);
  });
});
