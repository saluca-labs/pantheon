/**
 * Autobiographer OS — books.ts domain unit tests.
 *
 * Exercises the status taxonomy, phase-progress helpers, tag
 * normalization, and validators. Pure functions only — no DB.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  BOOK_STATUSES,
  BOOK_STATUS_LABELS,
  BOOK_PHASES,
  BOOK_PHASE_LABELS,
  bookPhaseProgressDefault,
  coerceBookPhaseProgress,
  bookPhaseAvg,
  normalizeBookTags,
  validateBookStatus,
  validateBookPhaseProgress,
  validateBookTitle,
} from '@/lib/agentic-os/autobiographer/books';
import type {
  BookPhase,
  BookPhaseProgress,
  BookStatus,
} from '@/lib/agentic-os/autobiographer/books';

// ─── BOOK_STATUSES ───────────────────────────────────────────────────────────

describe('BOOK_STATUSES', () => {
  it('contains exactly the 5 locked values', () => {
    expect(BOOK_STATUSES).toHaveLength(5);
    for (const s of ['drafting', 'revising', 'done', 'paused', 'archived']) {
      expect(BOOK_STATUSES).toContain(s as BookStatus);
    }
  });

  it('has a label for every status', () => {
    for (const s of BOOK_STATUSES) {
      expect(BOOK_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it('label map keys match status set', () => {
    expect(Object.keys(BOOK_STATUS_LABELS).sort()).toEqual(
      [...BOOK_STATUSES].sort(),
    );
  });
});

// ─── validateBookStatus ──────────────────────────────────────────────────────

describe('validateBookStatus', () => {
  it('returns null for every valid status', () => {
    for (const s of BOOK_STATUSES) {
      expect(validateBookStatus(s)).toBeNull();
    }
  });

  it('rejects unknown strings', () => {
    expect(validateBookStatus('draft')).not.toBeNull();
    expect(validateBookStatus('in_progress')).not.toBeNull();
    expect(validateBookStatus('')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateBookStatus(null)).not.toBeNull();
    expect(validateBookStatus(undefined)).not.toBeNull();
    expect(validateBookStatus(42)).not.toBeNull();
    expect(validateBookStatus({})).not.toBeNull();
  });

  it('error message lists the valid options', () => {
    const err = validateBookStatus('nope');
    expect(err).toContain('drafting');
    expect(err).toContain('archived');
  });
});

// ─── BOOK_PHASES ─────────────────────────────────────────────────────────────

describe('BOOK_PHASES', () => {
  it('contains 4 non-archived phases', () => {
    expect(BOOK_PHASES).toHaveLength(4);
    expect(BOOK_PHASES).not.toContain('archived' as never);
    for (const k of ['drafting', 'revising', 'done', 'paused']) {
      expect(BOOK_PHASES).toContain(k as BookPhase);
    }
  });

  it('has a label for every phase', () => {
    for (const k of BOOK_PHASES) {
      expect(BOOK_PHASE_LABELS[k]).toBeTruthy();
    }
  });
});

// ─── bookPhaseProgressDefault / coerceBookPhaseProgress ─────────────────────

describe('bookPhaseProgressDefault', () => {
  it('returns all zeros', () => {
    const p = bookPhaseProgressDefault();
    for (const k of BOOK_PHASES) expect(p[k]).toBe(0);
  });
});

describe('coerceBookPhaseProgress', () => {
  it('fills missing keys with 0', () => {
    const p = coerceBookPhaseProgress({ drafting: 60 });
    expect(p.drafting).toBe(60);
    expect(p.revising).toBe(0);
    expect(p.done).toBe(0);
    expect(p.paused).toBe(0);
  });

  it('clamps to 0..100', () => {
    const p = coerceBookPhaseProgress({ drafting: -25, revising: 150 });
    expect(p.drafting).toBe(0);
    expect(p.revising).toBe(100);
  });

  it('rounds floats', () => {
    const p = coerceBookPhaseProgress({ drafting: 42.7 });
    expect(p.drafting).toBe(43);
  });

  it('ignores non-numeric values', () => {
    const p = coerceBookPhaseProgress({
      drafting: 'high' as never,
      revising: NaN,
    });
    expect(p.drafting).toBe(0);
    expect(p.revising).toBe(0);
  });

  it('handles non-object input', () => {
    expect(coerceBookPhaseProgress(null)).toEqual(bookPhaseProgressDefault());
    expect(coerceBookPhaseProgress(undefined)).toEqual(
      bookPhaseProgressDefault(),
    );
    expect(coerceBookPhaseProgress('nope')).toEqual(bookPhaseProgressDefault());
    expect(coerceBookPhaseProgress(42)).toEqual(bookPhaseProgressDefault());
  });

  it('roundtrips a full object', () => {
    const full: BookPhaseProgress = {
      drafting: 100,
      revising: 80,
      done: 60,
      paused: 0,
    };
    expect(coerceBookPhaseProgress(full)).toEqual(full);
  });
});

// ─── validateBookPhaseProgress ───────────────────────────────────────────────

describe('validateBookPhaseProgress', () => {
  it('accepts an empty object', () => {
    const r = validateBookPhaseProgress({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const k of BOOK_PHASES) expect(r.value[k]).toBe(0);
    }
  });

  it('accepts a partial object', () => {
    const r = validateBookPhaseProgress({ drafting: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.drafting).toBe(50);
      expect(r.value.done).toBe(0);
    }
  });

  it('rejects null + undefined', () => {
    expect(validateBookPhaseProgress(null).ok).toBe(false);
    expect(validateBookPhaseProgress(undefined).ok).toBe(false);
  });

  it('rejects non-object inputs', () => {
    expect(validateBookPhaseProgress('hello').ok).toBe(false);
    expect(validateBookPhaseProgress(42).ok).toBe(false);
    expect(validateBookPhaseProgress([1, 2]).ok).toBe(false);
  });

  it('rejects unknown phase keys', () => {
    const r = validateBookPhaseProgress({ concept: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('concept');
  });

  it('rejects non-integer values', () => {
    const r = validateBookPhaseProgress({ drafting: 42.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('integer');
  });

  it('rejects negative + >100 values', () => {
    expect(validateBookPhaseProgress({ drafting: -5 }).ok).toBe(false);
    expect(validateBookPhaseProgress({ drafting: 200 }).ok).toBe(false);
  });

  it('accepts boundary values 0 and 100', () => {
    expect(validateBookPhaseProgress({ drafting: 0 }).ok).toBe(true);
    expect(validateBookPhaseProgress({ drafting: 100 }).ok).toBe(true);
  });
});

// ─── bookPhaseAvg ────────────────────────────────────────────────────────────

describe('bookPhaseAvg', () => {
  it('returns 0 for default', () => {
    expect(bookPhaseAvg(bookPhaseProgressDefault())).toBe(0);
    expect(bookPhaseAvg({})).toBe(0);
  });

  it('returns 100 when every phase is 100', () => {
    const full: BookPhaseProgress = {
      drafting: 100,
      revising: 100,
      done: 100,
      paused: 100,
    };
    expect(bookPhaseAvg(full)).toBe(100);
  });

  it('averages across the 4 phases', () => {
    // 100 + 50 + 0 + 0 = 150 / 4 = 37.5 -> 38
    const partial: BookPhaseProgress = {
      drafting: 100,
      revising: 50,
      done: 0,
      paused: 0,
    };
    expect(bookPhaseAvg(partial)).toBe(38);
  });
});

// ─── normalizeBookTags ───────────────────────────────────────────────────────

describe('normalizeBookTags', () => {
  it('trims whitespace', () => {
    expect(normalizeBookTags(['  family  ', 'memoir '])).toEqual([
      'family',
      'memoir',
    ]);
  });

  it('drops empty entries', () => {
    expect(normalizeBookTags(['family', '', '   '])).toEqual(['family']);
  });

  it('dedupes case-insensitively, preserving first occurrence casing', () => {
    expect(normalizeBookTags(['Memoir', 'memoir', 'Family'])).toEqual([
      'Memoir',
      'Family',
    ]);
  });

  it('drops non-string entries', () => {
    expect(normalizeBookTags(['family', 42 as never, null as never])).toEqual([
      'family',
    ]);
  });

  it('returns an empty array on empty input', () => {
    expect(normalizeBookTags([])).toEqual([]);
  });
});

// ─── validateBookTitle ───────────────────────────────────────────────────────

describe('validateBookTitle', () => {
  it('returns null for a non-empty title', () => {
    expect(validateBookTitle('My Story')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateBookTitle('')).not.toBeNull();
    expect(validateBookTitle('   ')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateBookTitle(null)).not.toBeNull();
    expect(validateBookTitle(undefined)).not.toBeNull();
    expect(validateBookTitle(42)).not.toBeNull();
  });

  it('rejects titles over 500 chars', () => {
    expect(validateBookTitle('a'.repeat(501))).not.toBeNull();
  });

  it('accepts 500-char title (boundary)', () => {
    expect(validateBookTitle('a'.repeat(500))).toBeNull();
  });
});
