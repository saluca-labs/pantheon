/**
 * Autobiographer OS — memories-repo unit tests.
 *
 * Mocks the shared pg Pool. Exercises listing/filtering, the cross-
 * ownership book validation gate on insert + reassignment, the
 * detach-via-null-bookId PATCH semantics, and the partial-index query path.
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
  listMemories,
  getMemory,
  createMemory,
  updateMemory,
  deleteMemory,
  listMemoriesForBook,
} from '@/lib/agentic-os/autobiographer/memories-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function memoryRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'm-1',
    user_id: 'u-1',
    book_id: null,
    title: 'First move',
    body_markdown: 'It was a Tuesday in 1985.',
    transcript: null,
    audio_url: null,
    photo_urls: [],
    when_in_life: null,
    era_date_estimate: null,
    location: null,
    emotion_tags: [],
    content_tags: [],
    is_sensitive: false,
    source: 'text',
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T01:00:00Z'),
    ...overrides,
  };
}

// ─── listMemories ────────────────────────────────────────────────────────────

describe('listMemories', () => {
  it('queries agos_autobiographer_memories ordered DESC by updated_at', async () => {
    pushResult({ rows: [memoryRow()] });
    const r = await listMemories({ userId: 'u-1' });
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_autobiographer_memories/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0]!.sql).toMatch(/ORDER BY updated_at DESC/);
  });

  it('filters by book_id when provided', async () => {
    pushResult({ rows: [] });
    await listMemories({ userId: 'u-1', bookId: 'b-1' });
    expect(calls[0]!.sql).toMatch(/book_id = \$\d+/);
    expect(calls[0]!.params).toContain('b-1');
  });

  it('filters by workshop-global (bookId === null) using IS NULL', async () => {
    pushResult({ rows: [] });
    await listMemories({ userId: 'u-1', bookId: null });
    expect(calls[0]!.sql).toMatch(/book_id IS NULL/);
  });

  it('uses ANY(content_tags) for the content_tag filter (GIN index path)', async () => {
    pushResult({ rows: [] });
    await listMemories({ userId: 'u-1', contentTag: 'family' });
    expect(calls[0]!.sql).toMatch(/\$\d+ = ANY\(content_tags\)/);
    expect(calls[0]!.params).toContain('family');
  });

  it('uses ANY(emotion_tags) for the emotion_tag filter', async () => {
    pushResult({ rows: [] });
    await listMemories({ userId: 'u-1', emotionTag: 'grief' });
    expect(calls[0]!.sql).toMatch(/\$\d+ = ANY\(emotion_tags\)/);
  });

  it('applies is_sensitive filter when set', async () => {
    pushResult({ rows: [] });
    await listMemories({ userId: 'u-1', isSensitive: true });
    expect(calls[0]!.sql).toMatch(/is_sensitive = \$\d+/);
    expect(calls[0]!.params).toContain(true);
  });

  it('applies era_after / era_before range filters', async () => {
    pushResult({ rows: [] });
    await listMemories({
      userId: 'u-1',
      eraAfter: '1990-01-01',
      eraBefore: '2000-12-31',
    });
    expect(calls[0]!.sql).toMatch(/era_date_estimate >= \$\d+/);
    expect(calls[0]!.sql).toMatch(/era_date_estimate <= \$\d+/);
  });

  it('caps limit at 100 and defaults to 25', async () => {
    pushResult({ rows: [] });
    await listMemories({ userId: 'u-1' });
    expect(calls[0]!.params.at(-2)).toBe(25);

    queue.length = 0;
    calls.length = 0;
    pushResult({ rows: [] });
    await listMemories({ userId: 'u-1', limit: 500 });
    expect(calls[0]!.params.at(-2)).toBe(100);
  });

  it('coerces rows: tag arrays, boolean is_sensitive, source enum', async () => {
    pushResult({
      rows: [
        memoryRow({
          content_tags: ['family'],
          emotion_tags: ['grief'],
          is_sensitive: true,
          source: 'audio_transcript',
        }),
      ],
    });
    const r = await listMemories({ userId: 'u-1' });
    expect(r[0]!.contentTags).toEqual(['family']);
    expect(r[0]!.emotionTags).toEqual(['grief']);
    expect(r[0]!.isSensitive).toBe(true);
    expect(r[0]!.source).toBe('audio_transcript');
  });
});

// ─── getMemory ──────────────────────────────────────────────────────────────

describe('getMemory', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getMemory('missing', 'u-1')).toBeNull();
  });

  it('filters by user_id (cross-ownership)', async () => {
    pushResult({ rows: [memoryRow()] });
    await getMemory('m-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0]!.params).toEqual(['m-1', 'u-1']);
  });
});

// ─── createMemory — cross-ownership gate + insert ──────────────────────────

describe('createMemory', () => {
  it('inserts without book validation when bookId is null', async () => {
    pushResult({}); // insert
    pushResult({ rows: [memoryRow()] }); // refetch
    const r = await createMemory('u-1', {
      title: 'T',
      bodyMarkdown: 'B',
    });
    expect(r.id).toBe('m-1');
    // Only two queries (insert + refetch); no book-ownership check.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_autobiographer_memories/);
  });

  it('validates book ownership before insert when bookId is set', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // ownership ok
    pushResult({}); // insert
    pushResult({ rows: [memoryRow({ book_id: 'b-1' })] }); // refetch
    const r = await createMemory('u-1', {
      title: 'T',
      bodyMarkdown: 'B',
      bookId: 'b-1',
    });
    expect(r.bookId).toBe('b-1');
    expect(calls[0]!.sql).toMatch(
      /SELECT 1 FROM agos_autobiographer_books/,
    );
    expect(calls[0]!.params).toEqual(['b-1', 'u-1']);
  });

  it('throws book_not_found when ownership check fails', async () => {
    pushResult({ rows: [], rowCount: 0 }); // ownership fails
    await expect(
      createMemory('u-1', {
        title: 'T',
        bodyMarkdown: 'B',
        bookId: 'b-other',
      }),
    ).rejects.toMatchObject({ code: 'book_not_found' });
    // Only the ownership check should have run.
    expect(calls).toHaveLength(1);
  });

  it('rejects an invalid source enum', async () => {
    await expect(
      createMemory('u-1', {
        title: 'T',
        bodyMarkdown: 'B',
        source: 'video' as any,
      }),
    ).rejects.toThrow(/Invalid source/);
  });

  it('normalizes content_tags + emotion_tags + photo_urls before insert', async () => {
    pushResult({});
    pushResult({ rows: [memoryRow()] });
    await createMemory('u-1', {
      title: 'T',
      bodyMarkdown: 'B',
      contentTags: ['family', 'family', '  '],
      emotionTags: ['Grief', 'grief'],
      photoUrls: ['https://x/a.jpg', 'https://x/a.jpg', '  '],
    });
    const insert = calls[0]!;
    // 8 = photo_urls, 12 = emotion_tags, 13 = content_tags  (1-based, $1..$N)
    expect(insert.params[7]).toEqual(['https://x/a.jpg']);
    expect(insert.params[11]).toEqual(['Grief']);
    expect(insert.params[12]).toEqual(['family']);
  });

  it('defaults source to "text" and is_sensitive to false', async () => {
    pushResult({});
    pushResult({ rows: [memoryRow()] });
    await createMemory('u-1', { title: 'T', bodyMarkdown: 'B' });
    const insert = calls[0]!;
    expect(insert.params).toContain('text');
    expect(insert.params).toContain(false);
  });

  it('throws when refetch returns no row', async () => {
    pushResult({}); // insert
    pushResult({ rows: [], rowCount: 0 }); // refetch
    await expect(
      createMemory('u-1', { title: 'T', bodyMarkdown: 'B' }),
    ).rejects.toThrow(/Failed to create memory/);
  });
});

// ─── updateMemory ────────────────────────────────────────────────────────────

describe('updateMemory', () => {
  it('does not validate book when bookId not in patch', async () => {
    pushResult({}); // update
    pushResult({ rows: [memoryRow()] }); // refetch
    await updateMemory('m-1', 'u-1', { title: 'Renamed' });
    // No ownership query.
    expect(calls[0]!.sql).toMatch(/UPDATE agos_autobiographer_memories/);
  });

  it('validates book ownership when patch reassigns bookId', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // ok
    pushResult({}); // update
    pushResult({ rows: [memoryRow({ book_id: 'b-2' })] }); // refetch
    const r = await updateMemory('m-1', 'u-1', { bookId: 'b-2' });
    expect(r!.bookId).toBe('b-2');
    expect(calls[0]!.sql).toMatch(/SELECT 1 FROM agos_autobiographer_books/);
  });

  it('throws book_not_found when reassigning to an unowned book', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      updateMemory('m-1', 'u-1', { bookId: 'b-other' }),
    ).rejects.toMatchObject({ code: 'book_not_found' });
  });

  it('allows explicit detach (bookId: null) without validation', async () => {
    pushResult({}); // update
    pushResult({ rows: [memoryRow({ book_id: null })] }); // refetch
    const r = await updateMemory('m-1', 'u-1', { bookId: null });
    expect(r!.bookId).toBeNull();
    // Only update + refetch — no ownership probe.
    expect(calls).toHaveLength(2);
  });

  it('passes the bookIdProvided sentinel as $3 (boolean true) on detach', async () => {
    pushResult({});
    pushResult({ rows: [memoryRow({ book_id: null })] });
    await updateMemory('m-1', 'u-1', { bookId: null });
    // The CASE-based UPDATE uses $3 = bookIdProvided. With bookId in patch,
    // even as null, the sentinel must be true so the SQL switches to NULL.
    expect(calls[0]!.params[2]).toBe(true);
    expect(calls[0]!.params[3]).toBeNull();
  });

  it('leaves book_id untouched when bookId is NOT in patch (sentinel false)', async () => {
    pushResult({});
    pushResult({ rows: [memoryRow()] });
    await updateMemory('m-1', 'u-1', { title: 'T' });
    expect(calls[0]!.params[2]).toBe(false);
  });

  it('rejects an invalid source patch', async () => {
    await expect(
      updateMemory('m-1', 'u-1', { source: 'video' as any }),
    ).rejects.toThrow(/Invalid source/);
  });

  it('returns null when nothing matches', async () => {
    pushResult({ rowCount: 0 }); // update
    pushResult({ rows: [], rowCount: 0 }); // refetch
    const r = await updateMemory('missing', 'u-1', { title: 'X' });
    expect(r).toBeNull();
  });
});

// ─── deleteMemory ───────────────────────────────────────────────────────────

describe('deleteMemory', () => {
  it('issues a hard DELETE filtered by user_id', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteMemory('m-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toMatch(
      /DELETE FROM agos_autobiographer_memories WHERE id = \$1 AND user_id = \$2/,
    );
  });

  it('returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deleteMemory('missing', 'u-1')).toBe(false);
  });
});

// ─── listMemoriesForBook ────────────────────────────────────────────────────

describe('listMemoriesForBook', () => {
  it('filters to the supplied book id', async () => {
    pushResult({ rows: [memoryRow({ book_id: 'b-1' })] });
    const r = await listMemoriesForBook('b-1', 'u-1');
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/book_id = \$\d+/);
    expect(calls[0]!.params).toContain('b-1');
    expect(calls[0]!.params).toContain('u-1');
  });
});
