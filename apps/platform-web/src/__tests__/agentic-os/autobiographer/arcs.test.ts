/**
 * Autobiographer OS — arcs domain tests.
 *
 * Pure-function coverage for kind enum, validators, and constants.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  ARC_DESCRIPTION_MAX,
  ARC_KINDS,
  ARC_KIND_LABELS,
  ARC_TITLE_MAX,
  validateArcDescription,
  validateArcKind,
  validateArcTitle,
} from '@/lib/agentic-os/autobiographer/arcs';

describe('ARC_KINDS + labels', () => {
  it('declares exactly the four kinds', () => {
    expect(ARC_KINDS).toEqual([
      'chronological',
      'thematic',
      'character_led',
      'custom',
    ]);
  });
  it('has a label for every kind', () => {
    for (const k of ARC_KINDS) {
      expect(ARC_KIND_LABELS[k]).toBeTruthy();
    }
  });
});

describe('validateArcTitle', () => {
  it('requires non-empty string', () => {
    expect(validateArcTitle('')).toMatch(/required/i);
    expect(validateArcTitle('   ')).toMatch(/required/i);
    expect(validateArcTitle(null)).toMatch(/required/i);
  });
  it('caps length', () => {
    expect(validateArcTitle('x'.repeat(ARC_TITLE_MAX + 1))).toMatch(/255/);
  });
  it('accepts valid title', () => {
    expect(validateArcTitle('Chronological')).toBeNull();
  });
});

describe('validateArcKind', () => {
  it('rejects unknown kind', () => {
    expect(validateArcKind('mystery')).toMatch(/one of/);
    expect(validateArcKind(42)).toMatch(/one of/);
  });
  it('accepts every documented kind', () => {
    for (const k of ARC_KINDS) {
      expect(validateArcKind(k)).toBeNull();
    }
  });
});

describe('validateArcDescription', () => {
  it('returns null on absent', () => {
    expect(validateArcDescription(null)).toBeNull();
    expect(validateArcDescription(undefined)).toBeNull();
  });
  it('rejects non-string', () => {
    expect(validateArcDescription(42)).toMatch(/string/);
  });
  it('caps length', () => {
    expect(validateArcDescription('x'.repeat(ARC_DESCRIPTION_MAX + 1))).toMatch(
      /4000/,
    );
  });
});
