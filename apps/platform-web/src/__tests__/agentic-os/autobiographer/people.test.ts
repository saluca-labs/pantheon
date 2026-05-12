/**
 * Autobiographer OS — people.ts domain unit tests.
 *
 * Exercises consent taxonomy + helpers, alias normalizer, validators, and
 * the publishable/blocking sets that Phase 6 redaction will key off.
 * Pure functions — no DB.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  CONSENT_STATES,
  CONSENT_LABELS,
  CONSENT_PUBLISHABLE,
  CONSENT_BLOCKING,
  consentIsPublishable,
  validateConsentState,
  validateCanonicalName,
  validateYear,
  normalizeAliases,
  canonicalNameKey,
} from '@/lib/agentic-os/autobiographer/people';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';

// ─── CONSENT_STATES ──────────────────────────────────────────────────────────

describe('CONSENT_STATES', () => {
  it('contains exactly the 6 locked values', () => {
    expect(CONSENT_STATES).toHaveLength(6);
    for (const s of [
      'granted',
      'pending',
      'withheld',
      'deceased',
      'public_figure',
      'not_applicable',
    ]) {
      expect(CONSENT_STATES).toContain(s as ConsentState);
    }
  });

  it('has a label for every state', () => {
    for (const s of CONSENT_STATES) {
      expect(CONSENT_LABELS[s]).toBeTruthy();
    }
  });

  it('label map matches state set', () => {
    expect(Object.keys(CONSENT_LABELS).sort()).toEqual(
      [...CONSENT_STATES].sort(),
    );
  });
});

// ─── publishable / blocking partitions ───────────────────────────────────────

describe('CONSENT_PUBLISHABLE + CONSENT_BLOCKING', () => {
  it('partition the state space — every state is in exactly one set', () => {
    const publishable = new Set<string>(CONSENT_PUBLISHABLE);
    const blocking = new Set<string>(CONSENT_BLOCKING);
    for (const s of CONSENT_STATES) {
      const inPub = publishable.has(s);
      const inBlock = blocking.has(s);
      expect(inPub || inBlock).toBe(true);
      expect(inPub && inBlock).toBe(false);
    }
  });

  it('marks the 4 default-pass states as publishable', () => {
    for (const s of ['granted', 'deceased', 'public_figure', 'not_applicable']) {
      expect(CONSENT_PUBLISHABLE).toContain(s as ConsentState);
    }
  });

  it('marks pending + withheld as blocking', () => {
    expect(CONSENT_BLOCKING).toContain('pending');
    expect(CONSENT_BLOCKING).toContain('withheld');
  });
});

// ─── consentIsPublishable ────────────────────────────────────────────────────

describe('consentIsPublishable', () => {
  it('returns true for granted / deceased / public_figure / not_applicable', () => {
    for (const s of ['granted', 'deceased', 'public_figure', 'not_applicable']) {
      expect(consentIsPublishable(s)).toBe(true);
    }
  });

  it('returns false for pending + withheld', () => {
    expect(consentIsPublishable('pending')).toBe(false);
    expect(consentIsPublishable('withheld')).toBe(false);
  });

  it('returns false for unknown strings + non-strings', () => {
    expect(consentIsPublishable('something')).toBe(false);
    expect(consentIsPublishable(null)).toBe(false);
    expect(consentIsPublishable(undefined)).toBe(false);
    expect(consentIsPublishable(42)).toBe(false);
  });
});

// ─── validateConsentState ────────────────────────────────────────────────────

describe('validateConsentState', () => {
  it('returns null for valid states', () => {
    for (const s of CONSENT_STATES) {
      expect(validateConsentState(s)).toBeNull();
    }
  });

  it('rejects unknown strings', () => {
    expect(validateConsentState('granted_partially')).not.toBeNull();
    expect(validateConsentState('')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateConsentState(null)).not.toBeNull();
    expect(validateConsentState(undefined)).not.toBeNull();
    expect(validateConsentState(42)).not.toBeNull();
  });

  it('error message names the valid options', () => {
    const err = validateConsentState('nope');
    expect(err).toContain('granted');
    expect(err).toContain('withheld');
  });
});

// ─── validateCanonicalName ───────────────────────────────────────────────────

describe('validateCanonicalName', () => {
  it('returns null for a non-empty name', () => {
    expect(validateCanonicalName('Maria del Carmen')).toBeNull();
  });

  it('rejects empty + whitespace-only', () => {
    expect(validateCanonicalName('')).not.toBeNull();
    expect(validateCanonicalName('   ')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateCanonicalName(null)).not.toBeNull();
    expect(validateCanonicalName(42)).not.toBeNull();
  });

  it('rejects names over 500 chars', () => {
    expect(validateCanonicalName('a'.repeat(501))).not.toBeNull();
  });

  it('accepts 500-char name (boundary)', () => {
    expect(validateCanonicalName('a'.repeat(500))).toBeNull();
  });
});

// ─── validateYear ────────────────────────────────────────────────────────────

describe('validateYear', () => {
  it('returns null for null / undefined (year is optional)', () => {
    expect(validateYear(null)).toBeNull();
    expect(validateYear(undefined)).toBeNull();
  });

  it('returns null for plausible integer years', () => {
    expect(validateYear(1942)).toBeNull();
    expect(validateYear(2026)).toBeNull();
  });

  it('rejects non-integers', () => {
    expect(validateYear(1942.5)).not.toBeNull();
    expect(validateYear(NaN)).not.toBeNull();
  });

  it('rejects out-of-range years', () => {
    expect(validateYear(0)).not.toBeNull();
    expect(validateYear(10_000)).not.toBeNull();
    expect(validateYear(-1)).not.toBeNull();
  });

  it('rejects non-numbers', () => {
    expect(validateYear('1942')).not.toBeNull();
  });
});

// ─── normalizeAliases ────────────────────────────────────────────────────────

describe('normalizeAliases', () => {
  it('trims whitespace', () => {
    expect(normalizeAliases(['  Mom  ', ' Mother'])).toEqual(['Mom', 'Mother']);
  });

  it('drops empty entries', () => {
    expect(normalizeAliases(['Mom', '', '   '])).toEqual(['Mom']);
  });

  it('dedupes case-insensitively (preserves first casing)', () => {
    expect(normalizeAliases(['Mom', 'mom', 'Ma'])).toEqual(['Mom', 'Ma']);
  });

  it('drops non-string entries', () => {
    expect(normalizeAliases(['Mom', 42 as any, null as any])).toEqual(['Mom']);
  });

  it('handles empty input', () => {
    expect(normalizeAliases([])).toEqual([]);
  });
});

// ─── canonicalNameKey ────────────────────────────────────────────────────────

describe('canonicalNameKey', () => {
  it('lowercases + trims', () => {
    expect(canonicalNameKey('  Maria  ')).toBe('maria');
  });

  it('matches the migration\'s functional UNIQUE INDEX semantics', () => {
    // The migration creates UNIQUE INDEX on (user_id, lower(canonical_name)).
    // A duplicate-detection probe needs the same lower() shape.
    expect(canonicalNameKey('Maria')).toBe(canonicalNameKey('maria'));
  });
});
