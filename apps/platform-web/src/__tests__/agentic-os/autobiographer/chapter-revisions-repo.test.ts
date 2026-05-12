/**
 * Autobiographer OS — chapter-revisions-repo unit tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  countRevisionsForBook,
  deleteRevision,
  getLatestRevisionForChapter,
  getRevision,
  getRevisionByVersion,
  insertRevision,
  listRevisionsForChapter,
  updateRevision,
} from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function revisionRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'r-1',
    chapter_id: 'c-1',
    user_id: 'u-1',
    version: 1,
    author: 'user',
    body_text: 'Hello world.',
    word_count: 2,
    summary: null,
    citations: [],
    coach_session_id: null,
    metadata: {},
    created_at: new Date('2026-05-12T00:00:00Z'),
    ...overrides,
  };
}

describe('listRevisionsForChapter', () => {
  it('filters by chapter_id + user_id and orders version DESC', async () => {
    pushResult({ rows: [revisionRow(), revisionRow({ id: 'r-2', version: 2 })] });
    const r = await listRevisionsForChapter('c-1', 'u-1');
    expect(r).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/WHERE chapter_id = \$1 AND user_id = \$2/);
    expect(calls[0]!.sql).toMatch(/ORDER BY version DESC/);
  });

  it('coerces citations JSON strings to arrays', async () => {
    pushResult({
      rows: [
        revisionRow({
          citations: JSON.stringify([
            { paragraph_index: 0, memory_ids: ['m-1'] },
          ]),
        }),
      ],
    });
    const r = await listRevisionsForChapter('c-1', 'u-1');
    expect(r[0]!.citations).toEqual([
      { paragraphIndex: 0, memoryIds: ['m-1'] },
    ]);
  });
});

describe('getRevision', () => {
  it('returns null when missing', async () => {
    pushResult({ rows: [] });
    expect(await getRevision('r-x', 'u-1')).toBeNull();
  });

  it('filters by user_id', async () => {
    pushResult({ rows: [revisionRow()] });
    await getRevision('r-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });
});

describe('getLatestRevisionForChapter', () => {
  it('orders by version DESC LIMIT 1', async () => {
    pushResult({ rows: [revisionRow({ version: 7 })] });
    const r = await getLatestRevisionForChapter('c-1', 'u-1');
    expect(r!.version).toBe(7);
    expect(calls[0]!.sql).toMatch(/ORDER BY version DESC[\s\S]+LIMIT 1/);
  });

  it('returns null when chapter has no revisions', async () => {
    pushResult({ rows: [] });
    expect(await getLatestRevisionForChapter('c-1', 'u-1')).toBeNull();
  });
});

describe('getRevisionByVersion', () => {
  it('filters by chapter + version + user', async () => {
    pushResult({ rows: [revisionRow({ version: 3 })] });
    const r = await getRevisionByVersion('c-1', 3, 'u-1');
    expect(r!.version).toBe(3);
    expect(calls[0]!.params).toEqual(['c-1', 3, 'u-1']);
  });
});

describe('insertRevision', () => {
  it('uses an atomic MAX(version)+1 subselect', async () => {
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({ rows: [revisionRow({ version: 4 })] }); // getRevision
    const r = await insertRevision('u-1', {
      chapterId: 'c-1',
      author: 'user',
      bodyText: 'one two three',
    });
    expect(r.version).toBe(4);
    expect(calls[0]!.sql).toMatch(
      /COALESCE\([\s\S]+SELECT MAX\(version\) \+ 1 FROM agos_autobiographer_chapter_revisions[\s\S]+1\s*\)/,
    );
  });

  it('normalizes citations on insert', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [revisionRow()] });
    await insertRevision('u-1', {
      chapterId: 'c-1',
      author: 'coach',
      bodyText: 'x',
      coachSessionId: '11111111-1111-1111-1111-111111111111',
      citations: [
        { paragraph_index: 1, memory_ids: ['m-1', 'm-1'] },
      ],
    });
    const insertCall = calls.find((c) => /INSERT INTO agos_autobiographer_chapter_revisions/.test(c.sql));
    expect(insertCall).toBeTruthy();
    // citations is parameter at index 7 (0-indexed)
    const citationsJson = insertCall!.params[7];
    expect(typeof citationsJson).toBe('string');
    const parsed = JSON.parse(citationsJson);
    expect(parsed).toEqual([{ paragraphIndex: 1, memoryIds: ['m-1'] }]);
  });

  it('rejects invalid author', async () => {
    await expect(
      insertRevision('u-1', {
        chapterId: 'c-1',
        author: 'admin' as any,
        bodyText: '',
      }),
    ).rejects.toThrow(/Invalid author/);
  });

  it('counts words server-side', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [revisionRow()] });
    await insertRevision('u-1', {
      chapterId: 'c-1',
      author: 'user',
      bodyText: 'one two three four five',
    });
    const insertCall = calls.find((c) => /INSERT INTO agos_autobiographer_chapter_revisions/.test(c.sql));
    // word_count is at param index 5 (0-indexed)
    expect(insertCall!.params[5]).toBe(5);
  });
});

describe('updateRevision', () => {
  it('recomputes word_count when bodyText is patched', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [revisionRow({ word_count: 4 })] });
    await updateRevision('r-1', 'u-1', { bodyText: 'a b c d' });
    const updateCall = calls.find((c) => /^UPDATE agos_autobiographer_chapter_revisions/.test(c.sql));
    expect(updateCall).toBeTruthy();
    // word_count is param index 3 (0-indexed)
    expect(updateCall!.params[3]).toBe(4);
  });

  it('keeps word_count untouched when bodyText omitted', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [revisionRow()] });
    await updateRevision('r-1', 'u-1', { summary: 'new sum' });
    const updateCall = calls.find((c) => /^UPDATE agos_autobiographer_chapter_revisions/.test(c.sql));
    expect(updateCall!.params[3]).toBeNull();
  });

  it('normalizes citations payload', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [revisionRow()] });
    await updateRevision('r-1', 'u-1', {
      citations: [
        { paragraphIndex: 2, memoryIds: ['m-9', 'm-9'] },
      ],
    });
    const updateCall = calls.find((c) => /^UPDATE agos_autobiographer_chapter_revisions/.test(c.sql));
    const json = updateCall!.params[5] as string;
    expect(JSON.parse(json)).toEqual([
      { paragraphIndex: 2, memoryIds: ['m-9'] },
    ]);
  });
});

describe('deleteRevision', () => {
  it('returns true on hit', async () => {
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteRevision('r-1', 'u-1')).toBe(true);
  });

  it('returns false on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await deleteRevision('r-1', 'u-1')).toBe(false);
  });
});

describe('countRevisionsForBook', () => {
  it('returns the joined count', async () => {
    pushResult({ rows: [{ n: '7' }] });
    expect(await countRevisionsForBook('b-1', 'u-1')).toBe(7);
    expect(calls[0]!.sql).toMatch(/JOIN agos_autobiographer_chapters/);
    expect(calls[0]!.sql).toMatch(/WHERE c\.book_id = \$1 AND c\.user_id = \$2/);
  });
});
