/**
 * Research OS Phase 2 — notebook-entries repo regression tests.
 *
 * Exercises the repo against a mocked pg Pool to lock:
 *   - isExperimentOwnedByUser → SELECT 1 against agos_research_experiments
 *   - listNotebookEntriesForExperiment composes filters via parameterized SQL
 *     and always JOIN-guards the cross-ownership EXISTS clause
 *   - getNotebookEntry returns null on miss + hydrated row on hit
 *   - createNotebookEntry uses ::text[] / ::jsonb / ::timestamptz casts and
 *     INSERTs the documented column set
 *   - updateNotebookEntry COALESCEs untouched fields + JOIN-guards
 *   - archiveNotebookEntry sets archived_at = now()
 *   - restoreNotebookEntry returns { alreadyActive: true } for non-archived
 *   - restoreNotebookEntry clears archived_at when archived
 *
 * Pattern mirrors `repo-experiments.test.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
  getCurrentResearchUser: vi.fn(),
}));

import {
  isExperimentOwnedByUser,
  listNotebookEntriesForExperiment,
  getNotebookEntry,
  createNotebookEntry,
  updateNotebookEntry,
  archiveNotebookEntry,
  restoreNotebookEntry,
} from '@/lib/agentic-os/research/notebook-entries-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function entryRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'ne-1',
    user_id: 'u-1',
    experiment_id: 'exp-1',
    entry_kind: 'note',
    title: 'Test entry',
    body_md: 'body here',
    attached_urls: [],
    tags: [],
    entry_at: new Date('2026-05-12T10:00:00Z'),
    archived_at: null,
    metadata: {},
    created_at: new Date('2026-05-12T10:00:00Z'),
    updated_at: new Date('2026-05-12T10:00:00Z'),
    ...overrides,
  };
}

describe('isExperimentOwnedByUser()', () => {
  it('returns true when the SELECT 1 finds a row', async () => {
    pushResult({ rows: [{ '?column?': 1 }] });
    expect(await isExperimentOwnedByUser('exp-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/FROM agos_research_experiments/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(calls[0].params).toEqual(['exp-1', 'u-1']);
  });

  it('returns false when no row found', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await isExperimentOwnedByUser('exp-1', 'u-1')).toBe(false);
  });
});

describe('listNotebookEntriesForExperiment()', () => {
  it('selects with cross-ownership EXISTS clause', async () => {
    pushResult({ rows: [entryRow()] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_notebook_entries n/);
    expect(calls[0].sql).toMatch(
      /EXISTS \(\s*SELECT 1 FROM agos_research_experiments e[\s\S]*?e\.id = n\.experiment_id AND e\.user_id = \$2/,
    );
    expect(calls[0].sql).toMatch(/n\.experiment_id = \$1/);
  });

  it('orders by entry_at DESC, then created_at DESC', async () => {
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1');
    expect(calls[0].sql).toMatch(/ORDER BY n\.entry_at DESC, n\.created_at DESC/);
  });

  it('hides archived rows by default', async () => {
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1');
    expect(calls[0].sql).toMatch(/n\.archived_at IS NULL/);
    expect(calls[0].sql).not.toMatch(/n\.archived_at IS NOT NULL/);
  });

  it('surfaces archived rows when archived=true', async () => {
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1', { archived: true });
    expect(calls[0].sql).toMatch(/n\.archived_at IS NOT NULL/);
  });

  it('filters by entry_kind when supplied', async () => {
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1', { entryKind: 'todo' });
    expect(calls[0].params).toContain('todo');
    expect(calls[0].sql).toMatch(/n\.entry_kind = \$/);
  });

  it('throws on unknown entryKind filter', async () => {
    await expect(
      listNotebookEntriesForExperiment('exp-1', 'u-1', { entryKind: 'bad' as any }),
    ).rejects.toThrow(/Invalid entry_kind/);
  });

  it('applies tag filter case-insensitively with ANY()', async () => {
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1', { tag: 'ENZYME' });
    expect(calls[0].params).toContain('enzyme');
    expect(calls[0].sql).toMatch(/= ANY\(n\.tags\)/);
  });

  it('clamps limit to the 1..500 range', async () => {
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1', { limit: 9999 });
    expect(calls[0].params).toContain(500);
    queue.length = 0;
    calls.length = 0;
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1', { limit: -5 });
    expect(calls[0].params).toContain(1);
  });

  it('honors offset, defaulting to 0', async () => {
    pushResult({ rows: [] });
    await listNotebookEntriesForExperiment('exp-1', 'u-1', { offset: 17 });
    expect(calls[0].params).toContain(17);
  });

  it('hydrates row.entry_kind back to typed value', async () => {
    pushResult({ rows: [entryRow({ entry_kind: 'todo' })] });
    const out = await listNotebookEntriesForExperiment('exp-1', 'u-1');
    expect(out[0].entryKind).toBe('todo');
  });

  it('falls back to "note" if DB returns an unknown entry_kind (defensive)', async () => {
    pushResult({ rows: [entryRow({ entry_kind: 'WEIRD' })] });
    const out = await listNotebookEntriesForExperiment('exp-1', 'u-1');
    expect(out[0].entryKind).toBe('note');
  });

  it('hydrates tags + attached_urls as arrays (even on null DB row)', async () => {
    pushResult({ rows: [entryRow({ tags: null, attached_urls: null })] });
    const out = await listNotebookEntriesForExperiment('exp-1', 'u-1');
    expect(out[0].tags).toEqual([]);
    expect(out[0].attachedUrls).toEqual([]);
  });
});

describe('getNotebookEntry()', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getNotebookEntry('ne-1', 'u-1')).toBeNull();
  });

  it('returns the hydrated row on hit', async () => {
    pushResult({ rows: [entryRow({ title: 'Found' })] });
    const out = await getNotebookEntry('ne-1', 'u-1');
    expect(out?.title).toBe('Found');
  });

  it('JOIN-guards via EXISTS against agos_research_experiments', async () => {
    pushResult({ rows: [] });
    await getNotebookEntry('ne-1', 'u-1');
    expect(calls[0].sql).toMatch(
      /EXISTS \(\s*SELECT 1 FROM agos_research_experiments e[\s\S]*?e\.id = n\.experiment_id AND e\.user_id = \$2/,
    );
  });
});

describe('createNotebookEntry()', () => {
  it('INSERTs into agos_research_notebook_entries with full param list', async () => {
    pushResult({}); // INSERT
    pushResult({ rows: [entryRow()] }); // re-fetch
    await createNotebookEntry('exp-1', 'u-1', { title: 'Hello', bodyMd: 'world' });
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_notebook_entries/);
    expect(calls[0].params[2]).toBe('exp-1'); // experiment_id
    expect(calls[0].params[1]).toBe('u-1'); // user_id
  });

  it('serializes metadata as JSONB string', async () => {
    pushResult({});
    pushResult({ rows: [entryRow()] });
    await createNotebookEntry('exp-1', 'u-1', {
      title: 'M',
      metadata: { sample: 'A' },
    });
    const metaParam = calls[0].params[9];
    expect(typeof metaParam).toBe('string');
    expect(JSON.parse(metaParam)).toEqual({ sample: 'A' });
  });

  it('passes attached_urls + tags as raw arrays (cast to text[] in SQL)', async () => {
    pushResult({});
    pushResult({ rows: [entryRow()] });
    await createNotebookEntry('exp-1', 'u-1', {
      title: 'T',
      attachedUrls: ['https://a'],
      tags: ['x'],
    });
    expect(calls[0].sql).toMatch(/\$7::text\[\]/);
    expect(calls[0].sql).toMatch(/\$8::text\[\]/);
    expect(calls[0].params[6]).toEqual(['https://a']);
    expect(calls[0].params[7]).toEqual(['x']);
  });

  it('uses COALESCE($9::timestamptz, now()) for entry_at default', async () => {
    pushResult({});
    pushResult({ rows: [entryRow()] });
    await createNotebookEntry('exp-1', 'u-1', { title: 'T' });
    expect(calls[0].sql).toMatch(/COALESCE\(\$9::timestamptz, now\(\)\)/);
    expect(calls[0].params[8]).toBeNull();
  });

  it('passes through a supplied entry_at (backfill case)', async () => {
    pushResult({});
    pushResult({ rows: [entryRow()] });
    await createNotebookEntry('exp-1', 'u-1', {
      title: 'T',
      entryAt: '2026-01-01T00:00:00.000Z',
    });
    expect(calls[0].params[8]).toBe('2026-01-01T00:00:00.000Z');
  });

  it('defaults entry_kind to "note"', async () => {
    pushResult({});
    pushResult({ rows: [entryRow()] });
    await createNotebookEntry('exp-1', 'u-1', { title: 'T' });
    expect(calls[0].params[3]).toBe('note');
  });

  it('honors a supplied entry_kind', async () => {
    pushResult({});
    pushResult({ rows: [entryRow({ entry_kind: 'todo' })] });
    await createNotebookEntry('exp-1', 'u-1', { title: 'T', entryKind: 'todo' });
    expect(calls[0].params[3]).toBe('todo');
  });

  it('throws on invalid entry_kind before issuing SQL', async () => {
    await expect(
      createNotebookEntry('exp-1', 'u-1', {
        title: 'T',
        entryKind: 'bogus' as any,
      }),
    ).rejects.toThrow(/Invalid entry_kind/);
    expect(calls.length).toBe(0);
  });
});

describe('updateNotebookEntry()', () => {
  it('COALESCEs every patchable field', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'ne-1' }] });
    pushResult({ rows: [entryRow({ title: 'X' })] });
    await updateNotebookEntry('ne-1', 'u-1', { title: 'X' });
    expect(calls[0].sql).toMatch(/title\s+= COALESCE\(\$4, title\)/);
    expect(calls[0].sql).toMatch(/entry_kind\s+= COALESCE\(\$3, entry_kind\)/);
    expect(calls[0].sql).toMatch(/body_md\s+= COALESCE\(\$5, body_md\)/);
    expect(calls[0].sql).toMatch(/attached_urls = COALESCE\(\$6::text\[\], attached_urls\)/);
    expect(calls[0].sql).toMatch(/tags\s+= COALESCE\(\$7::text\[\], tags\)/);
    expect(calls[0].sql).toMatch(/entry_at\s+= COALESCE\(\$8::timestamptz, entry_at\)/);
    expect(calls[0].sql).toMatch(/metadata\s+= COALESCE\(\$9::jsonb, metadata\)/);
  });

  it('JOIN-guards the UPDATE', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'ne-1' }] });
    pushResult({ rows: [entryRow()] });
    await updateNotebookEntry('ne-1', 'u-1', { title: 'X' });
    expect(calls[0].sql).toMatch(
      /WHERE n\.id = \$1[\s\S]*?EXISTS \(\s*SELECT 1 FROM agos_research_experiments e[\s\S]*?e\.id = n\.experiment_id AND e\.user_id = \$2/,
    );
  });

  it('returns null when UPDATE rowCount = 0 (cross-tenant probe)', async () => {
    pushResult({ rowCount: 0, rows: [] });
    const out = await updateNotebookEntry('ne-1', 'u-1', { title: 'X' });
    expect(out).toBeNull();
  });

  it('writes updated_at = now() on every update', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'ne-1' }] });
    pushResult({ rows: [entryRow()] });
    await updateNotebookEntry('ne-1', 'u-1', { title: 'X' });
    expect(calls[0].sql).toMatch(/updated_at\s+= now\(\)/);
  });

  it('passes patchable values through as raw / null per shape', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'ne-1' }] });
    pushResult({ rows: [entryRow()] });
    await updateNotebookEntry('ne-1', 'u-1', {
      tags: ['enzyme'],
      attachedUrls: ['https://a'],
      metadata: { x: 1 },
      entryAt: '2026-01-01T00:00:00.000Z',
    });
    // params layout: [id, userId, entryKind, title, bodyMd, attachedUrls,
    //                 tags, entryAt, metadata]
    expect(calls[0].params[2]).toBeNull(); // entry_kind unset
    expect(calls[0].params[3]).toBeNull(); // title unset
    expect(calls[0].params[4]).toBeNull(); // body_md unset
    expect(calls[0].params[5]).toEqual(['https://a']); // attached_urls
    expect(calls[0].params[6]).toEqual(['enzyme']); // tags
    expect(calls[0].params[7]).toBe('2026-01-01T00:00:00.000Z'); // entry_at
    expect(JSON.parse(calls[0].params[8])).toEqual({ x: 1 });
  });

  it('throws on invalid entry_kind in patch', async () => {
    await expect(
      updateNotebookEntry('ne-1', 'u-1', { entryKind: 'bad' as any }),
    ).rejects.toThrow(/Invalid entry_kind/);
    expect(calls.length).toBe(0);
  });
});

describe('archiveNotebookEntry()', () => {
  it('sets archived_at = now() with JOIN-guard', async () => {
    pushResult({}); // UPDATE
    pushResult({ rows: [entryRow({ archived_at: new Date('2026-05-12T11:00:00Z') })] });
    const out = await archiveNotebookEntry('ne-1', 'u-1');
    expect(calls[0].sql).toMatch(/SET archived_at = now\(\)/);
    expect(calls[0].sql).toMatch(/WHERE n\.id = \$1/);
    expect(calls[0].sql).toMatch(/n\.archived_at IS NULL/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments/);
    expect(out?.archivedAt).toBeTruthy();
  });

  it('does not error when entry is already archived (no-op + re-fetch)', async () => {
    pushResult({}); // UPDATE (no-op via archived_at IS NULL guard)
    pushResult({ rows: [entryRow({ archived_at: new Date('2026-05-12T11:00:00Z') })] });
    const out = await archiveNotebookEntry('ne-1', 'u-1');
    expect(out?.archivedAt).toBeTruthy();
  });
});

describe('restoreNotebookEntry()', () => {
  it('returns null when entry not found / not owned', async () => {
    pushResult({ rows: [], rowCount: 0 }); // pre-fetch miss
    const out = await restoreNotebookEntry('ne-1', 'u-1');
    expect(out).toBeNull();
  });

  it('returns alreadyActive: true when entry is not archived', async () => {
    pushResult({ rows: [entryRow({ archived_at: null })] }); // pre-fetch
    const out = await restoreNotebookEntry('ne-1', 'u-1');
    expect(out).toEqual(expect.objectContaining({ alreadyActive: true }));
    expect(calls.length).toBe(1); // no UPDATE issued
  });

  it('clears archived_at when entry is archived', async () => {
    pushResult({
      rows: [entryRow({ archived_at: new Date('2026-05-12T11:00:00Z') })],
    }); // pre-fetch (archived)
    pushResult({}); // UPDATE
    pushResult({ rows: [entryRow({ archived_at: null })] }); // re-fetch
    const out = await restoreNotebookEntry('ne-1', 'u-1');
    expect(out && 'alreadyActive' in out && out.alreadyActive).toBe(false);
    expect(calls[1].sql).toMatch(/SET archived_at = NULL/);
    expect(calls[1].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments/);
  });
});
