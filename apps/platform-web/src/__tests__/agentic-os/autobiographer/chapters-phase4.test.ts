/**
 * Autobiographer OS — Phase 4 chapter domain helpers.
 *
 * Pure-function tests for `chapters.ts` Phase 4 additions: status
 * taxonomy + labels, slug derivation, word counter, validators, and
 * the preserved legacy shapes for the single-chapter editor.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  CHAPTER_STATUSES,
  CHAPTER_STATUS_LABELS,
  CHAPTER_SLUG_MAX,
  CHAPTER_SUMMARY_MAX,
  CHAPTER_TITLE_MAX,
  LEGACY_CHAPTER_STATUSES,
  EVENT_KINDS,
  chapterSlug,
  countChapterWords,
  countWords,
  estimateReadingMinutes,
  validateChapter,
  validateChapterStatus,
  validateChapterSummary,
  validateChapterTitle,
} from '@/lib/agentic-os/autobiographer/chapters';

describe('Phase 4 chapter status taxonomy', () => {
  it('exposes four statuses in the locked order', () => {
    expect(CHAPTER_STATUSES).toEqual([
      'outline',
      'drafting',
      'revised',
      'locked',
    ]);
  });

  it('labels every status with a display string', () => {
    for (const s of CHAPTER_STATUSES) {
      expect(CHAPTER_STATUS_LABELS[s]).toBeTruthy();
      expect(typeof CHAPTER_STATUS_LABELS[s]).toBe('string');
    }
  });

  it('keeps the legacy 3-state taxonomy distinct', () => {
    expect(LEGACY_CHAPTER_STATUSES).toEqual(['draft', 'in_review', 'final']);
  });

  it('validates known Phase 4 statuses', () => {
    expect(validateChapterStatus('outline')).toBeNull();
    expect(validateChapterStatus('drafting')).toBeNull();
    expect(validateChapterStatus('revised')).toBeNull();
    expect(validateChapterStatus('locked')).toBeNull();
  });

  it('rejects legacy values when validated against Phase 4 set', () => {
    expect(validateChapterStatus('draft')).not.toBeNull();
    expect(validateChapterStatus('final')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateChapterStatus(123)).not.toBeNull();
    expect(validateChapterStatus(null)).not.toBeNull();
  });
});

describe('chapterSlug', () => {
  it('lowercases + dashifies + trims', () => {
    expect(chapterSlug('The Summer We Moved To Albuquerque')).toBe(
      'the-summer-we-moved-to-albuquerque',
    );
  });

  it('collapses punctuation to single dashes', () => {
    expect(chapterSlug('Hello, world!! How are you?')).toBe(
      'hello-world-how-are-you',
    );
  });

  it('returns empty for empty / null / undefined', () => {
    expect(chapterSlug('')).toBe('');
    expect(chapterSlug(null)).toBe('');
    expect(chapterSlug(undefined)).toBe('');
  });

  it('strips leading and trailing dashes', () => {
    expect(chapterSlug('---wow---')).toBe('wow');
  });

  it('truncates to CHAPTER_SLUG_MAX', () => {
    const long = 'a'.repeat(CHAPTER_SLUG_MAX + 50);
    expect(chapterSlug(long).length).toBeLessThanOrEqual(CHAPTER_SLUG_MAX);
  });
});

describe('countChapterWords / countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countChapterWords('one two three')).toBe(3);
  });

  it('handles empty / whitespace strings', () => {
    expect(countChapterWords('')).toBe(0);
    expect(countChapterWords('   ')).toBe(0);
  });

  it('collapses runs of whitespace', () => {
    expect(countChapterWords('one    two\nthree')).toBe(3);
  });

  it('countWords is the same function as countChapterWords', () => {
    expect(countWords('a b c d e')).toBe(countChapterWords('a b c d e'));
  });
});

describe('estimateReadingMinutes', () => {
  it('rounds to a minimum of 1 minute', () => {
    expect(estimateReadingMinutes(0)).toBe(1);
    expect(estimateReadingMinutes(50)).toBe(1);
  });

  it('rounds to 238 wpm reference (Brysbaert 2019)', () => {
    expect(estimateReadingMinutes(2380)).toBe(10);
  });
});

describe('validateChapterTitle', () => {
  it('accepts null / undefined (optional field)', () => {
    expect(validateChapterTitle(null)).toBeNull();
    expect(validateChapterTitle(undefined)).toBeNull();
  });

  it('accepts non-empty strings', () => {
    expect(validateChapterTitle('Chapter 1')).toBeNull();
  });

  it('rejects too-long titles', () => {
    expect(validateChapterTitle('x'.repeat(CHAPTER_TITLE_MAX + 1))).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateChapterTitle(42)).not.toBeNull();
  });
});

describe('validateChapterSummary', () => {
  it('accepts null / undefined', () => {
    expect(validateChapterSummary(null)).toBeNull();
    expect(validateChapterSummary(undefined)).toBeNull();
  });

  it('rejects too-long summaries', () => {
    expect(
      validateChapterSummary('x'.repeat(CHAPTER_SUMMARY_MAX + 1)),
    ).not.toBeNull();
  });

  it('rejects non-string summary', () => {
    expect(validateChapterSummary(42)).not.toBeNull();
  });
});

describe('legacy validateChapter (single-chapter editor)', () => {
  it('flags missing title', () => {
    expect(validateChapter({ title: '' })).toContain('Chapter title is required.');
  });

  it('flags too-long title', () => {
    expect(
      validateChapter({ title: 'x'.repeat(300) }),
    ).toContain('Chapter title must be 255 characters or fewer.');
  });

  it('flags invalid legacy status', () => {
    expect(
      validateChapter({ title: 'ok', status: 'outline' as any }),
    ).toContain('Status "outline" is not valid.');
  });

  it('accepts a valid legacy entry', () => {
    expect(
      validateChapter({ title: 'ok', bodyText: 'a b', status: 'draft' }),
    ).toEqual([]);
  });
});

describe('EVENT_KINDS taxonomy is preserved', () => {
  it('includes the McAdams categories', () => {
    expect(EVENT_KINDS).toEqual([
      'milestone',
      'turning_point',
      'challenge',
      'achievement',
      'relationship',
      'place',
      'belief',
      'other',
    ]);
  });
});
