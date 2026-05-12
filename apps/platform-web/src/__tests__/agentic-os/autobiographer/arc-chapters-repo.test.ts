/**
 * Autobiographer OS — arc-chapters-repo unit tests.
 *
 * Covers attach (with cross-book rejection), reorder (transaction +
 * DEFERRED constraint), unlink, and the joined / id-only readers.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const poolQueue: PgResult[] = [];
const poolCalls: { sql: string; params: any[] }[] = [];
const clientQueue: PgResult[] = [];
const clientCalls: { sql: string; params: any[] }[] = [];
const clientErrors: (Error | null)[] = [];

function pushPool(r: Partial<PgResult>): void {
  poolQueue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}
function pushClient(r: Partial<PgResult>): void {
  clientQueue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
  clientErrors.push(null);
}

const clientReleaseSpy = vi.fn();
const clientMock = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    clientCalls.push({ sql, params });
    const err = clientErrors.shift();
    const result = clientQueue.shift() ?? { rows: [], rowCount: 0 };
    if (err) throw err;
    return result;
  }),
  release: clientReleaseSpy,
};

const poolErrors: (Error | null)[] = [];
vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      poolCalls.push({ sql, params });
      const err = poolErrors.shift();
      const result = poolQueue.shift() ?? { rows: [], rowCount: 0 };
      if (err) throw err;
      return result;
    }),
    connect: async () => clientMock,
  }),
}));

import {
  attachChapterToArc,
  listChapterIdsForArc,
  listChaptersForArc,
  reorderArcChapters,
  unlinkChapterFromArc,
} from '@/lib/agentic-os/autobiographer/arc-chapters-repo';

beforeEach(() => {
  poolQueue.length = 0;
  poolCalls.length = 0;
  poolErrors.length = 0;
  clientQueue.length = 0;
  clientCalls.length = 0;
  clientErrors.length = 0;
  clientMock.query.mockClear();
  clientReleaseSpy.mockClear();
});

describe('attachChapterToArc', () => {
  it('rejects when arc is foreign', async () => {
    pushPool({ rows: [] }); // arcOwnedByUser → no
    pushPool({ rows: [{ book_id: 'b-1' }] }); // chapterOwnedByUser
    await expect(
      attachChapterToArc('a-x', 'u-1', { chapterId: 'c-1' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects when chapter is in a different book', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushPool({ rows: [{ book_id: 'b-OTHER' }] });
    await expect(
      attachChapterToArc('a-1', 'u-1', { chapterId: 'c-1' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('auto-assigns position when omitted', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushPool({ rows: [{ next: 3 }] }); // max+1
    pushPool({ rows: [] }); // INSERT
    pushPool({
      rows: [
        {
          id: 'ac-1',
          arc_id: 'a-1',
          chapter_id: 'c-1',
          position: 3,
          created_at: new Date(),
        },
      ],
    });
    const row = await attachChapterToArc('a-1', 'u-1', { chapterId: 'c-1' });
    expect(row.position).toBe(3);
  });

  it('raises duplicate on PG 23505', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushPool({ rows: [{ next: 0 }] });
    const err: any = new Error('dup');
    err.code = '23505';
    poolErrors.push(null, null, null, err);
    pushPool({ rows: [] }); // INSERT (will throw via poolErrors)
    await expect(
      attachChapterToArc('a-1', 'u-1', { chapterId: 'c-1' }),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });
});

describe('reorderArcChapters', () => {
  it('rejects when arc foreign', async () => {
    pushPool({ rows: [] }); // arcOwnedByUser → no
    await expect(
      reorderArcChapters('a-x', 'u-1', [{ chapterId: 'c-1', position: 0 }]),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects when payload includes duplicate positions', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    await expect(
      reorderArcChapters('a-1', 'u-1', [
        { chapterId: 'c-1', position: 0 },
        { chapterId: 'c-2', position: 0 },
      ]),
    ).rejects.toThrow(/Duplicate position/);
  });

  it('rejects negative or non-integer position', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    await expect(
      reorderArcChapters('a-1', 'u-1', [{ chapterId: 'c-1', position: -1 }]),
    ).rejects.toThrow(/Invalid position/);
  });

  it('rolls back when a chapter is not actually in the arc', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] }); // arcOwnedByUser
    pushClient({ rows: [] }); // BEGIN
    pushClient({ rows: [] }); // SET CONSTRAINTS ALL DEFERRED
    pushClient({ rows: [{ chapter_id: 'c-1' }, { chapter_id: 'c-2' }] }); // existing
    pushClient({ rows: [] }); // ROLLBACK
    await expect(
      reorderArcChapters('a-1', 'u-1', [
        { chapterId: 'c-1', position: 0 },
        { chapterId: 'c-x', position: 1 },
      ]),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(clientCalls.some((c) => /ROLLBACK/.test(c.sql))).toBe(true);
  });

  it('issues SET CONSTRAINTS ALL DEFERRED + per-entry UPDATE + COMMIT', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushClient({ rows: [] }); // BEGIN
    pushClient({ rows: [] }); // SET CONSTRAINTS ALL DEFERRED
    pushClient({ rows: [{ chapter_id: 'c-1' }, { chapter_id: 'c-2' }] });
    pushClient({ rows: [] }); // UPDATE c-1
    pushClient({ rows: [] }); // UPDATE c-2
    pushClient({ rows: [] }); // COMMIT
    pushPool({ rows: [] }); // listChaptersForArc returns []
    await reorderArcChapters('a-1', 'u-1', [
      { chapterId: 'c-1', position: 1 },
      { chapterId: 'c-2', position: 0 },
    ]);
    expect(clientCalls.some((c) => /SET CONSTRAINTS ALL DEFERRED/.test(c.sql))).toBe(
      true,
    );
    expect(clientCalls[clientCalls.length - 1]!.sql).toMatch(/COMMIT/);
  });
});

describe('unlinkChapterFromArc', () => {
  it('rejects when arc is foreign', async () => {
    pushPool({ rows: [] });
    await expect(
      unlinkChapterFromArc('a-x', 'c-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
  it('returns false when nothing removed', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushPool({ rows: [], rowCount: 0 });
    expect(await unlinkChapterFromArc('a-1', 'c-x', 'u-1')).toBe(false);
  });
  it('returns true when a row removed', async () => {
    pushPool({ rows: [{ book_id: 'b-1' }] });
    pushPool({ rows: [], rowCount: 1 });
    expect(await unlinkChapterFromArc('a-1', 'c-1', 'u-1')).toBe(true);
  });
});

describe('readers', () => {
  it('listChapterIdsForArc returns string ids', async () => {
    pushPool({ rows: [{ chapter_id: 'c-1' }, { chapter_id: 'c-2' }] });
    expect(await listChapterIdsForArc('a-1', 'u-1')).toEqual(['c-1', 'c-2']);
  });
  it('listChaptersForArc maps joined fields', async () => {
    pushPool({
      rows: [
        {
          id: 'ac-1',
          arc_id: 'a-1',
          chapter_id: 'c-1',
          position: 0,
          created_at: new Date(),
          chapter_title: 'Ch 1',
          chapter_slug: 'ch-1',
          chapter_status: 'drafting',
          chapter_summary: 's',
          chapter_updated_at: new Date(),
        },
      ],
    });
    const r = await listChaptersForArc('a-1', 'u-1');
    expect(r[0]).toMatchObject({
      chapterId: 'c-1',
      position: 0,
      chapterStatus: 'drafting',
    });
  });
});
