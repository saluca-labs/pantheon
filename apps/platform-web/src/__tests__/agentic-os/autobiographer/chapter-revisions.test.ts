/**
 * Autobiographer OS — chapter-revisions domain helpers.
 *
 * Pure-function tests for the citations normalizer + author taxonomy +
 * word counter.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  REVISION_AUTHORS,
  REVISION_BODY_MAX,
  REVISION_CITATIONS_MAX,
  REVISION_SUMMARY_MAX,
  citationsMemoryIds,
  countRevisionWords,
  normalizeCitations,
  validateRevisionAuthor,
  validateRevisionBody,
  validateRevisionSummary,
} from '@/lib/agentic-os/autobiographer/chapter-revisions';

describe('REVISION_AUTHORS', () => {
  it('exposes user + coach only', () => {
    expect(REVISION_AUTHORS).toEqual(['user', 'coach']);
  });

  it('validateRevisionAuthor accepts the locked values', () => {
    expect(validateRevisionAuthor('user')).toBeNull();
    expect(validateRevisionAuthor('coach')).toBeNull();
  });

  it('validateRevisionAuthor rejects anything else', () => {
    expect(validateRevisionAuthor('admin')).not.toBeNull();
    expect(validateRevisionAuthor(null)).not.toBeNull();
    expect(validateRevisionAuthor(123)).not.toBeNull();
  });
});

describe('validateRevisionBody', () => {
  it('rejects non-string', () => {
    expect(validateRevisionBody(42)).not.toBeNull();
    expect(validateRevisionBody(undefined)).not.toBeNull();
  });

  it('accepts empty string (drafts start blank)', () => {
    expect(validateRevisionBody('')).toBeNull();
  });

  it('rejects bodies above REVISION_BODY_MAX', () => {
    expect(validateRevisionBody('x'.repeat(REVISION_BODY_MAX + 1))).not.toBeNull();
  });
});

describe('validateRevisionSummary', () => {
  it('accepts null / undefined', () => {
    expect(validateRevisionSummary(null)).toBeNull();
    expect(validateRevisionSummary(undefined)).toBeNull();
  });

  it('rejects too-long summary', () => {
    expect(
      validateRevisionSummary('x'.repeat(REVISION_SUMMARY_MAX + 1)),
    ).not.toBeNull();
  });
});

describe('countRevisionWords', () => {
  it('counts space-split tokens', () => {
    expect(countRevisionWords('one two three')).toBe(3);
  });

  it('handles blank input', () => {
    expect(countRevisionWords('')).toBe(0);
    expect(countRevisionWords('   ')).toBe(0);
  });
});

describe('normalizeCitations', () => {
  it('drops non-array inputs', () => {
    expect(normalizeCitations(null)).toEqual([]);
    expect(normalizeCitations('hi' as any)).toEqual([]);
    expect(normalizeCitations(42 as any)).toEqual([]);
  });

  it('accepts snake_case wire shape', () => {
    const r = normalizeCitations([
      { paragraph_index: 1, memory_ids: ['m-1', 'm-2'] },
    ]);
    expect(r).toEqual([{ paragraphIndex: 1, memoryIds: ['m-1', 'm-2'] }]);
  });

  it('accepts camelCase shape', () => {
    const r = normalizeCitations([
      { paragraphIndex: 0, memoryIds: ['m-1'] },
    ]);
    expect(r).toEqual([{ paragraphIndex: 0, memoryIds: ['m-1'] }]);
  });

  it('dedupes memory ids within a paragraph', () => {
    const r = normalizeCitations([
      { paragraphIndex: 0, memoryIds: ['m-1', 'm-1', 'm-2'] },
    ]);
    expect(r[0]!.memoryIds).toEqual(['m-1', 'm-2']);
  });

  it('drops empty / non-string memory ids', () => {
    const r = normalizeCitations([
      { paragraphIndex: 0, memoryIds: ['m-1', '', null as any, 42 as any, 'm-2'] },
    ]);
    expect(r[0]!.memoryIds).toEqual(['m-1', 'm-2']);
  });

  it('clamps paragraphIndex to non-negative integer', () => {
    const r = normalizeCitations([
      { paragraphIndex: -3, memoryIds: ['m-1'] },
      { paragraphIndex: 4.7, memoryIds: ['m-2'] },
    ]);
    expect(r.find((c) => c.memoryIds.includes('m-1'))!.paragraphIndex).toBe(0);
    expect(r.find((c) => c.memoryIds.includes('m-2'))!.paragraphIndex).toBe(4);
  });

  it('skips entries with non-numeric paragraphIndex', () => {
    const r = normalizeCitations([
      { paragraphIndex: 'lol' as any, memoryIds: ['m-1'] },
      { paragraphIndex: 1, memoryIds: ['m-2'] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.memoryIds).toEqual(['m-2']);
  });

  it('skips entries with non-array memoryIds', () => {
    const r = normalizeCitations([
      { paragraphIndex: 1, memoryIds: 'oops' as any },
      { paragraphIndex: 2, memoryIds: ['m-3'] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.memoryIds).toEqual(['m-3']);
  });

  it('sorts citations by paragraphIndex ascending', () => {
    const r = normalizeCitations([
      { paragraphIndex: 5, memoryIds: ['m-a'] },
      { paragraphIndex: 1, memoryIds: ['m-b'] },
      { paragraphIndex: 3, memoryIds: ['m-c'] },
    ]);
    expect(r.map((c) => c.paragraphIndex)).toEqual([1, 3, 5]);
  });

  it('caps citations to REVISION_CITATIONS_MAX', () => {
    const tooMany = Array.from({ length: REVISION_CITATIONS_MAX + 50 }, (_, i) => ({
      paragraphIndex: i,
      memoryIds: ['m-x'],
    }));
    expect(normalizeCitations(tooMany).length).toBeLessThanOrEqual(
      REVISION_CITATIONS_MAX,
    );
  });
});

describe('citationsMemoryIds', () => {
  it('returns deduped union across citations', () => {
    const ids = citationsMemoryIds([
      { paragraphIndex: 0, memoryIds: ['m-1', 'm-2'] },
      { paragraphIndex: 1, memoryIds: ['m-2', 'm-3'] },
    ]);
    expect(new Set(ids)).toEqual(new Set(['m-1', 'm-2', 'm-3']));
  });

  it('returns empty for empty input', () => {
    expect(citationsMemoryIds([])).toEqual([]);
  });
});
