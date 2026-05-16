/**
 * Autobiographer OS — memory-people-repo unit tests.
 *
 * Mocks the shared pg Pool. Exercises the cross-ownership probe pair
 * (memory + person both must belong to caller), the unique-violation →
 * duplicate-link mapping, and the joined list-by-memory + list-by-person
 * shapes.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
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
  listPeopleForMemory,
  listMemoriesForPerson,
  listBooksForPerson,
  linkPersonToMemory,
  updateLink,
  deleteLink,
} from '@/lib/agentic-os/autobiographer/memory-people-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  errorsToThrow.length = 0;
});

// ─── ownership probes (used by every mutating call) ─────────────────────────

function pushMemoryOk(ok: boolean): void {
  pushResult({
    rows: ok ? [{ '?column?': 1 }] : [],
    rowCount: ok ? 1 : 0,
  });
}

function pushPersonOk(ok: boolean): void {
  pushResult({
    rows: ok ? [{ '?column?': 1 }] : [],
    rowCount: ok ? 1 : 0,
  });
}

// ─── listPeopleForMemory ────────────────────────────────────────────────────

describe('listPeopleForMemory', () => {
  it('joins through memories and people, filtered by user_id on both sides', async () => {
    pushResult({ rows: [] });
    await listPeopleForMemory('m-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/agos_autobiographer_memory_people/);
    expect(calls[0]!.sql).toMatch(/JOIN agos_autobiographer_people/);
    expect(calls[0]!.sql).toMatch(/JOIN agos_autobiographer_memories/);
    expect(calls[0]!.sql).toMatch(/m\.user_id\s*=\s*\$2/);
    expect(calls[0]!.sql).toMatch(/p\.user_id\s*=\s*\$2/);
    expect(calls[0]!.params).toEqual(['m-1', 'u-1']);
  });

  it('returns joined shape with link role + notes + person nested', async () => {
    pushResult({
      rows: [
        {
          link_role: 'protagonist',
          link_notes: null,
          id: 'p-1',
          user_id: 'u-1',
          canonical_name: 'Maria',
          aliases: [],
          relation: null,
          birth_year: null,
          death_year: null,
          consent_to_publish: 'granted',
          consent_recorded_at: null,
          consent_recorded_by: null,
          notes: null,
          image_url: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await listPeopleForMemory('m-1', 'u-1');
    expect(r).toHaveLength(1);
    expect(r[0]!.role).toBe('protagonist');
    expect(r[0]!.person.canonicalName).toBe('Maria');
    expect(r[0]!.person.consentToPublish).toBe('granted');
  });
});

// ─── listMemoriesForPerson ──────────────────────────────────────────────────

describe('listMemoriesForPerson', () => {
  it('joins through people + memories and orders by era ASC NULLS LAST', async () => {
    pushResult({ rows: [] });
    await listMemoriesForPerson('p-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/ORDER BY m\.era_date_estimate ASC NULLS LAST/);
    expect(calls[0]!.params).toEqual(['p-1', 'u-1']);
  });

  it('returns flat memory shape with role + notes from the link row', async () => {
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          book_id: 'b-1',
          title: 'First move',
          when_in_life: 'around 1985',
          era_date_estimate: new Date('1985-01-01'),
          link_role: 'witness',
          link_notes: null,
          updated_at: new Date(),
        },
      ],
    });
    const r = await listMemoriesForPerson('p-1', 'u-1');
    expect(r[0]!.role).toBe('witness');
    expect(r[0]!.title).toBe('First move');
    expect(r[0]!.eraDateEstimate).toBe('1985-01-01');
  });
});

// ─── listBooksForPerson ─────────────────────────────────────────────────────

describe('listBooksForPerson', () => {
  it('counts memories per book and filters user_id on all three tables', async () => {
    pushResult({ rows: [] });
    await listBooksForPerson('p-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/agos_autobiographer_books/);
    expect(calls[0]!.sql).toMatch(/COUNT\(m\.id\)::int/);
    expect(calls[0]!.sql).toMatch(/m\.user_id\s*=\s*\$2/);
    expect(calls[0]!.sql).toMatch(/p\.user_id\s*=\s*\$2/);
    expect(calls[0]!.sql).toMatch(/b\.user_id\s*=\s*\$2/);
  });

  it('coerces memory_count to a number', async () => {
    pushResult({
      rows: [
        { book_id: 'b-1', book_title: 'My Story', memory_count: '3' },
      ],
    });
    const r = await listBooksForPerson('p-1', 'u-1');
    expect(r[0]!.memoryCount).toBe(3);
  });
});

// ─── linkPersonToMemory ─────────────────────────────────────────────────────

describe('linkPersonToMemory', () => {
  it('probes both ownerships before insert and refetches the link', async () => {
    pushMemoryOk(true);
    pushPersonOk(true);
    pushResult({}); // insert
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          person_id: 'p-1',
          role: 'protagonist',
          notes: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const link = await linkPersonToMemory('m-1', 'p-1', 'u-1', {
      role: 'protagonist',
    });
    expect(link.role).toBe('protagonist');
    // First two calls are ownership probes against the parent tables.
    expect(calls[0]!.sql).toMatch(/agos_autobiographer_memories/);
    expect(calls[1]!.sql).toMatch(/agos_autobiographer_people/);
  });

  it('throws not_found when memory does not belong to caller', async () => {
    pushMemoryOk(false);
    pushPersonOk(true);
    await expect(
      linkPersonToMemory('m-other', 'p-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws not_found when person does not belong to caller', async () => {
    pushMemoryOk(true);
    pushPersonOk(false);
    await expect(
      linkPersonToMemory('m-1', 'p-other', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does NOT distinguish missing-memory from missing-person (no existence leak)', async () => {
    pushMemoryOk(false);
    pushPersonOk(false);
    await expect(
      linkPersonToMemory('m-x', 'p-x', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('translates 23505 into typed duplicate error', async () => {
    pushMemoryOk(true);
    pushPersonOk(true);
    const dup = new Error('uq') as Error & { code?: string; constraint?: string };
    dup.code = '23505';
    pushError(dup);
    await expect(
      linkPersonToMemory('m-1', 'p-1', 'u-1'),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });
});

// ─── updateLink ──────────────────────────────────────────────────────────────

describe('updateLink', () => {
  it('throws not_found when either endpoint is foreign', async () => {
    pushMemoryOk(false);
    pushPersonOk(true);
    await expect(
      updateLink('m-x', 'p-1', 'u-1', { role: 'witness' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('updates role + refetches the link row', async () => {
    pushMemoryOk(true);
    pushPersonOk(true);
    pushResult({}); // update
    pushResult({
      rows: [
        {
          memory_id: 'm-1',
          person_id: 'p-1',
          role: 'witness',
          notes: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await updateLink('m-1', 'p-1', 'u-1', { role: 'witness' });
    expect(r!.role).toBe('witness');
    expect(calls[2]!.sql).toMatch(/UPDATE agos_autobiographer_memory_people/);
  });

  it('returns null when nothing matches', async () => {
    pushMemoryOk(true);
    pushPersonOk(true);
    pushResult({}); // update
    pushResult({ rows: [], rowCount: 0 }); // refetch
    expect(
      await updateLink('m-1', 'p-1', 'u-1', { role: 'witness' }),
    ).toBeNull();
  });
});

// ─── deleteLink ──────────────────────────────────────────────────────────────

describe('deleteLink', () => {
  it('throws not_found if either endpoint is foreign', async () => {
    pushMemoryOk(true);
    pushPersonOk(false);
    await expect(
      deleteLink('m-1', 'p-other', 'u-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('issues a DELETE on the composite PK', async () => {
    pushMemoryOk(true);
    pushPersonOk(true);
    pushResult({ rowCount: 1 });
    expect(await deleteLink('m-1', 'p-1', 'u-1')).toBe(true);
    expect(calls[2]!.sql).toMatch(
      /DELETE FROM agos_autobiographer_memory_people/,
    );
    expect(calls[2]!.sql).toMatch(/memory_id = \$1 AND person_id = \$2/);
  });

  it('returns false on miss', async () => {
    pushMemoryOk(true);
    pushPersonOk(true);
    pushResult({ rowCount: 0 });
    expect(await deleteLink('m-1', 'p-1', 'u-1')).toBe(false);
  });
});
