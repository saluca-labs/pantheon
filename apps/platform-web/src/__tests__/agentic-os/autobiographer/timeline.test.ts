/**
 * Autobiographer OS — timeline composite tests.
 *
 * Covers the ordering, filter param build-out, and attach behavior of
 * `listTimeline` + the helpers `listArcMembershipsForMemoryIds` and
 * `listAvailableDecades`.
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
  listArcMembershipsForMemoryIds,
  listAvailableDecades,
  listTimeline,
} from '@/lib/agentic-os/autobiographer/timeline';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function memRow(overrides: Record<string, any> = {}) {
  return {
    id: 'm-1',
    book_id: 'b-1',
    title: 'A memory',
    body_markdown: 'Body text',
    when_in_life: null,
    era_date_estimate: new Date('1995-08-13'),
    location: null,
    emotion_tags: [],
    content_tags: [],
    is_sensitive: false,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    book_title: 'My book',
    ...overrides,
  };
}

describe('listTimeline', () => {
  it('throws when scope=book but bookId omitted', async () => {
    await expect(listTimeline({ userId: 'u-1', scope: 'book' })).rejects.toThrow(
      /scope=book/,
    );
  });

  it('uses workshop scope when no bookId supplied (default)', async () => {
    pushResult({ rows: [] }); // memories query
    await listTimeline({ userId: 'u-1' });
    expect(calls[0]!.sql).not.toMatch(/m\.book_id = \$/);
  });

  it('emits the m.book_id filter on scope=book', async () => {
    pushResult({ rows: [] }); // memories
    await listTimeline({ userId: 'u-1', scope: 'book', bookId: 'b-1' });
    expect(calls[0]!.sql).toMatch(/m\.book_id = \$/);
  });

  it('filters by ALL themeIds (HAVING COUNT semantics)', async () => {
    pushResult({ rows: [] });
    await listTimeline({
      userId: 'u-1',
      themeIds: ['t-1', 't-2'],
    });
    expect(calls[0]!.sql).toMatch(/HAVING COUNT\(DISTINCT mt\.theme_id\) = 2/);
  });

  it('decade filter translates to era_date bounds', async () => {
    pushResult({ rows: [] });
    await listTimeline({ userId: 'u-1', decade: 1990 });
    expect(calls[0]!.sql).toMatch(/era_date_estimate >=/);
    expect(calls[0]!.sql).toMatch(/era_date_estimate <=/);
    const params = calls[0]!.params;
    expect(params).toContain('1990-01-01');
    expect(params).toContain('1999-12-31');
  });

  it('attaches themes + arcs from the join-batch queries', async () => {
    // 1) memories
    pushResult({ rows: [memRow()] });
    // 2) themes batch
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          id: 't-1',
          user_id: 'u-1',
          name: 'Loss',
          slug: 'loss',
          description: null,
          color: 'rose',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    // 3) arc memberships batch
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          arc_id: 'a-1',
          chapter_id: 'c-1',
          position: 2,
          arc_title: 'Chronological',
          arc_book_id: 'b-1',
        },
      ],
    });
    const r = await listTimeline({ userId: 'u-1' });
    expect(r).toHaveLength(1);
    expect(r[0]?.themes).toHaveLength(1);
    expect(r[0]?.arcs).toHaveLength(1);
    expect(r[0]?.themes[0]?.name).toBe('Loss');
    expect(r[0]?.arcs[0]?.arcTitle).toBe('Chronological');
  });

  it('orders memories by extracted year ASC NULLS LAST', async () => {
    pushResult({ rows: [] });
    await listTimeline({ userId: 'u-1' });
    expect(calls[0]!.sql).toMatch(/EXTRACT\(YEAR FROM m\.era_date_estimate\)/);
    expect(calls[0]!.sql).toMatch(/NULLS LAST/);
  });
});

describe('listArcMembershipsForMemoryIds', () => {
  it('returns empty map without DB hit on empty input', async () => {
    const r = await listArcMembershipsForMemoryIds([], 'u-1');
    expect(r.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('groups arcs per memory id', async () => {
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          arc_id: 'a-1',
          chapter_id: 'c-1',
          position: 0,
          arc_title: 'Arc 1',
          arc_book_id: 'b-1',
        },
        {
          memory_id: 'm-1',
          arc_id: 'a-2',
          chapter_id: 'c-2',
          position: 0,
          arc_title: 'Arc 2',
          arc_book_id: 'b-1',
        },
        {
          memory_id: 'm-2',
          arc_id: 'a-1',
          chapter_id: 'c-3',
          position: 1,
          arc_title: 'Arc 1',
          arc_book_id: 'b-1',
        },
      ],
    });
    const m = await listArcMembershipsForMemoryIds(['m-1', 'm-2'], 'u-1');
    expect(m.get('m-1')).toHaveLength(2);
    expect(m.get('m-2')).toHaveLength(1);
  });
});

describe('listAvailableDecades', () => {
  it('maps rows to numeric decades', async () => {
    pushResult({ rows: [{ decade: 1980 }, { decade: 1990 }] });
    const r = await listAvailableDecades('u-1');
    expect(r).toEqual([1980, 1990]);
  });
});
