/**
 * Autobiographer OS — voice-profiles (helpers) unit tests.
 *
 * Pure-function coverage for the validator + the three normalizers
 * (style adjectives, style rules, example openings) + the JSONB array
 * coercer. No DB and no mocks.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  EXAMPLE_OPENING_LENGTH_MAX,
  EXAMPLE_OPENINGS_MAX,
  STYLE_ADJECTIVE_MAX,
  STYLE_RULE_LENGTH_MAX,
  STYLE_RULES_MAX,
  STYLE_SUMMARY_MAX,
  STYLE_SUMMARY_MIN,
  coerceJsonArray,
  normalizeExampleOpenings,
  normalizeStyleAdjectives,
  normalizeStyleRules,
  validateStyleSummary,
} from '@/lib/agentic-os/autobiographer/voice-profiles';

describe('validateStyleSummary', () => {
  it('rejects non-strings', () => {
    expect(validateStyleSummary(null)).toMatch(/required/);
    expect(validateStyleSummary(123)).toMatch(/required/);
  });

  it('rejects too-short summaries', () => {
    const tooShort = 'a'.repeat(STYLE_SUMMARY_MIN - 1);
    expect(validateStyleSummary(tooShort)).toMatch(/at least/);
  });

  it('rejects too-long summaries', () => {
    const tooLong = 'a'.repeat(STYLE_SUMMARY_MAX + 1);
    expect(validateStyleSummary(tooLong)).toMatch(/characters or fewer/);
  });

  it('accepts a 3-sentence summary in the sweet spot', () => {
    const summary =
      'The voice is warm and observational. Sentences run long, with embedded clauses. Imagery favors the kitchen and the road.';
    expect(validateStyleSummary(summary)).toBeNull();
  });
});

describe('normalizeStyleAdjectives', () => {
  it('drops empty / whitespace entries', () => {
    expect(normalizeStyleAdjectives(['warm', '', '   ', 'wry'])).toEqual([
      'warm',
      'wry',
    ]);
  });

  it('dedupes case-insensitively, preserves first-seen casing', () => {
    expect(normalizeStyleAdjectives(['Warm', 'warm', 'WARM', 'wry'])).toEqual([
      'Warm',
      'wry',
    ]);
  });

  it('drops non-string entries', () => {
    expect(
      normalizeStyleAdjectives(['warm', null as any, 5 as any, 'wry']),
    ).toEqual(['warm', 'wry']);
  });

  it('caps at STYLE_ADJECTIVE_MAX entries', () => {
    const many = Array.from(
      { length: STYLE_ADJECTIVE_MAX + 5 },
      (_, i) => `adj${i}`,
    );
    expect(normalizeStyleAdjectives(many)).toHaveLength(STYLE_ADJECTIVE_MAX);
  });

  it('trims each adjective', () => {
    expect(normalizeStyleAdjectives(['  warm  '])).toEqual(['warm']);
  });
});

describe('normalizeStyleRules', () => {
  it('drops non-string + empty entries', () => {
    expect(
      normalizeStyleRules(['Use short sentences', '', null as any, 12 as any]),
    ).toEqual(['Use short sentences']);
  });

  it('truncates rules over STYLE_RULE_LENGTH_MAX with an ellipsis', () => {
    const tooLong = 'a'.repeat(STYLE_RULE_LENGTH_MAX + 50);
    const [only] = normalizeStyleRules([tooLong]);
    expect(only!.endsWith('…')).toBe(true);
    expect(only!.length).toBe(STYLE_RULE_LENGTH_MAX);
  });

  it('caps at STYLE_RULES_MAX entries', () => {
    const many = Array.from(
      { length: STYLE_RULES_MAX + 5 },
      (_, i) => `Rule ${i}`,
    );
    expect(normalizeStyleRules(many)).toHaveLength(STYLE_RULES_MAX);
  });

  it('trims each rule', () => {
    expect(normalizeStyleRules(['  Use short sentences  '])).toEqual([
      'Use short sentences',
    ]);
  });
});

describe('normalizeExampleOpenings', () => {
  it('drops non-string + empty entries', () => {
    expect(
      normalizeExampleOpenings([
        'The kitchen smelled like rain.',
        '',
        null as any,
      ]),
    ).toEqual(['The kitchen smelled like rain.']);
  });

  it('truncates openings over EXAMPLE_OPENING_LENGTH_MAX with an ellipsis', () => {
    const tooLong = 'a'.repeat(EXAMPLE_OPENING_LENGTH_MAX + 50);
    const [only] = normalizeExampleOpenings([tooLong]);
    expect(only!.endsWith('…')).toBe(true);
    expect(only!.length).toBe(EXAMPLE_OPENING_LENGTH_MAX);
  });

  it('caps at EXAMPLE_OPENINGS_MAX entries', () => {
    const many = Array.from(
      { length: EXAMPLE_OPENINGS_MAX + 5 },
      (_, i) => `Opening ${i}`,
    );
    expect(normalizeExampleOpenings(many)).toHaveLength(EXAMPLE_OPENINGS_MAX);
  });
});

describe('coerceJsonArray', () => {
  it('returns arrays as-is', () => {
    expect(coerceJsonArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('parses JSON-stringified arrays', () => {
    expect(coerceJsonArray('["a", "b"]')).toEqual(['a', 'b']);
  });

  it('returns empty array on bad JSON string', () => {
    expect(coerceJsonArray('not json')).toEqual([]);
  });

  it('returns empty array on non-array JSON string', () => {
    expect(coerceJsonArray('{"a": 1}')).toEqual([]);
  });

  it('returns empty array on null / undefined / number', () => {
    expect(coerceJsonArray(null)).toEqual([]);
    expect(coerceJsonArray(undefined)).toEqual([]);
    expect(coerceJsonArray(123)).toEqual([]);
  });
});
