/**
 * Autobiographer OS — memory-themes-repo unit tests.
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
  linkThemeToMemory,
  listMemoriesForTheme,
  listThemesForMemory,
  listThemesForMemoryIds,
  unlinkThemeFromMemory,
} from '@/lib/agentic-os/autobiographer/memory-themes-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  errorsToThrow.length = 0;
});

describe('cross-ownership probes', () => {
  it('linkThemeToMemory raises not_found when memory is foreign', async () => {
    pushResult({ rows: [] }); // memoryBelongsToUser → no
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // themeBelongs
    await expect(
      linkThemeToMemory('m-x', 't-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('linkThemeToMemory raises not_found when theme is foreign', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [] });
    await expect(
      linkThemeToMemory('m-1', 't-x', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('linkThemeToMemory raises duplicate on 23505', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    const err: any = new Error('dup');
    err.code = '23505';
    pushError(err);
    await expect(
      linkThemeToMemory('m-1', 't-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('linkThemeToMemory returns the row on success', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [] }); // insert
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          theme_id: 't-1',
          created_at: new Date('2026-05-01'),
        },
      ],
    });
    const r = await linkThemeToMemory('m-1', 't-1', 'u-1');
    expect(r).toMatchObject({ memoryId: 'm-1', themeId: 't-1' });
  });

  it('unlinkThemeFromMemory returns false when no row removed', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [], rowCount: 0 });
    expect(await unlinkThemeFromMemory('m-1', 't-1', 'u-1')).toBe(false);
  });

  it('unlinkThemeFromMemory raises not_found when memory is foreign', async () => {
    pushResult({ rows: [] });
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    await expect(
      unlinkThemeFromMemory('m-x', 't-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('joined readers', () => {
  it('listThemesForMemory maps rows', async () => {
    pushResult({
      rows: [
        {
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
    const r = await listThemesForMemory('m-1', 'u-1');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'Loss', color: 'rose' });
  });

  it('listMemoriesForTheme maps rows and date-stringifies era_date_estimate', async () => {
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          book_id: 'b-1',
          title: 'First move',
          when_in_life: 'age 8',
          era_date_estimate: new Date('1995-08-13'),
          updated_at: new Date(),
        },
      ],
    });
    const r = await listMemoriesForTheme('t-1', 'u-1');
    expect(r[0]?.eraDateEstimate).toBe('1995-08-13');
  });

  it('listThemesForMemoryIds returns empty map without DB hit on []', async () => {
    const r = await listThemesForMemoryIds([], 'u-1');
    expect(r.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('listThemesForMemoryIds groups rows by memory_id', async () => {
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
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
        {
          memory_id: 'm-1',
          id: 't-2',
          user_id: 'u-1',
          name: 'Music',
          slug: 'music',
          description: null,
          color: 'sky',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          memory_id: 'm-2',
          id: 't-2',
          user_id: 'u-1',
          name: 'Music',
          slug: 'music',
          description: null,
          color: 'sky',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await listThemesForMemoryIds(['m-1', 'm-2'], 'u-1');
    expect(r.get('m-1')).toHaveLength(2);
    expect(r.get('m-2')).toHaveLength(1);
  });
});
