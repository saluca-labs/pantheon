/**
 * Autobiographer OS — themes-repo unit tests.
 *
 * Mocks the shared pg Pool. Exercises the create / patch / delete /
 * lookup paths and the duplicate-violation → `duplicate` error mapping.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];
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
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const err = errorsToThrow.shift();
      const result = queue.shift() ?? { rows: [], rowCount: 0 };
      if (err) throw err;
      return result;
    }),
  }),
}));

import {
  createTheme,
  deleteTheme,
  getTheme,
  getThemesByIds,
  listThemes,
  updateTheme,
} from '@/lib/agentic-os/autobiographer/themes-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  errorsToThrow.length = 0;
});

const sampleRow = {
  id: 't-1',
  user_id: 'u-1',
  name: 'Immigration',
  slug: 'immigration',
  description: null,
  color: 'indigo',
  metadata: {},
  created_at: new Date('2026-05-01T00:00:00Z'),
  updated_at: new Date('2026-05-01T00:00:00Z'),
};

describe('listThemes', () => {
  it('filters by user_id', async () => {
    pushResult({ rows: [sampleRow] });
    const rows = await listThemes({ userId: 'u-1' });
    expect(rows).toHaveLength(1);
    expect(calls[0]!.params[0]).toBe('u-1');
  });

  it('applies the search filter when provided', async () => {
    pushResult({ rows: [] });
    await listThemes({ userId: 'u-1', search: 'immig' });
    expect(calls[0]!.sql).toMatch(/lower\(name\) LIKE/);
    expect(calls[0]!.params).toContain('%immig%');
  });

  it('clamps limit + offset to safe bounds', async () => {
    pushResult({ rows: [] });
    await listThemes({ userId: 'u-1', limit: -10, offset: -5 });
    // limit clamps to >=1; offset to >=0
    const params = calls[0]!.params;
    expect(params[params.length - 2]).toBe(1);
    expect(params[params.length - 1]).toBe(0);
  });
});

describe('getTheme', () => {
  it('returns null when nothing matches', async () => {
    pushResult({ rows: [] });
    const r = await getTheme('t-x', 'u-1');
    expect(r).toBeNull();
  });
  it('maps row to AutobiographerTheme', async () => {
    pushResult({ rows: [sampleRow] });
    const r = await getTheme('t-1', 'u-1');
    expect(r).toMatchObject({
      id: 't-1',
      userId: 'u-1',
      name: 'Immigration',
      slug: 'immigration',
      color: 'indigo',
    });
  });
});

describe('createTheme', () => {
  it('rejects empty name', async () => {
    await expect(createTheme('u-1', { name: '   ' } as never)).rejects.toThrow(
      /required/,
    );
  });

  it('throws duplicate on PG 23505', async () => {
    const err = new Error('uq violation') as Error & { code?: string; constraint?: string };
    err.code = '23505';
    pushError(err);
    await expect(
      createTheme('u-1', { name: 'Immigration' }),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('falls back to derived slug when slug omitted', async () => {
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [{ ...sampleRow, slug: 'loss-recovery' }] }); // getTheme
    const t = await createTheme('u-1', { name: 'Loss & Recovery' });
    expect(t.slug).toBe('loss-recovery');
    const insertCall = calls[0]!;
    expect(insertCall.params[3]).toBe('loss-recovery'); // slug param
  });

  it('uses supplied slug verbatim', async () => {
    pushResult({ rows: [] });
    pushResult({ rows: [{ ...sampleRow, slug: 'custom-slug' }] });
    const t = await createTheme('u-1', { name: 'X', slug: 'custom-slug' });
    expect(t.slug).toBe('custom-slug');
  });
});

describe('updateTheme', () => {
  it('returns null when row does not exist for caller', async () => {
    pushResult({ rows: [] }); // UPDATE
    pushResult({ rows: [] }); // getTheme
    const r = await updateTheme('t-x', 'u-1', { name: 'X' });
    expect(r).toBeNull();
  });

  it('throws duplicate on PG 23505', async () => {
    const err = new Error('uq violation') as Error & { code?: string; constraint?: string };
    err.code = '23505';
    pushError(err);
    await expect(
      updateTheme('t-1', 'u-1', { slug: 'taken' }),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('lets caller clear description with explicit null', async () => {
    pushResult({ rows: [] });
    pushResult({ rows: [{ ...sampleRow, description: null }] });
    const r = await updateTheme('t-1', 'u-1', { description: null });
    expect(r?.description).toBeNull();
    // The UPDATE must have included the description-cleared flag set true.
    expect(calls[0]!.params[4]).toBe(true);
  });
});

describe('deleteTheme', () => {
  it('returns true when a row is removed', async () => {
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteTheme('t-1', 'u-1')).toBe(true);
  });
  it('returns false on no-op delete', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await deleteTheme('t-x', 'u-1')).toBe(false);
  });
});

describe('getThemesByIds', () => {
  it('returns [] on empty id list without hitting the DB', async () => {
    const rows = await getThemesByIds([], 'u-1');
    expect(rows).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it('dedupes ids when forming the query', async () => {
    pushResult({ rows: [sampleRow] });
    await getThemesByIds(['a', 'a', 'b'], 'u-1');
    expect(calls[0]!.params[0]).toEqual(['a', 'b']);
  });
});
