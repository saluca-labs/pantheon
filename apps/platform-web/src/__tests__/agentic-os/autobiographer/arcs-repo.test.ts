/**
 * Autobiographer OS — arcs-repo unit tests.
 *
 * Covers the create / patch / setArcPrimary / delete paths. The
 * `is_primary` single-active invariant is tested by asserting the
 * client-mock executes BEGIN → UPDATE clear-others → UPDATE set-self →
 * COMMIT in order.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const poolQueue: PgResult[] = [];
const poolCalls: { sql: string; params: any[] }[] = [];
const clientQueue: PgResult[] = [];
const clientCalls: { sql: string; params: any[] }[] = [];

function pushPool(r: Partial<PgResult>): void {
  poolQueue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}
function pushClient(r: Partial<PgResult>): void {
  clientQueue.push({
    rows: r.rows ?? [],
    rowCount: r.rowCount ?? r.rows?.length ?? 0,
  });
}

const clientReleaseSpy = vi.fn();
const clientMock = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    clientCalls.push({ sql, params });
    return clientQueue.shift() ?? { rows: [], rowCount: 0 };
  }),
  release: clientReleaseSpy,
};

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getAutobiographerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      poolCalls.push({ sql, params });
      return poolQueue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: async () => clientMock,
  }),
}));

import {
  createArc,
  deleteArc,
  getArc,
  getPrimaryArcForBook,
  listArcsForBook,
  setArcPrimary,
  updateArc,
  userOwnsBook,
} from '@/lib/agentic-os/autobiographer/arcs-repo';

beforeEach(() => {
  poolQueue.length = 0;
  poolCalls.length = 0;
  clientQueue.length = 0;
  clientCalls.length = 0;
  clientMock.query.mockClear();
  clientReleaseSpy.mockClear();
});

function arcRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'a-1',
    user_id: 'u-1',
    book_id: 'b-1',
    title: 'Chronological',
    kind: 'chronological',
    description: null,
    is_primary: false,
    metadata: {},
    created_at: new Date('2026-05-01'),
    updated_at: new Date('2026-05-01'),
    ...overrides,
  };
}

describe('listArcsForBook', () => {
  it('filters by book + user, ordered primary-first', async () => {
    pushPool({
      rows: [arcRow({ is_primary: true }), arcRow({ id: 'a-2' })],
    });
    const arcs = await listArcsForBook('b-1', 'u-1');
    expect(arcs).toHaveLength(2);
    expect(arcs[0]?.isPrimary).toBe(true);
    expect(poolCalls[0]!.sql).toMatch(/ORDER BY is_primary DESC/);
  });
});

describe('getArc', () => {
  it('returns null when not owned', async () => {
    pushPool({ rows: [] });
    expect(await getArc('a-x', 'u-1')).toBeNull();
  });
  it('maps row → arc', async () => {
    pushPool({ rows: [arcRow()] });
    const a = await getArc('a-1', 'u-1');
    expect(a?.kind).toBe('chronological');
  });
});

describe('getPrimaryArcForBook', () => {
  it('returns null when none', async () => {
    pushPool({ rows: [] });
    expect(await getPrimaryArcForBook('b-1', 'u-1')).toBeNull();
  });
  it('returns the primary arc', async () => {
    pushPool({ rows: [arcRow({ is_primary: true })] });
    const a = await getPrimaryArcForBook('b-1', 'u-1');
    expect(a?.isPrimary).toBe(true);
  });
});

describe('createArc', () => {
  it('rejects empty title', async () => {
    await expect(
      createArc('u-1', { bookId: 'b-1', title: '  ' }),
    ).rejects.toThrow(/required/);
  });
  it('rejects invalid kind', async () => {
    await expect(
      createArc('u-1', { bookId: 'b-1', title: 't', kind: 'bogus' as any }),
    ).rejects.toThrow(/Invalid arc kind/);
  });

  it('opens a transaction + commits and creates the row', async () => {
    // BEGIN
    pushClient({ rows: [] });
    // INSERT (no clear when isPrimary false)
    pushClient({ rows: [] });
    // COMMIT
    pushClient({ rows: [] });
    // getArc on the pool
    pushPool({ rows: [arcRow({ title: 'My arc' })] });
    const arc = await createArc('u-1', { bookId: 'b-1', title: 'My arc' });
    expect(arc.title).toBe('My arc');
    expect(clientCalls[0]!.sql).toMatch(/BEGIN/);
    const last = clientCalls[clientCalls.length - 1]!;
    expect(last.sql).toMatch(/COMMIT/);
    expect(clientReleaseSpy).toHaveBeenCalled();
  });

  it('clears every primary sibling when isPrimary=true on create', async () => {
    pushClient({ rows: [] }); // BEGIN
    pushClient({ rows: [] }); // UPDATE clear siblings
    pushClient({ rows: [] }); // INSERT
    pushClient({ rows: [] }); // COMMIT
    pushPool({ rows: [arcRow({ is_primary: true })] }); // getArc
    await createArc('u-1', { bookId: 'b-1', title: 't', isPrimary: true });
    // Find the clear-siblings UPDATE
    const clear = clientCalls.find((c) =>
      /UPDATE agos_autobiographer_arcs[\s\S]+SET is_primary = false[\s\S]+WHERE book_id/.test(
        c.sql,
      ),
    );
    expect(clear).toBeDefined();
  });
});

describe('updateArc', () => {
  it('returns null when arc missing on flip-to-primary path', async () => {
    pushPool({ rows: [] }); // getArc(before)
    const r = await updateArc('a-x', 'u-1', { isPrimary: true });
    expect(r).toBeNull();
  });

  it('flips is_primary inside a single transaction', async () => {
    pushPool({ rows: [arcRow()] }); // getArc(before)
    pushClient({ rows: [] }); // BEGIN
    pushClient({ rows: [{ book_id: 'b-1' }], rowCount: 1 }); // SELECT FOR UPDATE
    pushClient({ rows: [] }); // UPDATE clear siblings
    pushClient({ rows: [] }); // UPDATE set primary
    pushClient({ rows: [] }); // COMMIT
    pushPool({ rows: [arcRow({ is_primary: true })] }); // getArc(after)
    const a = await updateArc('a-1', 'u-1', { isPrimary: true });
    expect(a?.isPrimary).toBe(true);
    // Ordering: BEGIN before clear, clear before set.
    const idxBegin = clientCalls.findIndex((c) => /BEGIN/.test(c.sql));
    const idxClear = clientCalls.findIndex((c) =>
      /SET is_primary = false[\s\S]+WHERE book_id/.test(c.sql),
    );
    const idxSet = clientCalls.findIndex((c) =>
      /SET[\s\S]+is_primary  = true/.test(c.sql),
    );
    expect(idxBegin).toBeLessThan(idxClear);
    expect(idxClear).toBeLessThan(idxSet);
  });

  it('plain patch path (no is_primary flip) goes through the pool directly', async () => {
    pushPool({ rows: [] }); // UPDATE
    pushPool({ rows: [arcRow({ title: 'New title' })] }); // getArc
    const a = await updateArc('a-1', 'u-1', { title: 'New title' });
    expect(a?.title).toBe('New title');
    // No client.connect transaction.
    expect(clientCalls).toHaveLength(0);
  });
});

describe('setArcPrimary', () => {
  it('returns null when arc missing for caller', async () => {
    pushClient({ rows: [] }); // BEGIN
    pushClient({ rows: [], rowCount: 0 }); // SELECT FOR UPDATE → not owned
    pushClient({ rows: [] }); // ROLLBACK
    const r = await setArcPrimary('a-x', 'u-1');
    expect(r).toBeNull();
    expect(clientCalls[clientCalls.length - 1]!.sql).toMatch(/ROLLBACK/);
  });

  it('clears siblings + sets self atomically', async () => {
    pushClient({ rows: [] }); // BEGIN
    pushClient({ rows: [{ book_id: 'b-1' }], rowCount: 1 }); // SELECT FOR UPDATE
    pushClient({ rows: [] }); // UPDATE clear
    pushClient({ rows: [] }); // UPDATE set
    pushClient({ rows: [] }); // COMMIT
    pushPool({ rows: [arcRow({ is_primary: true })] }); // getArc
    const r = await setArcPrimary('a-1', 'u-1');
    expect(r?.isPrimary).toBe(true);
    const last = clientCalls[clientCalls.length - 1]!;
    expect(last.sql).toMatch(/COMMIT/);
  });
});

describe('deleteArc', () => {
  it('returns true on removed row', async () => {
    pushPool({ rows: [], rowCount: 1 });
    expect(await deleteArc('a-1', 'u-1')).toBe(true);
  });
  it('returns false on no-op', async () => {
    pushPool({ rows: [], rowCount: 0 });
    expect(await deleteArc('a-x', 'u-1')).toBe(false);
  });
});

describe('userOwnsBook', () => {
  it('returns true on match', async () => {
    pushPool({ rows: [{ '?column?': 1 }], rowCount: 1 });
    expect(await userOwnsBook('b-1', 'u-1')).toBe(true);
  });
  it('returns false on cross-tenant', async () => {
    pushPool({ rows: [] });
    expect(await userOwnsBook('b-x', 'u-1')).toBe(false);
  });
});
