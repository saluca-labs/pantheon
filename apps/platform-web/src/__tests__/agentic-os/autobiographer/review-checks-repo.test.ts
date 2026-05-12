/**
 * Autobiographer OS — review-checks-repo unit tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];
const errorsToThrow: (Error | null)[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? r.rows?.length ?? 0 });
  errorsToThrow.push(null);
}

function pushError(err: Error): void {
  queue.push({ rows: [], rowCount: 0 });
  errorsToThrow.push(err);
}

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      const err = errorsToThrow.shift();
      const result = queue.shift() ?? { rows: [], rowCount: 0 };
      if (err) throw err;
      return result;
    }),
  }),
}));

import {
  bookBelongsToUser,
  createReviewCheck,
  deleteReviewCheck,
  getReviewCheck,
  listReviewChecksForBookGrouped,
  listReviewChecksForChapter,
  updateReviewCheck,
} from '@/lib/agentic-os/autobiographer/review-checks-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  errorsToThrow.length = 0;
});

const sampleBookLevel = {
  id: 'rc-1',
  user_id: 'u-1',
  book_id: 'b-1',
  chapter_id: null,
  kind: 'legal_reviewed',
  status: 'pending',
  notes: null,
  checked_at: null,
  checked_by: null,
  created_at: new Date('2026-05-12T00:00:00Z'),
  updated_at: new Date('2026-05-12T00:00:00Z'),
};

const sampleChapterLevel = {
  ...sampleBookLevel,
  id: 'rc-2',
  chapter_id: 'c-1',
  kind: 'consent_collected',
};

describe('listReviewChecksForBookGrouped', () => {
  it('groups rows under book / byChapterId', async () => {
    pushResult({ rows: [sampleBookLevel, sampleChapterLevel] });
    const out = await listReviewChecksForBookGrouped('b-1', 'u-1');
    expect(out.book).toHaveLength(1);
    expect(out.byChapterId['c-1']).toHaveLength(1);
    expect(out.book[0]!.kind).toBe('legal_reviewed');
    expect(out.byChapterId['c-1']![0]!.kind).toBe('consent_collected');
  });

  it('returns empty groups on no rows', async () => {
    pushResult({ rows: [] });
    const out = await listReviewChecksForBookGrouped('b-1', 'u-1');
    expect(out.book).toEqual([]);
    expect(Object.keys(out.byChapterId)).toEqual([]);
  });
});

describe('listReviewChecksForChapter', () => {
  it('filters by chapter_id + user_id', async () => {
    pushResult({ rows: [sampleChapterLevel] });
    const rows = await listReviewChecksForChapter('c-1', 'u-1');
    expect(rows).toHaveLength(1);
    expect(calls[0]!.params).toEqual(['c-1', 'u-1']);
  });
});

describe('getReviewCheck', () => {
  it('null on miss', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await getReviewCheck('rc-x', 'u-1')).toBeNull();
  });
});

describe('createReviewCheck', () => {
  it('inserts then re-reads', async () => {
    pushResult({});
    pushResult({ rows: [sampleChapterLevel] });
    const out = await createReviewCheck('u-1', {
      bookId: 'b-1',
      chapterId: 'c-1',
      kind: 'consent_collected',
    });
    expect(out.kind).toBe('consent_collected');
  });

  it('rejects unknown kind', async () => {
    await expect(
      createReviewCheck('u-1', {
        bookId: 'b-1',
        kind: 'BOGUS' as any,
      }),
    ).rejects.toThrow(/Invalid kind/);
  });

  it('rejects unknown status', async () => {
    await expect(
      createReviewCheck('u-1', {
        bookId: 'b-1',
        kind: 'consent_collected',
        status: 'BOGUS' as any,
      }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('maps 23505 to typed duplicate error', async () => {
    const dup: any = new Error('unique_violation');
    dup.code = '23505';
    pushError(dup);
    await expect(
      createReviewCheck('u-1', {
        bookId: 'b-1',
        kind: 'consent_collected',
      }),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });
});

describe('updateReviewCheck', () => {
  it('PATCHes status + checked_at + checked_by', async () => {
    pushResult({});
    pushResult({
      rows: [
        {
          ...sampleChapterLevel,
          status: 'passed',
          checked_at: new Date('2026-05-12T01:00:00Z'),
          checked_by: 'u-1',
        },
      ],
    });
    const out = await updateReviewCheck('rc-2', 'u-1', {
      status: 'passed',
      checkedAt: '2026-05-12T01:00:00Z',
      checkedBy: 'u-1',
    });
    expect(out!.status).toBe('passed');
    expect(out!.checkedBy).toBe('u-1');
  });

  it('rejects unknown status in PATCH', async () => {
    await expect(
      updateReviewCheck('rc-2', 'u-1', { status: 'BOGUS' as any }),
    ).rejects.toThrow(/Invalid status/);
  });
});

describe('deleteReviewCheck', () => {
  it('returns true / false based on rowCount', async () => {
    pushResult({ rowCount: 1 });
    expect(await deleteReviewCheck('rc-2', 'u-1')).toBe(true);
    pushResult({ rowCount: 0 });
    expect(await deleteReviewCheck('rc-2', 'u-1')).toBe(false);
  });
});

describe('bookBelongsToUser', () => {
  it('true on match', async () => {
    pushResult({ rowCount: 1 });
    expect(await bookBelongsToUser('b-1', 'u-1')).toBe(true);
  });
  it('false on no match', async () => {
    pushResult({ rowCount: 0 });
    expect(await bookBelongsToUser('b-1', 'u-1')).toBe(false);
  });
});
