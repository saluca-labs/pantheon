/**
 * Autobiographer OS — books-repo unit tests.
 *
 * Mocks the shared pg Pool via getAutobiographerPool so the repo
 * exercises its own SQL + serialization logic without touching Postgres.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
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
  listBooks,
  getBook,
  getBookWithCounts,
  createBook,
  updateBook,
  softDeleteBook,
  deleteBook,
} from '@/lib/agentic-os/autobiographer/books-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function bookRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'b-1',
    user_id: 'u-1',
    title: 'My Story',
    subtitle: null,
    cover_image_url: null,
    description: null,
    status: 'drafting',
    target_completion_date: null,
    target_audience: null,
    tags: [],
    phase_progress: { drafting: 0, revising: 0, done: 0, paused: 0 },
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T01:00:00Z'),
    ...overrides,
  };
}

// ─── listBooks ───────────────────────────────────────────────────────────────

describe('listBooks', () => {
  it('queries agos_autobiographer_books with user filter + DESC order', async () => {
    pushResult({ rows: [bookRow()] });
    const r = await listBooks({ userId: 'u-1' });
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_autobiographer_books/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at DESC/);
    expect(calls[0]!.params[0]).toBe('u-1');
  });

  it('adds status filter when provided', async () => {
    pushResult({ rows: [] });
    await listBooks({ userId: 'u-1', status: 'drafting' });
    expect(calls[0]!.sql).toMatch(/status = \$\d+/);
    expect(calls[0]!.params).toContain('drafting');
  });

  it('rejects invalid status', async () => {
    await expect(
      listBooks({ userId: 'u-1', status: 'nope' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('adds tag filter using ANY(tags) — covers the GIN index path', async () => {
    pushResult({ rows: [] });
    await listBooks({ userId: 'u-1', tag: 'memoir' });
    expect(calls[0]!.sql).toMatch(/\$\d+ = ANY\(tags\)/);
    expect(calls[0]!.params).toContain('memoir');
  });

  it('caps limit at 100 and floors offset at 0', async () => {
    pushResult({ rows: [] });
    await listBooks({ userId: 'u-1', limit: 500, offset: -5 });
    // Last two params are limit, offset.
    expect(calls[0]!.params.at(-2)).toBe(100);
    expect(calls[0]!.params.at(-1)).toBe(0);
  });

  it('defaults limit to 20 when unspecified', async () => {
    pushResult({ rows: [] });
    await listBooks({ userId: 'u-1' });
    expect(calls[0]!.params.at(-2)).toBe(20);
  });

  it('coerces tags + phase_progress on the returned row', async () => {
    pushResult({
      rows: [bookRow({ tags: ['memoir', 'family'], phase_progress: null })],
    });
    const r = await listBooks({ userId: 'u-1' });
    expect(r[0]!.tags).toEqual(['memoir', 'family']);
    expect(r[0]!.phaseProgress.drafting).toBe(0);
  });
});

// ─── getBook ─────────────────────────────────────────────────────────────────

describe('getBook', () => {
  it('returns null when no row matches', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getBook('missing', 'u-1')).toBeNull();
  });

  it('returns a typed book when found, with status default', async () => {
    pushResult({
      rows: [bookRow({ status: 'revising', subtitle: 'A life' })],
    });
    const r = await getBook('b-1', 'u-1');
    expect(r).not.toBeNull();
    expect(r!.status).toBe('revising');
    expect(r!.subtitle).toBe('A life');
  });

  it('always filters by user_id (cross-ownership safety)', async () => {
    pushResult({ rows: [bookRow()] });
    await getBook('b-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0]!.params).toEqual(['b-1', 'u-1']);
  });
});

// ─── getBookWithCounts ───────────────────────────────────────────────────────

describe('getBookWithCounts', () => {
  it('joins the memory count', async () => {
    pushResult({ rows: [{ ...bookRow(), memory_count: 7 }] });
    const r = await getBookWithCounts('b-1', 'u-1');
    expect(r!.memoryCount).toBe(7);
    expect(calls[0]!.sql).toMatch(
      /SELECT COUNT\(\*\)::int[\s\S]+FROM agos_autobiographer_memories/,
    );
  });

  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getBookWithCounts('missing', 'u-1')).toBeNull();
  });
});

// ─── createBook ──────────────────────────────────────────────────────────────

describe('createBook', () => {
  it('serializes tags + phase_progress + metadata as JSON', async () => {
    pushResult({}); // insert
    pushResult({ rows: [bookRow()] }); // getBook follow-up

    await createBook('u-1', {
      title: 'My Story',
      tags: ['memoir'],
      metadata: { custom: 1 },
    });

    const insert = calls[0]!;
    expect(insert.sql).toMatch(/INSERT INTO agos_autobiographer_books/);
    // tags arg is a normalized array
    const tagsArg = insert.params[9];
    expect(tagsArg).toEqual(['memoir']);
    // phase_progress is a JSON string
    expect(typeof insert.params[10]).toBe('string');
    expect(() => JSON.parse(insert.params[10])).not.toThrow();
    // metadata is a JSON string
    expect(typeof insert.params[11]).toBe('string');
  });

  it('defaults status to drafting when omitted', async () => {
    pushResult({});
    pushResult({ rows: [bookRow()] });
    await createBook('u-1', { title: 'T' });
    expect(calls[0]!.params[6]).toBe('drafting'); // status param
  });

  it('rejects an invalid status', async () => {
    await expect(
      createBook('u-1', { title: 'T', status: 'invalid' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('throws when the follow-up read returns no row', async () => {
    pushResult({});
    pushResult({ rows: [], rowCount: 0 });
    await expect(createBook('u-1', { title: 'T' })).rejects.toThrow(
      /Failed to create book/,
    );
  });

  it('normalizes tags before insert (drops empty, dedupes)', async () => {
    pushResult({});
    pushResult({ rows: [bookRow()] });
    await createBook('u-1', {
      title: 'T',
      tags: ['Memoir', 'memoir', '   ', 'family'],
    });
    expect(calls[0]!.params[9]).toEqual(['Memoir', 'family']);
  });
});

// ─── updateBook ──────────────────────────────────────────────────────────────

describe('updateBook', () => {
  it('issues a COALESCE-style UPDATE (untouched columns preserved)', async () => {
    pushResult({}); // update
    pushResult({ rows: [bookRow({ title: 'New Title' })] }); // refetch
    await updateBook('b-1', 'u-1', { title: 'New Title' });
    const upd = calls[0]!;
    expect(upd.sql).toMatch(/UPDATE agos_autobiographer_books/);
    expect(upd.sql).toMatch(/title\s*= COALESCE\(\$3, +title\)/);
  });

  it('rejects an invalid status patch', async () => {
    await expect(
      updateBook('b-1', 'u-1', { status: 'nope' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('returns null when nothing matches', async () => {
    pushResult({ rowCount: 0 }); // update affected nothing
    pushResult({ rows: [], rowCount: 0 }); // refetch -> null
    const r = await updateBook('missing', 'u-1', { title: 'X' });
    expect(r).toBeNull();
  });
});

// ─── softDeleteBook / deleteBook ────────────────────────────────────────────

describe('softDeleteBook', () => {
  it('flips status to archived, leaving the row in place', async () => {
    pushResult({ rowCount: 1 });
    const ok = await softDeleteBook('b-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toMatch(/UPDATE agos_autobiographer_books/);
    expect(calls[0]!.sql).toMatch(/SET status = 'archived'/);
    expect(calls[0]!.params).toEqual(['b-1', 'u-1']);
  });

  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0 });
    expect(await softDeleteBook('missing', 'u-1')).toBe(false);
  });
});

describe('deleteBook', () => {
  it('issues a hard DELETE', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteBook('b-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toMatch(
      /DELETE FROM agos_autobiographer_books WHERE id = \$1 AND user_id = \$2/,
    );
  });

  it('returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deleteBook('missing', 'u-1')).toBe(false);
  });
});
