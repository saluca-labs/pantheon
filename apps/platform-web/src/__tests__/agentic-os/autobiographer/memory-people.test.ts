/**
 * Autobiographer OS — memory-people.ts domain unit tests.
 *
 * Pure functions only: role normalizer + validators + common-role
 * vocabulary suggestions.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  COMMON_MEMORY_PERSON_ROLES,
  validateRole,
  validateLinkNotes,
  normalizeRole,
} from '@/lib/agentic-os/autobiographer/memory-people';

// ─── COMMON_MEMORY_PERSON_ROLES ──────────────────────────────────────────────

describe('COMMON_MEMORY_PERSON_ROLES', () => {
  it('includes the four anchor roles from the plan', () => {
    for (const r of ['protagonist', 'witness', 'antagonist', 'mentioned']) {
      expect(COMMON_MEMORY_PERSON_ROLES).toContain(r as any);
    }
  });

  it('is a non-empty readonly tuple', () => {
    expect(COMMON_MEMORY_PERSON_ROLES.length).toBeGreaterThan(0);
  });
});

// ─── validateRole ────────────────────────────────────────────────────────────

describe('validateRole', () => {
  it('returns null for null / undefined (role is optional)', () => {
    expect(validateRole(null)).toBeNull();
    expect(validateRole(undefined)).toBeNull();
  });

  it('accepts a non-empty role under 100 chars', () => {
    expect(validateRole('protagonist')).toBeNull();
    expect(validateRole('co-narrator and witness')).toBeNull();
  });

  it('rejects non-string roles', () => {
    expect(validateRole(42)).not.toBeNull();
    expect(validateRole({})).not.toBeNull();
  });

  it('rejects roles over 100 chars', () => {
    expect(validateRole('a'.repeat(101))).not.toBeNull();
  });

  it('accepts 100-char role at the boundary', () => {
    expect(validateRole('a'.repeat(100))).toBeNull();
  });
});

// ─── validateLinkNotes ───────────────────────────────────────────────────────

describe('validateLinkNotes', () => {
  it('returns null for null / undefined', () => {
    expect(validateLinkNotes(null)).toBeNull();
    expect(validateLinkNotes(undefined)).toBeNull();
  });

  it('accepts free-form notes under 5000 chars', () => {
    expect(validateLinkNotes('Played guitar in the background.')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateLinkNotes(42)).not.toBeNull();
  });

  it('rejects notes over 5000 chars', () => {
    expect(validateLinkNotes('a'.repeat(5001))).not.toBeNull();
  });
});

// ─── normalizeRole ───────────────────────────────────────────────────────────

describe('normalizeRole', () => {
  it('trims whitespace', () => {
    expect(normalizeRole('  protagonist  ')).toBe('protagonist');
  });

  it('returns null for empty strings + whitespace-only', () => {
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole('   ')).toBeNull();
  });

  it('returns null for non-string + nullish', () => {
    expect(normalizeRole(null as any)).toBeNull();
    expect(normalizeRole(undefined as any)).toBeNull();
    expect(normalizeRole(42 as any)).toBeNull();
  });

  it('preserves casing (roles are free-form, not normalized to lowercase)', () => {
    expect(normalizeRole('Protagonist')).toBe('Protagonist');
  });
});
