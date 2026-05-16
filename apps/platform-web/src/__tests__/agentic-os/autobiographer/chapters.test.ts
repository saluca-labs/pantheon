import { describe, it, expect } from 'vitest';
import {
  countWords,
  estimateReadingMinutes,
  validateChapter,
  LEGACY_CHAPTER_STATUSES,
  EVENT_KINDS,
} from '@/lib/agentic-os/autobiographer/chapters';

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('counts whitespace-separated tokens', () => {
    expect(countWords('Hello world')).toBe(2);
    expect(countWords('  one   two  three ')).toBe(3);
  });

  it('counts single word', () => {
    expect(countWords('word')).toBe(1);
  });
});

describe('estimateReadingMinutes', () => {
  it('returns at least 1 for any input', () => {
    expect(estimateReadingMinutes(0)).toBe(1);
    expect(estimateReadingMinutes(10)).toBe(1);
  });

  it('uses 238 wpm denominator', () => {
    // 238 words → exactly 1 min
    expect(estimateReadingMinutes(238)).toBe(1);
    // 476 → 2 min
    expect(estimateReadingMinutes(476)).toBe(2);
    // 1000 → ~4 min (Math.round(1000/238)=4)
    expect(estimateReadingMinutes(1000)).toBe(4);
  });
});

describe('validateChapter', () => {
  it('returns no errors for valid data', () => {
    expect(validateChapter({ title: 'My Chapter', bodyText: 'Some text.', status: 'draft' })).toHaveLength(0);
  });

  it('requires a title', () => {
    const errors = validateChapter({ title: '', bodyText: '' });
    expect(errors.some((e) => e.includes('title'))).toBe(true);
  });

  it('rejects title over 255 characters', () => {
    const errors = validateChapter({ title: 'a'.repeat(256) });
    expect(errors.some((e) => e.includes('255'))).toBe(true);
  });

  it('rejects invalid status', () => {
    const errors = validateChapter({ title: 'T', status: 'published' as never });
    expect(errors.some((e) => e.includes('Status'))).toBe(true);
  });
});

describe('LEGACY_CHAPTER_STATUSES (single-chapter editor)', () => {
  it('includes draft, in_review, final', () => {
    expect(LEGACY_CHAPTER_STATUSES).toContain('draft');
    expect(LEGACY_CHAPTER_STATUSES).toContain('in_review');
    expect(LEGACY_CHAPTER_STATUSES).toContain('final');
  });
});

describe('EVENT_KINDS', () => {
  it('includes milestone and turning_point', () => {
    expect(EVENT_KINDS).toContain('milestone');
    expect(EVENT_KINDS).toContain('turning_point');
    expect(EVENT_KINDS).toContain('relationship');
  });
});
