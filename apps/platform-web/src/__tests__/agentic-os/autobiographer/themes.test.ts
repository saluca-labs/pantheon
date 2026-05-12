/**
 * Autobiographer OS — themes domain tests.
 *
 * Pure-function coverage for slug derivation, validators, and constants.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  THEME_COLOR_MAX,
  THEME_COLOR_TOKENS,
  THEME_DESCRIPTION_MAX,
  THEME_NAME_MAX,
  THEME_SLUG_MAX,
  themeSlug,
  validateThemeColor,
  validateThemeDescription,
  validateThemeName,
  validateThemeSlug,
} from '@/lib/agentic-os/autobiographer/themes';

describe('themeSlug', () => {
  it('lowercases and dash-joins ASCII tokens', () => {
    expect(themeSlug('Loss & Recovery')).toBe('loss-recovery');
  });

  it('handles unicode by collapsing to dashes', () => {
    expect(themeSlug('música y vida')).toBe('m-sica-y-vida');
  });

  it('trims leading + trailing dashes', () => {
    expect(themeSlug('!!immigration!!')).toBe('immigration');
  });

  it('collapses to empty string when input is empty', () => {
    expect(themeSlug('')).toBe('');
    expect(themeSlug(null)).toBe('');
    expect(themeSlug(undefined)).toBe('');
  });

  it('clamps slug length to THEME_SLUG_MAX', () => {
    const long = 'a'.repeat(THEME_SLUG_MAX + 50);
    const slug = themeSlug(long);
    expect(slug.length).toBeLessThanOrEqual(THEME_SLUG_MAX);
  });
});

describe('validateThemeName', () => {
  it('requires a non-empty string', () => {
    expect(validateThemeName('')).toMatch(/required/i);
    expect(validateThemeName('   ')).toMatch(/required/i);
    expect(validateThemeName(42)).toMatch(/required/i);
  });

  it('caps length at THEME_NAME_MAX', () => {
    const long = 'x'.repeat(THEME_NAME_MAX + 1);
    expect(validateThemeName(long)).toMatch(/120 characters/);
  });

  it('returns null on valid name', () => {
    expect(validateThemeName('Immigration')).toBeNull();
  });
});

describe('validateThemeSlug', () => {
  it('returns null on absent / null / undefined', () => {
    expect(validateThemeSlug(null)).toBeNull();
    expect(validateThemeSlug(undefined)).toBeNull();
  });

  it('rejects empty / non-string', () => {
    expect(validateThemeSlug('')).toMatch(/at least one/);
    expect(validateThemeSlug(42)).toMatch(/string/);
  });

  it('rejects uppercase / spaces / non-kebab', () => {
    expect(validateThemeSlug('Immigration')).toMatch(/lowercase/);
    expect(validateThemeSlug('foo bar')).toMatch(/lowercase/);
    expect(validateThemeSlug('foo_bar')).toMatch(/lowercase/);
  });

  it('accepts kebab', () => {
    expect(validateThemeSlug('loss-recovery')).toBeNull();
    expect(validateThemeSlug('a1-b2-c3')).toBeNull();
  });

  it('caps length', () => {
    const long = 'a'.repeat(THEME_SLUG_MAX + 1);
    expect(validateThemeSlug(long)).toMatch(/120 characters/);
  });
});

describe('validateThemeDescription', () => {
  it('returns null on absent', () => {
    expect(validateThemeDescription(null)).toBeNull();
    expect(validateThemeDescription(undefined)).toBeNull();
  });
  it('caps length', () => {
    expect(validateThemeDescription('x'.repeat(THEME_DESCRIPTION_MAX + 1))).toMatch(
      /4000 characters/,
    );
  });
  it('rejects non-string', () => {
    expect(validateThemeDescription(42)).toMatch(/string/);
  });
});

describe('validateThemeColor', () => {
  it('returns null on absent', () => {
    expect(validateThemeColor(null)).toBeNull();
    expect(validateThemeColor(undefined)).toBeNull();
  });
  it('caps length', () => {
    expect(validateThemeColor('a'.repeat(THEME_COLOR_MAX + 1))).toMatch(
      /32 characters/,
    );
  });
  it('rejects spaces / leading digits', () => {
    expect(validateThemeColor('  ')).toMatch(/token/);
    expect(validateThemeColor('1-color')).toMatch(/token/);
  });
  it('accepts kebab and snake tokens', () => {
    expect(validateThemeColor('indigo')).toBeNull();
    expect(validateThemeColor('warm-grey')).toBeNull();
    expect(validateThemeColor('warmGrey')).toBeNull();
  });
});

describe('THEME_COLOR_TOKENS', () => {
  it('includes the documented default palette tokens', () => {
    for (const token of [
      'indigo',
      'teal',
      'rose',
      'amber',
      'emerald',
      'sky',
      'violet',
      'fuchsia',
      'slate',
      'orange',
    ]) {
      expect(THEME_COLOR_TOKENS).toContain(token);
    }
  });
});
