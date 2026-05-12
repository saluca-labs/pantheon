/**
 * Autobiographer OS — voice-samples (helpers) unit tests.
 *
 * Pure-function coverage for the validators, word-count helper, and
 * title-derivation helper. No DB and no mocks.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  VOICE_SAMPLE_BODY_MAX,
  VOICE_SAMPLE_MIN_WORDS,
  VOICE_SAMPLE_TITLE_MAX,
  countVoiceSampleWords,
  deriveVoiceSampleTitle,
  validateVoiceSampleBody,
  validateVoiceSampleTitle,
} from '@/lib/agentic-os/autobiographer/voice-samples';

describe('validateVoiceSampleTitle', () => {
  it('passes null + undefined (title is optional)', () => {
    expect(validateVoiceSampleTitle(null)).toBeNull();
    expect(validateVoiceSampleTitle(undefined)).toBeNull();
  });

  it('rejects non-string inputs', () => {
    expect(validateVoiceSampleTitle(123)).toMatch(/must be a string/);
  });

  it('passes the empty string (the form sends "" rather than null)', () => {
    expect(validateVoiceSampleTitle('')).toBeNull();
  });

  it('rejects strings over VOICE_SAMPLE_TITLE_MAX', () => {
    const tooLong = 'a'.repeat(VOICE_SAMPLE_TITLE_MAX + 1);
    expect(validateVoiceSampleTitle(tooLong)).toMatch(/characters or fewer/);
  });
});

describe('validateVoiceSampleBody', () => {
  it('rejects non-string', () => {
    expect(validateVoiceSampleBody(null)).toMatch(/required/);
    expect(validateVoiceSampleBody(undefined)).toMatch(/required/);
    expect(validateVoiceSampleBody(0)).toMatch(/required/);
  });

  it('rejects whitespace-only bodies', () => {
    expect(validateVoiceSampleBody('   \n\t')).toMatch(/required/);
  });

  it('passes any non-whitespace string', () => {
    expect(validateVoiceSampleBody('A')).toBeNull();
  });

  it('rejects strings over VOICE_SAMPLE_BODY_MAX', () => {
    const tooLong = 'a'.repeat(VOICE_SAMPLE_BODY_MAX + 1);
    expect(validateVoiceSampleBody(tooLong)).toMatch(/characters or fewer/);
  });
});

describe('countVoiceSampleWords', () => {
  it('returns 0 for empty / whitespace-only strings', () => {
    expect(countVoiceSampleWords('')).toBe(0);
    expect(countVoiceSampleWords('   \n  ')).toBe(0);
  });

  it('counts simple words by whitespace', () => {
    expect(countVoiceSampleWords('hello world')).toBe(2);
  });

  it('collapses any whitespace runs', () => {
    expect(countVoiceSampleWords('one   two\nthree\tfour')).toBe(4);
  });

  it('counts a 1-word string as 1', () => {
    expect(countVoiceSampleWords('   solitary   ')).toBe(1);
  });
});

describe('deriveVoiceSampleTitle', () => {
  it('returns the literal short body when short enough', () => {
    expect(deriveVoiceSampleTitle('Short sample')).toBe('Short sample');
  });

  it('returns "Untitled sample" on empty body', () => {
    expect(deriveVoiceSampleTitle('')).toBe('Untitled sample');
    expect(deriveVoiceSampleTitle('   ')).toBe('Untitled sample');
  });

  it('truncates long bodies on a word boundary with an ellipsis', () => {
    const body =
      'The quick brown fox jumps over the lazy dog and a hundred more words';
    const out = deriveVoiceSampleTitle(body, 30);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(30);
    // Should not split inside a word — last non-ellipsis char is a letter.
    const before = out.replace(/…$/, '');
    expect(before).not.toMatch(/\s$/);
  });

  it('collapses runs of whitespace in the source', () => {
    expect(deriveVoiceSampleTitle('one   two')).toBe('one two');
  });
});

describe('VOICE_SAMPLE_MIN_WORDS sanity', () => {
  it('is a small positive number', () => {
    expect(VOICE_SAMPLE_MIN_WORDS).toBeGreaterThan(0);
    expect(VOICE_SAMPLE_MIN_WORDS).toBeLessThan(200);
  });
});
