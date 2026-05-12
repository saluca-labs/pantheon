/**
 * Autobiographer OS — chapter-themes-repo unit tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
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
  queue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
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
  linkThemeToChapter,
  listChaptersForTheme,
  listThemesForChapter,
  unlinkThemeFromChapter,
} from '@/lib/agentic-os/autobiographer/chapter-themes-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  errorsToThrow.length = 0;
});

describe('chapter-themes cross-ownership', () => {
  it('linkThemeToChapter rejects when chapter is foreign', async () => {
    pushResult({ rows: [] }); // chapterBelongs → no
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    await expect(
      linkThemeToChapter('c-x', 't-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('linkThemeToChapter raises duplicate on 23505', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    const err: any = new Error('dup');
    err.code = '23505';
    pushError(err);
    await expect(
      linkThemeToChapter('c-1', 't-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('unlinkThemeFromChapter rejects when theme is foreign', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [] });
    await expect(
      unlinkThemeFromChapter('c-1', 't-x', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('chapter-themes readers', () => {
  it('listThemesForChapter maps rows', async () => {
    pushResult({
      rows: [
        {
          id: 't-1',
          user_id: 'u-1',
          name: 'Loss',
          slug: 'loss',
          description: null,
          color: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await listThemesForChapter('c-1', 'u-1');
    expect(r).toHaveLength(1);
  });

  it('listChaptersForTheme returns the canonical fields', async () => {
    pushResult({
      rows: [
        {
          chapter_id: 'c-1',
          book_id: 'b-1',
          title: 'Ch 1',
          slug: 'ch-1',
          position: 0,
          updated_at: new Date(),
        },
      ],
    });
    const r = await listChaptersForTheme('t-1', 'u-1');
    expect(r[0]).toMatchObject({
      chapterId: 'c-1',
      bookId: 'b-1',
      position: 0,
    });
  });
});
