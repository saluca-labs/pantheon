/**
 * Shared SavedViews — repo unit tests.
 *
 * Mocks the shared pg Pool via `getOsPool` so the repo exercises its own
 * SQL + JSONB serialization + cross-ownership guards without touching
 * Postgres. Pattern mirrors `research/repo-phase3.test.ts` and
 * `autobiographer/books-repo.test.ts`.
 *
 * @license MIT — Tiresias platform / Wave E shared primitives (internal).
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

vi.mock('@/lib/agentic-os/_shared/session', () => ({
  getOsPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  listSavedViews,
  getSavedView,
  createSavedView,
  deleteSavedView,
} from '@/lib/agentic-os/_shared/saved-views-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function savedViewRow(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sv-1',
    user_id: 'u-1',
    entity_kind: 'research:hypotheses',
    name: 'Open + high confidence',
    query: { status: 'open', query: '' },
    created_at: new Date('2026-05-14T10:00:00Z'),
    updated_at: new Date('2026-05-14T10:00:00Z'),
    ...o,
  };
}

// ─── listSavedViews ─────────────────────────────────────────────────────────

describe('saved-views-repo — listSavedViews()', () => {
  it('SELECTs from agos_shared_saved_views scoped by user_id + entity_kind', async () => {
    pushResult({ rows: [savedViewRow()] });
    await listSavedViews('u-1', 'research:hypotheses');
    expect(calls[0].sql).toMatch(/FROM agos_shared_saved_views/);
    expect(calls[0].sql).toMatch(/WHERE user_id = \$1 AND entity_kind = \$2/);
    expect(calls[0].params).toEqual(['u-1', 'research:hypotheses']);
  });

  it('orders oldest-first (stable pill order)', async () => {
    pushResult({ rows: [] });
    await listSavedViews('u-1', 'blockers');
    expect(calls[0].sql).toMatch(/ORDER BY created_at ASC/);
  });

  it('hydrates the wire shape from the row', async () => {
    pushResult({
      rows: [
        savedViewRow({
          id: 'sv-9',
          name: 'My view',
          query: { kind: 'all' },
        }),
      ],
    });
    const out = await listSavedViews('u-1', 'blockers');
    expect(out[0]).toEqual({
      id: 'sv-9',
      userId: 'u-1',
      entityKind: 'research:hypotheses',
      name: 'My view',
      query: { kind: 'all' },
      createdAt: '2026-05-14T10:00:00.000Z',
      updatedAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('returns [] when there are no rows', async () => {
    pushResult({ rows: [] });
    expect(await listSavedViews('u-1', 'blockers')).toEqual([]);
  });

  it('defaults a null query column to {}', async () => {
    pushResult({ rows: [savedViewRow({ query: null })] });
    const out = await listSavedViews('u-1', 'blockers');
    expect(out[0].query).toEqual({});
  });
});

// ─── getSavedView ───────────────────────────────────────────────────────────

describe('saved-views-repo — getSavedView()', () => {
  it('SELECTs by id + user_id (cross-ownership guard)', async () => {
    pushResult({ rows: [savedViewRow()] });
    await getSavedView('sv-1', 'u-1');
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0].params).toEqual(['sv-1', 'u-1']);
  });

  it('returns null on miss (foreign or unknown id)', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getSavedView('sv-x', 'u-1')).toBeNull();
  });

  it('returns the hydrated row on hit', async () => {
    pushResult({ rows: [savedViewRow({ name: 'Hit' })] });
    const out = await getSavedView('sv-1', 'u-1');
    expect(out?.name).toBe('Hit');
  });
});

// ─── createSavedView ────────────────────────────────────────────────────────

describe('saved-views-repo — createSavedView()', () => {
  it('INSERTs into agos_shared_saved_views with the full param list', async () => {
    pushResult({ rows: [savedViewRow()] });
    await createSavedView('u-1', {
      id: 'sv-1',
      entityKind: 'research:hypotheses',
      name: 'Open + high confidence',
      query: { status: 'open' },
    });
    expect(calls[0].sql).toMatch(/INSERT INTO agos_shared_saved_views/);
    expect(calls[0].params[0]).toBe('sv-1');
    expect(calls[0].params[1]).toBe('u-1');
    expect(calls[0].params[2]).toBe('research:hypotheses');
    expect(calls[0].params[3]).toBe('Open + high confidence');
  });

  it('serializes query to a JSONB string param', async () => {
    pushResult({ rows: [savedViewRow()] });
    await createSavedView('u-1', {
      entityKind: 'blockers',
      name: 'x',
      query: { kind: 'all', severity: 'high' },
    });
    expect(JSON.parse(calls[0].params[4] as string)).toEqual({
      kind: 'all',
      severity: 'high',
    });
  });

  it('passes a null id through (DB-side gen_random_uuid fallback)', async () => {
    pushResult({ rows: [savedViewRow()] });
    await createSavedView('u-1', {
      entityKind: 'blockers',
      name: 'x',
      query: {},
    });
    expect(calls[0].params[0]).toBeNull();
    expect(calls[0].sql).toMatch(/COALESCE\(\$1, gen_random_uuid\(\)\)/);
  });

  it('defaults a nullish query to {} before serialization', async () => {
    pushResult({ rows: [savedViewRow()] });
    await createSavedView('u-1', {
      entityKind: 'blockers',
      name: 'x',
      query: undefined,
    });
    expect(JSON.parse(calls[0].params[4] as string)).toEqual({});
  });

  it('returns the hydrated row from RETURNING', async () => {
    pushResult({ rows: [savedViewRow({ id: 'sv-new', name: 'New' })] });
    const out = await createSavedView('u-1', {
      id: 'sv-new',
      entityKind: 'blockers',
      name: 'New',
      query: {},
    });
    expect(out.id).toBe('sv-new');
    expect(out.name).toBe('New');
  });
});

// ─── deleteSavedView ────────────────────────────────────────────────────────

describe('saved-views-repo — deleteSavedView()', () => {
  it('DELETEs by id + user_id (cross-ownership guard)', async () => {
    pushResult({ rowCount: 1 });
    expect(await deleteSavedView('sv-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_shared_saved_views/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0].params).toEqual(['sv-1', 'u-1']);
  });

  it('returns false on miss (foreign or unknown id)', async () => {
    pushResult({ rowCount: 0 });
    expect(await deleteSavedView('sv-x', 'u-1')).toBe(false);
  });
});
