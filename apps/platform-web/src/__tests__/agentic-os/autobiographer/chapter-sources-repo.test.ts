/**
 * Autobiographer OS — chapter-sources-repo unit tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  getChapterSource,
  linkChapterSource,
  listProvenanceForBook,
  listSourcesForChapter,
  unlinkChapterSource,
  updateChapterSource,
} from '@/lib/agentic-os/autobiographer/chapter-sources-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

describe('listSourcesForChapter', () => {
  it('joins memories + citations to surface paragraph counts', async () => {
    pushResult({
      rows: [
        {
          id: 's-1',
          chapter_id: 'c-1',
          memory_id: 'm-1',
          weight: 1.0,
          notes: null,
          memory_title: 'A memory',
          memory_when_in_life: '1985',
          memory_era_date_estimate: new Date('1985-06-01'),
          paragraph_citation_count: '3',
        },
      ],
    });
    const r = await listSourcesForChapter('c-1', 'u-1');
    expect(r[0]!.memoryTitle).toBe('A memory');
    expect(r[0]!.paragraphCitationCount).toBe(3);
    expect(calls[0]!.sql).toMatch(/WITH latest_rev/);
    expect(calls[0]!.sql).toMatch(/JOIN agos_autobiographer_memories/);
  });

  it('joins enforce both chapter user and memory user filters', async () => {
    pushResult({ rows: [] });
    await listSourcesForChapter('c-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/m\.user_id    = \$2/);
  });
});

describe('getChapterSource', () => {
  it('joins through chapter + memory ownership', async () => {
    pushResult({
      rows: [
        { id: 's-1', chapter_id: 'c-1', memory_id: 'm-1', weight: 0.5, notes: null },
      ],
    });
    const r = await getChapterSource('c-1', 'm-1', 'u-1');
    expect(r).not.toBeNull();
    expect(calls[0]!.sql).toMatch(/c\.user_id    = \$3/);
    expect(calls[0]!.sql).toMatch(/m\.user_id    = \$3/);
  });

  it('returns null on miss', async () => {
    pushResult({ rows: [] });
    expect(await getChapterSource('c-x', 'm-x', 'u-1')).toBeNull();
  });
});

describe('linkChapterSource', () => {
  it('inserts with clamped weight', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({
      rows: [
        { id: 's-1', chapter_id: 'c-1', memory_id: 'm-1', weight: 1.0, notes: null },
      ],
    });
    const r = await linkChapterSource({
      chapterId: 'c-1',
      memoryId: 'm-1',
      weight: 1.5, // out of range -> clamp to 1
    });
    expect(r.memoryId).toBe('m-1');
    const insertCall = calls.find((c) => /^INSERT INTO agos_autobiographer_chapter_sources/.test(c.sql));
    expect(insertCall).toBeTruthy();
    expect(insertCall!.params[3]).toBe(1.0);
  });

  it('truncates notes to SOURCE_NOTES_MAX', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({
      rows: [
        { id: 's-1', chapter_id: 'c-1', memory_id: 'm-1', weight: 1.0, notes: 'x' },
      ],
    });
    const big = 'x'.repeat(3000);
    await linkChapterSource({
      chapterId: 'c-1',
      memoryId: 'm-1',
      notes: big,
    });
    const insertCall = calls.find((c) => /^INSERT INTO agos_autobiographer_chapter_sources/.test(c.sql));
    const notes = insertCall!.params[4] as string;
    expect(notes.length).toBeLessThanOrEqual(2000);
  });
});

describe('updateChapterSource', () => {
  it('returns null when caller does not own the chapter/memory', async () => {
    pushResult({ rows: [] }); // ownership probe miss
    const r = await updateChapterSource('c-x', 'm-x', 'u-1', { weight: 0.5 });
    expect(r).toBeNull();
  });

  it('updates weight when patch supplied', async () => {
    pushResult({
      rows: [{ id: 's-1', chapter_id: 'c-1', memory_id: 'm-1', weight: 0.3, notes: null }],
      rowCount: 1,
    }); // ownership probe hit
    pushResult({ rows: [], rowCount: 1 }); // UPDATE
    pushResult({
      rows: [{ id: 's-1', chapter_id: 'c-1', memory_id: 'm-1', weight: 0.5, notes: null }],
    }); // ownership re-fetch
    const r = await updateChapterSource('c-1', 'm-1', 'u-1', { weight: 0.5 });
    expect(r!.weight).toBe(0.5);
  });
});

describe('unlinkChapterSource', () => {
  it('returns false when the row is not owned by the caller', async () => {
    pushResult({ rows: [] }); // ownership probe miss
    expect(await unlinkChapterSource('c-x', 'm-x', 'u-1')).toBe(false);
  });

  it('deletes when ownership holds', async () => {
    pushResult({
      rows: [{ id: 's-1', chapter_id: 'c-1', memory_id: 'm-1', weight: 1, notes: null }],
      rowCount: 1,
    });
    pushResult({ rows: [], rowCount: 1 });
    expect(await unlinkChapterSource('c-1', 'm-1', 'u-1')).toBe(true);
  });
});

describe('listProvenanceForBook', () => {
  it('aggregates per-memory chapter references', async () => {
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          memory_title: 'A',
          memory_when_in_life: '1990',
          chapter_id: 'c-1',
          chapter_title: 'One',
          chapter_slug: 'one',
          chapter_position: 0,
        },
        {
          memory_id: 'm-1',
          memory_title: 'A',
          memory_when_in_life: '1990',
          chapter_id: 'c-2',
          chapter_title: 'Two',
          chapter_slug: 'two',
          chapter_position: 1,
        },
      ],
    });
    const r = await listProvenanceForBook('b-1', 'u-1');
    expect(r).toHaveLength(1);
    expect(r[0]!.chapterReferences).toHaveLength(2);
    expect(r[0]!.chapterReferences[0]!.chapterTitle).toBe('One');
  });
});
