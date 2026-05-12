/**
 * Autobiographer OS — pseudonyms-repo unit tests.
 *
 * Mocks the shared pg Pool. Exercises list / get / create / update /
 * delete / markPseudonymsApplied paths and the unique-violation → 409
 * mapping.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
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
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? r.rows?.length ?? 0 });
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
  bookAndPersonBelongToUser,
  createPseudonym,
  deletePseudonym,
  getPseudonym,
  listPseudonymsForBook,
  markPseudonymsApplied,
  updatePseudonym,
} from '@/lib/agentic-os/autobiographer/pseudonyms-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  errorsToThrow.length = 0;
});

const sampleRow = {
  id: 'p-1',
  book_id: 'b-1',
  user_id: 'u-1',
  person_id: 'pe-1',
  pseudonym: 'Mary',
  notes: null,
  applied: false,
  created_at: new Date('2026-05-12T00:00:00Z'),
  updated_at: new Date('2026-05-12T00:00:00Z'),
};

describe('listPseudonymsForBook', () => {
  it('filters by book_id + user_id and joins person fields', async () => {
    pushResult({
      rows: [
        {
          ...sampleRow,
          person_canonical_name: 'Mom',
          person_aliases: ['Mama'],
        },
      ],
    });
    const rows = await listPseudonymsForBook('b-1', 'u-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.personCanonicalName).toBe('Mom');
    expect(rows[0]!.personAliases).toEqual(['Mama']);
    expect(calls[0]!.params).toEqual(['b-1', 'u-1']);
  });
});

describe('getPseudonym', () => {
  it('returns null on no match', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getPseudonym('p-1', 'u-1');
    expect(out).toBeNull();
  });

  it('returns hydrated row on match', async () => {
    pushResult({ rows: [sampleRow] });
    const out = await getPseudonym('p-1', 'u-1');
    expect(out!.pseudonym).toBe('Mary');
    expect(out!.applied).toBe(false);
  });
});

describe('bookAndPersonBelongToUser', () => {
  it('returns true when both probes return 1', async () => {
    pushResult({ rows: [{ book_ok: 1, person_ok: 1 }] });
    const ok = await bookAndPersonBelongToUser('b-1', 'pe-1', 'u-1');
    expect(ok).toBe(true);
  });

  it('returns false when the book probe is null', async () => {
    pushResult({ rows: [{ book_ok: null, person_ok: 1 }] });
    const ok = await bookAndPersonBelongToUser('b-1', 'pe-1', 'u-1');
    expect(ok).toBe(false);
  });

  it('returns false when the person probe is null', async () => {
    pushResult({ rows: [{ book_ok: 1, person_ok: null }] });
    const ok = await bookAndPersonBelongToUser('b-1', 'pe-1', 'u-1');
    expect(ok).toBe(false);
  });
});

describe('createPseudonym', () => {
  it('inserts then re-reads', async () => {
    pushResult({}); // insert
    pushResult({ rows: [sampleRow] }); // re-read
    const out = await createPseudonym('u-1', {
      bookId: 'b-1',
      personId: 'pe-1',
      pseudonym: 'Mary',
    });
    expect(out.id).toBe('p-1');
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_autobiographer_pseudonyms/);
  });

  it('maps Postgres 23505 to typed duplicate error', async () => {
    const dup: any = new Error('unique_violation');
    dup.code = '23505';
    pushError(dup);
    await expect(
      createPseudonym('u-1', {
        bookId: 'b-1',
        personId: 'pe-1',
        pseudonym: 'Mary',
      }),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('rejects empty pseudonym', async () => {
    await expect(
      createPseudonym('u-1', {
        bookId: 'b-1',
        personId: 'pe-1',
        pseudonym: '   ',
      }),
    ).rejects.toThrow(/pseudonym is required/);
  });

  it('rejects pseudonym over the length cap', async () => {
    await expect(
      createPseudonym('u-1', {
        bookId: 'b-1',
        personId: 'pe-1',
        pseudonym: 'x'.repeat(201),
      }),
    ).rejects.toThrow(/exceeds/);
  });
});

describe('updatePseudonym', () => {
  it('PATCHes pseudonym + notes + applied flag', async () => {
    pushResult({}); // update
    pushResult({ rows: [{ ...sampleRow, pseudonym: 'Mira', applied: true }] });
    const out = await updatePseudonym('p-1', 'u-1', {
      pseudonym: 'Mira',
      applied: true,
    });
    expect(out!.pseudonym).toBe('Mira');
    expect(out!.applied).toBe(true);
  });

  it('handles a notes-only update (notesProvided=true)', async () => {
    pushResult({});
    pushResult({ rows: [{ ...sampleRow, notes: 'why' }] });
    const out = await updatePseudonym('p-1', 'u-1', { notes: 'why' });
    expect(out!.notes).toBe('why');
  });

  it('rejects empty pseudonym in PATCH', async () => {
    await expect(
      updatePseudonym('p-1', 'u-1', { pseudonym: '  ' }),
    ).rejects.toThrow(/pseudonym is required/);
  });
});

describe('deletePseudonym', () => {
  it('returns true when a row was removed', async () => {
    pushResult({ rowCount: 1 });
    expect(await deletePseudonym('p-1', 'u-1')).toBe(true);
  });

  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0 });
    expect(await deletePseudonym('p-1', 'u-1')).toBe(false);
  });
});

describe('markPseudonymsApplied', () => {
  it('returns 0 on empty input without hitting the DB', async () => {
    const n = await markPseudonymsApplied([], 'u-1');
    expect(n).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('issues a single UPDATE with ANY(uuid[]) for the provided ids', async () => {
    pushResult({ rowCount: 3 });
    const n = await markPseudonymsApplied(['p-1', 'p-2', 'p-2'], 'u-1');
    expect(n).toBe(3);
    expect(calls[0]!.sql).toMatch(/UPDATE agos_autobiographer_pseudonyms/);
    // Dedup happens on the call site.
    expect(calls[0]!.params[0]).toEqual(['p-1', 'p-2']);
  });
});
