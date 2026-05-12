/**
 * Autobiographer OS — chapters-repo unit tests.
 *
 * Mocks the shared pg Pool. Exercises listing, ownership filter, the
 * slug-uniqueness probe, position auto-assignment, and the transactional
 * reorder swap.
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

const clientCalls: { sql: string; params: any[] }[] = [];
const clientQueue: PgResult[] = [];
let releaseCount = 0;

const fakeClient = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    clientCalls.push({ sql, params });
    return clientQueue.shift() ?? { rows: [], rowCount: 0 };
  }),
  release: vi.fn(() => {
    releaseCount += 1;
  }),
};

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => fakeClient),
  }),
}));

import {
  createChapter,
  deleteChapter,
  getBookWordCount,
  getChapter,
  listChaptersForBook,
  listChaptersForUser,
  nextSlugForBook,
  reorderChapter,
  updateChapter,
  userOwnsBook,
} from '@/lib/agentic-os/autobiographer/chapters-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  clientCalls.length = 0;
  clientQueue.length = 0;
  releaseCount = 0;
  fakeClient.query.mockClear();
  fakeClient.release.mockClear();
});

function chapterRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'c-1',
    user_id: 'u-1',
    book_id: 'b-1',
    title: 'Ch one',
    slug: 'ch-one',
    position: 0,
    status: 'outline',
    summary: null,
    target_word_count: null,
    metadata: {},
    created_at: new Date('2026-05-12T00:00:00Z'),
    updated_at: new Date('2026-05-12T01:00:00Z'),
    ...overrides,
  };
}

describe('listChaptersForBook', () => {
  it('filters by user_id AND book_id', async () => {
    pushResult({ rows: [chapterRow()] });
    const r = await listChaptersForBook({ userId: 'u-1', bookId: 'b-1' });
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1 AND book_id = \$2/);
    expect(calls[0]!.params).toEqual(['u-1', 'b-1']);
  });

  it('orders by position ASC by default', async () => {
    pushResult({ rows: [] });
    await listChaptersForBook({ userId: 'u-1', bookId: 'b-1' });
    expect(calls[0]!.sql).toMatch(/ORDER BY position ASC, created_at ASC/);
  });

  it('honors updated_desc ordering hint', async () => {
    pushResult({ rows: [] });
    await listChaptersForBook({
      userId: 'u-1',
      bookId: 'b-1',
      order: 'updated_desc',
    });
    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at DESC/);
  });

  it('coerces row shape (numbers, dates)', async () => {
    pushResult({
      rows: [
        chapterRow({
          position: '5',
          target_word_count: '500',
          created_at: new Date('2026-05-12T05:00:00Z'),
        }),
      ],
    });
    const r = await listChaptersForBook({ userId: 'u-1', bookId: 'b-1' });
    expect(r[0]!.position).toBe(5);
    expect(r[0]!.targetWordCount).toBe(500);
    expect(r[0]!.createdAt).toBe('2026-05-12T05:00:00.000Z');
  });
});

describe('listChaptersForUser', () => {
  it('does not filter by book when bookId omitted', async () => {
    pushResult({ rows: [] });
    await listChaptersForUser('u-1');
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0]!.sql).not.toMatch(/book_id =/);
  });

  it('adds book filter when supplied', async () => {
    pushResult({ rows: [] });
    await listChaptersForUser('u-1', { bookId: 'b-2' });
    expect(calls[0]!.sql).toMatch(/book_id = \$2/);
    expect(calls[0]!.params[1]).toBe('b-2');
  });

  it('clamps limit and offset', async () => {
    pushResult({ rows: [] });
    await listChaptersForUser('u-1', { limit: 9999, offset: -10 });
    const params = calls[0]!.params;
    expect(params[params.length - 2]).toBe(500); // clamped limit
    expect(params[params.length - 1]).toBe(0); // clamped offset
  });
});

describe('getChapter', () => {
  it('returns null when not found', async () => {
    pushResult({ rows: [] });
    expect(await getChapter('c-1', 'u-1')).toBeNull();
  });

  it('filters by user_id', async () => {
    pushResult({ rows: [chapterRow()] });
    await getChapter('c-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0]!.params).toEqual(['c-1', 'u-1']);
  });
});

describe('userOwnsBook', () => {
  it('returns true when the row exists', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    expect(await userOwnsBook('b-1', 'u-1')).toBe(true);
  });

  it('returns false when the row is absent', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await userOwnsBook('b-1', 'u-x')).toBe(false);
  });
});

describe('nextSlugForBook', () => {
  it('returns the derived slug when no collision', async () => {
    pushResult({ rows: [], rowCount: 0 }); // first probe = free
    const slug = await nextSlugForBook('b-1', 'Hello World', 0);
    expect(slug).toBe('hello-world');
  });

  it('appends -2 on first collision then succeeds', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // 1st probe collision
    pushResult({ rows: [], rowCount: 0 }); // 2nd probe free
    const slug = await nextSlugForBook('b-1', 'Title', 0);
    expect(slug).toBe('title-2');
  });

  it('falls back to chapter-N when title is empty', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const slug = await nextSlugForBook('b-1', '', 7);
    expect(slug).toBe('chapter-8');
  });

  it('respects excludeChapterId when probing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await nextSlugForBook('b-1', 'title', 0, 'c-2');
    expect(calls[0]!.sql).toMatch(/AND id <> \$3/);
    expect(calls[0]!.params[2]).toBe('c-2');
  });
});

describe('createChapter', () => {
  it('reads next position then inserts', async () => {
    pushResult({ rows: [{ next: 3 }] }); // posR
    pushResult({ rows: [], rowCount: 0 }); // nextSlugForBook probe
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({ rows: [chapterRow({ position: 3 })] }); // getChapter

    const ch = await createChapter('u-1', {
      bookId: 'b-1',
      title: 'New chapter',
    });
    expect(ch).not.toBeNull();
    expect(calls[0]!.sql).toMatch(/COALESCE\(MAX\(position\) \+ 1, 0\)/);
    // Find the INSERT call
    const insertCall = calls.find((c) => /INSERT INTO agos_autobiographer_chapters\b/.test(c.sql));
    expect(insertCall).toBeTruthy();
    expect(insertCall!.params[5]).toBe(3); // position is parameter 6 (0-indexed 5)
  });

  it('rejects invalid status', async () => {
    await expect(
      createChapter('u-1', {
        bookId: 'b-1',
        status: 'foo' as any,
      }),
    ).rejects.toThrow(/Invalid status/);
  });
});

describe('updateChapter', () => {
  it('uses COALESCE merge pattern', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [chapterRow()] });
    await updateChapter('c-1', 'u-1', { title: 'New title' });
    expect(calls[0]!.sql).toMatch(/SET title\s+= COALESCE/);
  });

  it('rejects invalid status', async () => {
    await expect(
      updateChapter('c-1', 'u-1', { status: 'lol' as any }),
    ).rejects.toThrow(/Invalid status/);
  });
});

describe('reorderChapter — transactional swap', () => {
  function pushClient(r: Partial<PgResult>) {
    clientQueue.push({
      rows: r.rows ?? [],
      rowCount: r.rowCount ?? r.rows?.length ?? 0,
    });
  }

  it('rolls back + returns null when chapter not owned', async () => {
    pushClient({ rows: [], rowCount: 0 }); // BEGIN
    pushClient({ rows: [], rowCount: 0 }); // SET CONSTRAINTS
    pushClient({ rows: [], rowCount: 0 }); // owns probe -> empty
    pushClient({ rows: [], rowCount: 0 }); // ROLLBACK
    const r = await reorderChapter('c-x', 'u-1', 2);
    expect(r).toBeNull();
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls.some((s) => /^BEGIN/i.test(s) || s === 'BEGIN')).toBe(true);
    expect(sqls.some((s) => /SET CONSTRAINTS ALL DEFERRED/.test(s))).toBe(true);
    expect(sqls.some((s) => /^ROLLBACK/i.test(s) || s === 'ROLLBACK')).toBe(true);
  });

  it('swaps occupant + writes new position on collision', async () => {
    pushClient({ rows: [], rowCount: 0 }); // BEGIN
    pushClient({ rows: [], rowCount: 0 }); // SET CONSTRAINTS
    pushClient({
      rows: [{ id: 'c-1', book_id: 'b-1', position: 5 }],
      rowCount: 1,
    }); // owns probe
    pushClient({
      rows: [{ id: 'c-2' }],
      rowCount: 1,
    }); // occupant probe
    pushClient({ rows: [], rowCount: 1 }); // swap occupant update
    pushClient({ rows: [], rowCount: 1 }); // move target update
    pushClient({ rows: [], rowCount: 0 }); // COMMIT

    pushResult({ rows: [chapterRow({ id: 'c-1', position: 2 })] }); // getChapter

    const r = await reorderChapter('c-1', 'u-1', 2);
    expect(r!.position).toBe(2);
    expect(releaseCount).toBe(1);
    // Two UPDATE statements + BEGIN/COMMIT/SET CONSTRAINTS + 2 probes
    expect(clientCalls.length).toBeGreaterThanOrEqual(5);
  });

  it('handles no-collision (target position is free)', async () => {
    pushClient({ rows: [], rowCount: 0 }); // BEGIN
    pushClient({ rows: [], rowCount: 0 }); // SET CONSTRAINTS
    pushClient({
      rows: [{ id: 'c-1', book_id: 'b-1', position: 5 }],
      rowCount: 1,
    }); // owns probe
    pushClient({ rows: [], rowCount: 0 }); // occupant probe (no occupant)
    pushClient({ rows: [], rowCount: 1 }); // move update
    pushClient({ rows: [], rowCount: 0 }); // COMMIT

    pushResult({ rows: [chapterRow({ position: 7 })] }); // getChapter

    const r = await reorderChapter('c-1', 'u-1', 7);
    expect(r!.position).toBe(7);
  });

  it('rejects non-integer / negative position', async () => {
    await expect(reorderChapter('c-1', 'u-1', -1)).rejects.toThrow(/Invalid position/);
    await expect(reorderChapter('c-1', 'u-1', 1.5)).rejects.toThrow(/Invalid position/);
  });

  it('releases the client on rollback path', async () => {
    pushClient({ rows: [], rowCount: 0 }); // BEGIN
    pushClient({ rows: [], rowCount: 0 }); // SET CONSTRAINTS
    fakeClient.query.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(reorderChapter('c-1', 'u-1', 2)).rejects.toThrow(/boom/);
    expect(releaseCount).toBe(1);
  });
});

describe('deleteChapter', () => {
  it('returns true on hit', async () => {
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteChapter('c-1', 'u-1')).toBe(true);
  });

  it('returns false on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await deleteChapter('c-1', 'u-1')).toBe(false);
  });
});

describe('getBookWordCount', () => {
  it('sums latest-revision word counts across the book', async () => {
    pushResult({ rows: [{ total: '1234' }] });
    expect(await getBookWordCount('b-1', 'u-1')).toBe(1234);
    expect(calls[0]!.sql).toMatch(/JOIN LATERAL/);
    expect(calls[0]!.sql).toMatch(/ORDER BY r\.version DESC/);
  });
});
