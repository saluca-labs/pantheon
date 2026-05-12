/**
 * Autobiographer OS — people-repo unit tests.
 *
 * Mocks the shared pg Pool. Exercises listing/filtering, the
 * canonical-name UNIQUE catch (23505 → duplicate_name), consent flip
 * helper, and the joined-count getter.
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
  listPeople,
  getPerson,
  getPersonWithCounts,
  createPerson,
  updatePerson,
  recordConsent,
  deletePerson,
} from '@/lib/agentic-os/autobiographer/people-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  errorsToThrow.length = 0;
});

function personRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'p-1',
    user_id: 'u-1',
    canonical_name: 'Maria Ruvalcaba',
    aliases: [],
    relation: null,
    birth_year: null,
    death_year: null,
    consent_to_publish: 'pending',
    consent_recorded_at: null,
    consent_recorded_by: null,
    notes: null,
    image_url: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T01:00:00Z'),
    ...overrides,
  };
}

// ─── listPeople ──────────────────────────────────────────────────────────────

describe('listPeople', () => {
  it('queries agos_autobiographer_people ordered by lower(canonical_name) ASC', async () => {
    pushResult({ rows: [personRow()] });
    const r = await listPeople({ userId: 'u-1' });
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_autobiographer_people/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0]!.sql).toMatch(/ORDER BY lower\(canonical_name\) ASC/);
  });

  it('filters by consent_to_publish when provided', async () => {
    pushResult({ rows: [] });
    await listPeople({ userId: 'u-1', consentToPublish: 'pending' });
    expect(calls[0]!.sql).toMatch(/consent_to_publish = \$\d+/);
    expect(calls[0]!.params).toContain('pending');
  });

  it('rejects invalid consent state', async () => {
    await expect(
      listPeople({ userId: 'u-1', consentToPublish: 'nope' as any }),
    ).rejects.toThrow(/Invalid consent_to_publish/);
  });

  it('filters by relation when provided', async () => {
    pushResult({ rows: [] });
    await listPeople({ userId: 'u-1', relation: 'mother' });
    expect(calls[0]!.sql).toMatch(/relation = \$\d+/);
    expect(calls[0]!.params).toContain('mother');
  });

  it('search q hits canonical_name AND alias array via unnest', async () => {
    pushResult({ rows: [] });
    await listPeople({ userId: 'u-1', q: 'maria' });
    expect(calls[0]!.sql).toMatch(/lower\(canonical_name\) LIKE/);
    expect(calls[0]!.sql).toMatch(/unnest\(aliases\)/);
  });

  it('caps limit at 200 and defaults to 50', async () => {
    pushResult({ rows: [] });
    await listPeople({ userId: 'u-1' });
    expect(calls[0]!.params.at(-2)).toBe(50);

    queue.length = 0;
    calls.length = 0;
    errorsToThrow.length = 0;
    pushResult({ rows: [] });
    await listPeople({ userId: 'u-1', limit: 500 });
    expect(calls[0]!.params.at(-2)).toBe(200);
  });

  it('coerces rows: aliases array + consent enum + numbers', async () => {
    pushResult({
      rows: [
        personRow({
          aliases: ['Mom', 'Ma'],
          birth_year: 1942,
          death_year: 2020,
          consent_to_publish: 'granted',
        }),
      ],
    });
    const r = await listPeople({ userId: 'u-1' });
    expect(r[0]!.aliases).toEqual(['Mom', 'Ma']);
    expect(r[0]!.birthYear).toBe(1942);
    expect(r[0]!.deathYear).toBe(2020);
    expect(r[0]!.consentToPublish).toBe('granted');
  });
});

// ─── getPerson ───────────────────────────────────────────────────────────────

describe('getPerson', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getPerson('missing', 'u-1')).toBeNull();
  });

  it('filters by user_id (cross-ownership)', async () => {
    pushResult({ rows: [personRow()] });
    await getPerson('p-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0]!.params).toEqual(['p-1', 'u-1']);
  });
});

// ─── getPersonWithCounts ─────────────────────────────────────────────────────

describe('getPersonWithCounts', () => {
  it('joins COUNT from agos_autobiographer_memory_people', async () => {
    pushResult({
      rows: [{ ...personRow(), memory_count: 3 }],
    });
    const r = await getPersonWithCounts('p-1', 'u-1');
    expect(r!.memoryCount).toBe(3);
    expect(calls[0]!.sql).toMatch(/agos_autobiographer_memory_people/);
    expect(calls[0]!.sql).toMatch(/COUNT\(\*\)::int/);
  });

  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getPersonWithCounts('missing', 'u-1')).toBeNull();
  });
});

// ─── createPerson — duplicate-name handling ──────────────────────────────────

describe('createPerson', () => {
  it('inserts and refetches by default', async () => {
    pushResult({}); // insert
    pushResult({ rows: [personRow()] }); // refetch
    const r = await createPerson('u-1', { canonicalName: 'Maria Ruvalcaba' });
    expect(r.id).toBe('p-1');
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_autobiographer_people/);
  });

  it('normalizes aliases before insert', async () => {
    pushResult({});
    pushResult({ rows: [personRow()] });
    await createPerson('u-1', {
      canonicalName: 'Maria',
      aliases: ['Mom', 'mom', '  ', 'Ma'],
    });
    const insert = calls[0]!;
    // $4 is aliases array (1-based: id=1, user_id=2, canonical_name=3, aliases=4).
    expect(insert.params[3]).toEqual(['Mom', 'Ma']);
  });

  it('defaults consent_to_publish to pending', async () => {
    pushResult({});
    pushResult({ rows: [personRow()] });
    await createPerson('u-1', { canonicalName: 'Maria' });
    const insert = calls[0]!;
    expect(insert.params).toContain('pending');
  });

  it('rejects invalid consent state', async () => {
    await expect(
      createPerson('u-1', {
        canonicalName: 'Maria',
        consentToPublish: 'nope' as any,
      }),
    ).rejects.toThrow(/Invalid consent_to_publish/);
  });

  it('translates pg unique-violation (23505) into typed duplicate_name', async () => {
    const dup: any = new Error(
      'duplicate key value violates unique constraint',
    );
    dup.code = '23505';
    pushError(dup);
    await expect(
      createPerson('u-1', { canonicalName: 'Maria' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
  });

  it('rethrows non-unique-violation errors unchanged', async () => {
    const fk: any = new Error('foreign key');
    fk.code = '23503';
    pushError(fk);
    await expect(
      createPerson('u-1', { canonicalName: 'Maria' }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('throws when refetch returns no row', async () => {
    pushResult({}); // insert
    pushResult({ rows: [], rowCount: 0 }); // refetch
    await expect(
      createPerson('u-1', { canonicalName: 'Maria' }),
    ).rejects.toThrow(/Failed to create person/);
  });
});

// ─── updatePerson ────────────────────────────────────────────────────────────

describe('updatePerson', () => {
  it('issues UPDATE filtered by user_id', async () => {
    pushResult({}); // update
    pushResult({ rows: [personRow()] }); // refetch
    await updatePerson('p-1', 'u-1', { canonicalName: 'Renamed' });
    expect(calls[0]!.sql).toMatch(/UPDATE agos_autobiographer_people/);
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('rejects invalid consent state', async () => {
    await expect(
      updatePerson('p-1', 'u-1', { consentToPublish: 'nope' as any }),
    ).rejects.toThrow(/Invalid consent_to_publish/);
  });

  it('translates 23505 into duplicate_name on rename collision', async () => {
    const dup: any = new Error('uq');
    dup.code = '23505';
    pushError(dup);
    await expect(
      updatePerson('p-1', 'u-1', { canonicalName: 'CollidesWithExisting' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
  });

  it('returns null when nothing matches', async () => {
    pushResult({ rowCount: 0 }); // update
    pushResult({ rows: [], rowCount: 0 }); // refetch
    expect(
      await updatePerson('missing', 'u-1', { canonicalName: 'X' }),
    ).toBeNull();
  });
});

// ─── recordConsent ───────────────────────────────────────────────────────────

describe('recordConsent', () => {
  it('writes state + now() timestamp + recordedBy in a single UPDATE', async () => {
    pushResult({}); // update
    pushResult({ rows: [personRow({ consent_to_publish: 'granted' })] });
    const r = await recordConsent('p-1', 'u-1', 'granted', 'verbal, 2026-04-12');
    expect(r!.consentToPublish).toBe('granted');
    expect(calls[0]!.sql).toMatch(/consent_to_publish\s*=\s*\$3/);
    expect(calls[0]!.sql).toMatch(/consent_recorded_at\s*=\s*now\(\)/);
    expect(calls[0]!.sql).toMatch(/consent_recorded_by\s*=\s*\$4/);
    expect(calls[0]!.params).toEqual([
      'p-1',
      'u-1',
      'granted',
      'verbal, 2026-04-12',
    ]);
  });

  it('rejects invalid state', async () => {
    await expect(
      recordConsent('p-1', 'u-1', 'nope' as any, null),
    ).rejects.toThrow(/Invalid consent_to_publish/);
  });

  it('allows null recordedBy (default state)', async () => {
    pushResult({});
    pushResult({ rows: [personRow({ consent_to_publish: 'withheld' })] });
    await recordConsent('p-1', 'u-1', 'withheld', null);
    expect(calls[0]!.params[3]).toBeNull();
  });
});

// ─── deletePerson ────────────────────────────────────────────────────────────

describe('deletePerson', () => {
  it('issues a hard DELETE filtered by user_id', async () => {
    pushResult({ rowCount: 1 });
    expect(await deletePerson('p-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(
      /DELETE FROM agos_autobiographer_people WHERE id = \$1 AND user_id = \$2/,
    );
  });

  it('returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deletePerson('missing', 'u-1')).toBe(false);
  });
});
