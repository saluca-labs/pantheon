/**
 * Autobiographer OS — chapter-sources domain helpers.
 *
 * Pure-function tests for the weight clamp + notes validator.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  SOURCE_NOTES_MAX,
  SOURCE_WEIGHT_MAX,
  SOURCE_WEIGHT_MIN,
  coerceSourceWeight,
  validateSourceNotes,
  validateSourceWeight,
} from '@/lib/agentic-os/autobiographer/chapter-sources';

describe('validateSourceWeight', () => {
  it('accepts undefined / null', () => {
    expect(validateSourceWeight(undefined)).toBeNull();
    expect(validateSourceWeight(null)).toBeNull();
  });

  it('accepts numbers in [0..1]', () => {
    expect(validateSourceWeight(0)).toBeNull();
    expect(validateSourceWeight(0.5)).toBeNull();
    expect(validateSourceWeight(1)).toBeNull();
  });

  it('rejects out-of-range numbers', () => {
    expect(validateSourceWeight(-0.1)).not.toBeNull();
    expect(validateSourceWeight(1.5)).not.toBeNull();
  });

  it('rejects non-numbers', () => {
    expect(validateSourceWeight('1')).not.toBeNull();
    expect(validateSourceWeight(NaN)).not.toBeNull();
    expect(validateSourceWeight(Infinity)).not.toBeNull();
  });
});

describe('validateSourceNotes', () => {
  it('accepts undefined / null / empty', () => {
    expect(validateSourceNotes(undefined)).toBeNull();
    expect(validateSourceNotes(null)).toBeNull();
    expect(validateSourceNotes('')).toBeNull();
  });

  it('rejects too-long notes', () => {
    expect(validateSourceNotes('x'.repeat(SOURCE_NOTES_MAX + 1))).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateSourceNotes(42)).not.toBeNull();
  });
});

describe('coerceSourceWeight', () => {
  it('clamps to [min..max]', () => {
    expect(coerceSourceWeight(-1)).toBe(SOURCE_WEIGHT_MIN);
    expect(coerceSourceWeight(99)).toBe(SOURCE_WEIGHT_MAX);
    expect(coerceSourceWeight(0.5)).toBe(0.5);
  });

  it('falls back when value is not numeric', () => {
    expect(coerceSourceWeight('hi', 0.42)).toBe(0.42);
    expect(coerceSourceWeight(undefined, 1)).toBe(1);
    expect(coerceSourceWeight(NaN, 0.7)).toBe(0.7);
  });
});
