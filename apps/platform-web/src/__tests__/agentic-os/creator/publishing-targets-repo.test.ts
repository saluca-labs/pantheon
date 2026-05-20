/**
 * Creator OS — publishing-targets-repo unit tests.
 *
 * Mocks the shared pg Pool via getCreatorPool so the repo exercises its
 * own SQL + serialization logic without touching Postgres.
 *
 * @license MIT — Tiresias Creator OS (internal).
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

vi.mock('@/lib/agentic-os/creator/session', () => ({
  getCreatorPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

vi.mock('@/lib/agentic-os/_shared/audit', () => ({
  recordAudit: vi.fn(async () => {}),
}));

import {
  listTargets,
  getTarget,
  createTarget,
  updateTarget,
  deleteTarget,
} from '@/lib/agentic-os/creator/publishing-targets-repo';
import { isValidIsbn13 } from '@/lib/agentic-os/creator/publishing-targets';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function targetRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't-1',
    book_id: 'b-1',
    platform: 'kdp_paperback',
    format: 'paperback',
    trim_size: '6x9',
    isbn: null,
    bisac_codes: ['COM051000'],
    price_usd: '14.99',
    status: 'draft',
    notes: null,
    created_at: new Date('2026-05-19T00:00:00Z'),
    updated_at: new Date('2026-05-19T00:01:00Z'),
    ...overrides,
  };
}

// ─── listTargets ─────────────────────────────────────────────────────────────

describe('listTargets', () => {
  it('joins through agos_creator_books to enforce ownership', async () => {
    pushResult({ rows: [targetRow()] });
    const r = await listTargets('b-1', 'u-1');
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/JOIN agos_creator_books b ON t\.book_id = b\.id/);
    expect(calls[0]!.sql).toMatch(/WHERE t\.book_id = \$1 AND b\.user_id = \$2/);
    expect(calls[0]!.params).toEqual(['b-1', 'u-1']);
  });

  it('coerces price_usd from string to number', async () => {
    pushResult({ rows: [targetRow({ price_usd: '9.99' })] });
    const [t] = await listTargets('b-1', 'u-1');
    expect(t!.priceUsd).toBe(9.99);
    expect(typeof t!.priceUsd).toBe('number');
  });

  it('defaults bisac_codes to [] when null', async () => {
    pushResult({ rows: [targetRow({ bisac_codes: null })] });
    const [t] = await listTargets('b-1', 'u-1');
    expect(t!.bisacCodes).toEqual([]);
  });
});

// ─── getTarget ───────────────────────────────────────────────────────────────

describe('getTarget', () => {
  it('returns null when the row does not exist or belongs to another user', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const r = await getTarget('t-1', 'b-1', 'u-1');
    expect(r).toBeNull();
    expect(calls[0]!.sql).toMatch(/WHERE t\.id = \$1 AND t\.book_id = \$2 AND b\.user_id = \$3/);
    expect(calls[0]!.params).toEqual(['t-1', 'b-1', 'u-1']);
  });

  it('serializes a full row', async () => {
    pushResult({ rows: [targetRow()] });
    const r = await getTarget('t-1', 'b-1', 'u-1');
    expect(r).toMatchObject({
      id: 't-1',
      bookId: 'b-1',
      platform: 'kdp_paperback',
      format: 'paperback',
      trimSize: '6x9',
      bisacCodes: ['COM051000'],
      status: 'draft',
    });
  });
});

// ─── createTarget ────────────────────────────────────────────────────────────

describe('createTarget', () => {
  it('returns null when the parent book does not belong to the user', async () => {
    pushResult({ rows: [], rowCount: 0 }); // ownership check fails
    const r = await createTarget('b-1', 'u-1', {
      platform: 'kdp_paperback',
      format: 'paperback',
    });
    expect(r).toBeNull();
    expect(calls).toHaveLength(1); // INSERT never issued
  });

  it('inserts the row when ownership passes and returns it', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // ownership ok
    pushResult({ rowCount: 1 }); // INSERT
    pushResult({ rows: [targetRow()] }); // getTarget readback
    const r = await createTarget('b-1', 'u-1', {
      platform: 'kdp_paperback',
      format: 'paperback',
      trimSize: '6x9',
      bisacCodes: ['COM051000'],
      priceUsd: 14.99,
    });
    expect(r).not.toBeNull();
    expect(calls[1]!.sql).toMatch(/INSERT INTO agos_creator_book_publishing_targets/);
    expect(calls[1]!.params[2]).toBe('kdp_paperback'); // platform
    expect(calls[1]!.params[3]).toBe('paperback'); // format
    expect(calls[1]!.params[4]).toBe('6x9'); // trim_size
    expect(calls[1]!.params[6]).toEqual(['COM051000']); // bisac_codes
    expect(calls[1]!.params[7]).toBe(14.99); // price_usd
  });
});

// ─── updateTarget ────────────────────────────────────────────────────────────

describe('updateTarget', () => {
  it('returns the existing target when patch is empty', async () => {
    pushResult({ rows: [targetRow()] });
    const r = await updateTarget('t-1', 'b-1', 'u-1', {});
    expect(r.kind).toBe('ok');
    expect(calls).toHaveLength(1); // only the readback fired
  });

  it('builds a partial-patch UPDATE for only provided fields', async () => {
    pushResult({ rows: [{ id: 't-1' }], rowCount: 1 }); // UPDATE
    pushResult({ rows: [targetRow({ isbn: '978-0-13-468599-1' })] }); // readback
    const r = await updateTarget('t-1', 'b-1', 'u-1', {
      isbn: '978-0-13-468599-1',
      status: 'ready',
    });
    expect(r.kind).toBe('ok');
    const updateSql = calls[0]!.sql;
    expect(updateSql).toMatch(/SET isbn = \$4, status = \$5/);
    expect(updateSql).toMatch(/FROM agos_creator_books b/);
    expect(updateSql).toMatch(/AND b\.user_id = \$3/);
    expect(calls[0]!.params).toEqual([
      't-1',
      'b-1',
      'u-1',
      '978-0-13-468599-1',
      'ready',
    ]);
  });

  it('returns not_found when the UPDATE affects zero rows', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const r = await updateTarget('t-1', 'b-1', 'u-1', { status: 'ready' });
    expect(r.kind).toBe('not_found');
  });
});

// ─── deleteTarget ────────────────────────────────────────────────────────────

describe('deleteTarget', () => {
  it('returns false when nothing was deleted', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const r = await deleteTarget('t-1', 'b-1', 'u-1');
    expect(r).toBe(false);
  });

  it('joins through agos_creator_books on delete', async () => {
    pushResult({ rows: [{ id: 't-1' }], rowCount: 1 });
    const r = await deleteTarget('t-1', 'b-1', 'u-1');
    expect(r).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_creator_book_publishing_targets t/);
    expect(calls[0]!.sql).toMatch(/USING agos_creator_books b/);
    expect(calls[0]!.sql).toMatch(/AND b\.user_id = \$3/);
    expect(calls[0]!.params).toEqual(['t-1', 'b-1', 'u-1']);
  });
});

// ─── isValidIsbn13 ───────────────────────────────────────────────────────────

describe('isValidIsbn13', () => {
  it('accepts a known-good 978 ISBN-13', () => {
    // Computed: 9+21+8+0+1+9+4+18+8+15+9+27 = 129; (10 - 129%10) % 10 = 1
    expect(isValidIsbn13('978-0-13-468599-1')).toBe(true);
  });

  it('accepts a known-good 979 ISBN-13 (KDP-issued range)', () => {
    // Computed: 9+21+9+24+9+24+7+18+5+12+3+6 = 147; (10 - 147%10) % 10 = 3
    expect(isValidIsbn13('979-8-9876543-2-3')).toBe(true);
  });

  it('rejects a bad checksum', () => {
    // Same prefix as the valid 978 ISBN above, but wrong check digit.
    expect(isValidIsbn13('978-0-13-468599-2')).toBe(false);
  });

  it('rejects non-978/979 prefixes', () => {
    expect(isValidIsbn13('123-4-56-789012-3')).toBe(false);
  });

  it('treats empty string as valid (presence checked separately)', () => {
    expect(isValidIsbn13('')).toBe(true);
  });
});
