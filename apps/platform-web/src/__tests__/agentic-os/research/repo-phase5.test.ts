/**
 * Research OS Phase 5 — repo regression tests.
 *
 * Exercises Phase 5 repos against a mocked pg Pool:
 *   - SQL shape (table name + ownership EXISTS scoping)
 *   - JSONB / text[] serialization
 *   - Cross-ownership: cross-user lookups return null
 *   - Datasets: list filter SQL, create/update/delete shape, count
 *   - Protocols: list (rootsOnly default), tree walker via recursive
 *     CTE, version bump normalizes parent to root (chain stays flat)
 *   - Experiment-protocols: pin defaults to current version when
 *     pinned_version omitted; 23505 → duplicate; notes-only PATCH
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

type QueueItem = PgResult | { __throw: unknown };

const queue: QueueItem[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

function pushThrow(err: unknown): void {
  queue.push({ __throw: err });
}

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const next = queue.shift();
      if (next && '__throw' in next) throw next.__throw;
      return next ?? { rows: [], rowCount: 0 };
    }),
  }),
  getCurrentResearchUser: vi.fn(),
}));

import {
  isExperimentOwnedByUser as datasetIsExpOwned,
  listDatasetsForExperiment,
  getDataset,
  createDataset,
  updateDataset,
  deleteDataset,
  countDatasetsForExperiment,
} from '@/lib/agentic-os/research/datasets-repo';
import {
  isProtocolOwnedByUser,
  listProtocols,
  getProtocol,
  getProtocolTree,
  createProtocol,
  bumpProtocolVersion,
  updateProtocol,
  deleteProtocol,
} from '@/lib/agentic-os/research/protocols-repo';
import {
  isExperimentOwnedByUser as expProtoIsExpOwned,
  isProtocolOwnedByUser as expProtoIsProtoOwned,
  listProtocolsForExperiment,
  getExperimentProtocolLink,
  pinProtocolToExperiment,
  updateExperimentProtocolNotes,
  unpinProtocolFromExperiment,
} from '@/lib/agentic-os/research/experiment-protocols-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function datasetRow(o: Record<string, unknown> = {}) {
  return {
    id: 'd-1',
    user_id: 'u-1',
    experiment_id: 'e-1',
    name: 'Sample',
    kind: 'tabular',
    url: 'https://example.com/dataset.csv',
    version: '1.0',
    size_bytes: 1024,
    checksum: 'sha256:abc',
    archived: false,
    published_doi: null,
    notes_md: null,
    tags: ['rna'],
    metadata: {},
    created_at: new Date('2026-05-12T00:00:00Z'),
    updated_at: new Date('2026-05-12T00:00:00Z'),
    ...o,
  };
}

function protocolRow(o: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    user_id: 'u-1',
    title: 'Method X',
    version: '1.0',
    body_md: '## step 1',
    kind: 'method',
    attached_urls: [],
    tags: ['flow'],
    parent_protocol_id: null,
    metadata: {},
    created_at: new Date('2026-05-12T00:00:00Z'),
    updated_at: new Date('2026-05-12T00:00:00Z'),
    ...o,
  };
}

// ─── datasets-repo ────────────────────────────────────────────────────────

describe('datasets-repo: list', () => {
  it('issues a SELECT scoped by experiment_id + ownership EXISTS', async () => {
    pushResult({ rows: [datasetRow()] });
    const rows = await listDatasetsForExperiment('e-1', 'u-1');
    expect(rows).toHaveLength(1);
    expect(calls[0].sql).toMatch(/FROM agos_research_datasets d/);
    expect(calls[0].sql).toMatch(
      /EXISTS \(\s*SELECT 1 FROM agos_research_experiments e\s+WHERE e\.id = d\.experiment_id AND e\.user_id = \$2/,
    );
    expect(calls[0].params).toEqual(['e-1', 'u-1', 200, 0]);
  });

  it('appends kind filter when supplied', async () => {
    pushResult({ rows: [] });
    await listDatasetsForExperiment('e-1', 'u-1', { kind: 'image' });
    expect(calls[0].sql).toMatch(/d\.kind = \$3/);
    expect(calls[0].params[2]).toBe('image');
  });

  it('appends archived filter when supplied', async () => {
    pushResult({ rows: [] });
    await listDatasetsForExperiment('e-1', 'u-1', { archived: true });
    expect(calls[0].sql).toMatch(/d\.archived = \$3/);
    expect(calls[0].params[2]).toBe(true);
  });

  it('throws on invalid kind BEFORE issuing SQL', async () => {
    await expect(
      listDatasetsForExperiment('e-1', 'u-1', { kind: 'xxx' as never }),
    ).rejects.toThrow(/Invalid dataset kind/);
    expect(calls).toHaveLength(0);
  });
});

describe('datasets-repo: get / create / update / delete', () => {
  it('get returns null on cross-user (no row)', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const row = await getDataset('d-1', 'u-other');
    expect(row).toBeNull();
  });

  it('create inserts then re-reads', async () => {
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({ rows: [datasetRow()] }); // re-read
    const out = await createDataset('e-1', 'u-1', {
      name: 'Sample',
      url: 'https://example.com',
      kind: 'tabular',
    });
    expect(out.id).toBe('d-1');
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_datasets/);
  });

  it('create throws on invalid kind BEFORE issuing SQL', async () => {
    await expect(
      createDataset('e-1', 'u-1', { name: 'X', url: 'https://x', kind: 'xxx' as never }),
    ).rejects.toThrow(/Invalid dataset kind/);
    expect(calls).toHaveLength(0);
  });

  it('update routes archived flip + re-reads via existing get', async () => {
    pushResult({ rows: [{ id: 'd-1' }], rowCount: 1 }); // UPDATE RETURNING
    pushResult({ rows: [datasetRow({ archived: true })] }); // get
    const out = await updateDataset('d-1', 'u-1', { archived: true });
    expect(out?.archived).toBe(true);
    expect(calls[0].sql).toMatch(/UPDATE agos_research_datasets d/);
    expect(calls[0].sql).toMatch(/archived = \$3/);
  });

  it('update with empty patch returns existing row without UPDATE', async () => {
    pushResult({ rows: [datasetRow()] }); // get only
    const out = await updateDataset('d-1', 'u-1', {});
    expect(out?.id).toBe('d-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/SELECT/);
  });

  it('delete returns false when no row matched', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await deleteDataset('d-1', 'u-1')).toBe(false);
  });

  it('delete returns true on row removal', async () => {
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteDataset('d-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_datasets/);
  });

  it('count returns integer', async () => {
    pushResult({ rows: [{ n: 5 }] });
    expect(await countDatasetsForExperiment('e-1', 'u-1')).toBe(5);
  });
});

// ─── protocols-repo ───────────────────────────────────────────────────────

describe('protocols-repo: list / get / tree', () => {
  it('list filters to root rows by default (parent_protocol_id IS NULL)', async () => {
    pushResult({ rows: [protocolRow()] });
    await listProtocols('u-1');
    expect(calls[0].sql).toMatch(/p\.parent_protocol_id IS NULL/);
    expect(calls[0].params).toEqual(['u-1', 200, 0]);
  });

  it('list with rootsOnly=false does NOT add the parent IS NULL clause', async () => {
    pushResult({ rows: [] });
    await listProtocols('u-1', { rootsOnly: false });
    expect(calls[0].sql).not.toMatch(/p\.parent_protocol_id IS NULL/);
  });

  it('list with q wraps in ILIKE wildcards', async () => {
    pushResult({ rows: [] });
    await listProtocols('u-1', { q: 'flow' });
    expect(calls[0].sql).toMatch(/p\.title ILIKE \$/);
    expect(calls[0].params).toContain('%flow%');
  });

  it('isProtocolOwnedByUser issues a scoped probe', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    expect(await isProtocolOwnedByUser('p-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('get returns null on cross-user', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getProtocol('p-1', 'u-other')).toBeNull();
  });

  it('tree uses a recursive CTE', async () => {
    pushResult({ rows: [protocolRow()] });
    await getProtocolTree('p-1', 'u-1');
    expect(calls[0].sql).toMatch(/WITH RECURSIVE ancestors AS/);
  });
});

describe('protocols-repo: create / bump / update / delete', () => {
  it('create inserts then re-reads', async () => {
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({ rows: [protocolRow()] }); // get
    const p = await createProtocol('u-1', { title: 'Method X' });
    expect(p.id).toBe('p-1');
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_protocols/);
  });

  it('create defaults version to 1.0 + kind to method', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [protocolRow()] });
    await createProtocol('u-1', { title: 'Plain' });
    // params: [id, userId, title, version, bodyMd, kind, attachedUrls, tags, parent, metadata]
    expect(calls[0].params[3]).toBe('1.0');
    expect(calls[0].params[5]).toBe('method');
    expect(calls[0].params[8]).toBeNull();
  });

  it('bump returns null when source missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await bumpProtocolVersion('missing', 'u-1', {
      version: '2.0',
      bodyMd: 'new',
    });
    expect(out).toBeNull();
  });

  it('bump from root anchors new row to root (parent_protocol_id = root.id)', async () => {
    pushResult({ rows: [protocolRow({ id: 'root', parent_protocol_id: null })] }); // get source
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({
      rows: [protocolRow({ id: 'new', version: '2.0', parent_protocol_id: 'root' })],
    }); // get new
    const out = await bumpProtocolVersion('root', 'u-1', {
      version: '2.0',
      bodyMd: 'new',
    });
    expect(out?.id).toBe('new');
    // The 2nd call is the INSERT — params include the new row's parent (root).
    const insertCall = calls[1];
    expect(insertCall.sql).toMatch(/INSERT INTO agos_research_protocols/);
    expect(insertCall.params[8]).toBe('root');
  });

  it('bump from a child re-anchors to the existing root (chain stays flat)', async () => {
    pushResult({
      rows: [protocolRow({ id: 'child', parent_protocol_id: 'root' })],
    });
    pushResult({ rows: [], rowCount: 1 });
    pushResult({
      rows: [protocolRow({ id: 'grand', parent_protocol_id: 'root' })],
    });
    const out = await bumpProtocolVersion('child', 'u-1', {
      version: '3.0',
      bodyMd: 'newer',
    });
    expect(out?.parentProtocolId).toBe('root');
    expect(calls[1].params[8]).toBe('root');
  });

  it('update with empty patch returns existing row without UPDATE', async () => {
    pushResult({ rows: [protocolRow()] });
    const out = await updateProtocol('p-1', 'u-1', {});
    expect(out?.id).toBe('p-1');
    expect(calls).toHaveLength(1);
  });

  it('update fires UPDATE then re-read', async () => {
    pushResult({ rows: [{ id: 'p-1' }], rowCount: 1 });
    pushResult({ rows: [protocolRow({ title: 'New title' })] });
    const out = await updateProtocol('p-1', 'u-1', { title: 'New title' });
    expect(out?.title).toBe('New title');
    expect(calls[0].sql).toMatch(/UPDATE agos_research_protocols/);
  });

  it('delete returns true on row removal', async () => {
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteProtocol('p-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_protocols/);
  });
});

// ─── experiment-protocols-repo ────────────────────────────────────────────

describe('experiment-protocols-repo: pin / list / patch / unpin', () => {
  it('pin defaults pinned_version to the protocol current version when omitted', async () => {
    pushResult({ rows: [protocolRow({ version: '7.7' })] }); // getProtocol
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({
      rows: [
        {
          id: 'l-1',
          experiment_id: 'e-1',
          protocol_id: 'p-1',
          pinned_version: '7.7',
          notes: null,
          created_at: new Date('2026-05-12T00:00:00Z'),
        },
      ],
    }); // getById
    const outcome = await pinProtocolToExperiment('e-1', 'u-1', { protocolId: 'p-1' });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.link.pinnedVersion).toBe('7.7');
    }
  });

  it('pin uses supplied pinned_version when present (does not fetch protocol)', async () => {
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({
      rows: [
        {
          id: 'l-2',
          experiment_id: 'e-1',
          protocol_id: 'p-1',
          pinned_version: 'frozen',
          notes: null,
          created_at: new Date('2026-05-12T00:00:00Z'),
        },
      ],
    });
    const outcome = await pinProtocolToExperiment('e-1', 'u-1', {
      protocolId: 'p-1',
      pinnedVersion: 'frozen',
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.link.pinnedVersion).toBe('frozen');
    }
    // No getProtocol probe issued — first call is the INSERT.
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_experiment_protocols/);
  });

  it('pin returns duplicate on SQLSTATE 23505', async () => {
    const err = new Error('duplicate') as Error & { code?: string; constraint?: string };
    err.code = '23505';
    pushThrow(err);
    const outcome = await pinProtocolToExperiment('e-1', 'u-1', {
      protocolId: 'p-1',
      pinnedVersion: '1.0',
    });
    expect(outcome.kind).toBe('duplicate');
  });

  it('isExperimentOwnedByUser uses the canonical probe', async () => {
    pushResult({ rows: [{ x: 1 }], rowCount: 1 });
    expect(await expProtoIsExpOwned('e-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/agos_research_experiments/);
  });

  it('isProtocolOwnedByUser uses the canonical probe', async () => {
    pushResult({ rows: [{ x: 1 }], rowCount: 1 });
    expect(await expProtoIsProtoOwned('p-1', 'u-1')).toBe(true);
  });

  it('updateNotes patches notes only', async () => {
    pushResult({ rows: [{ id: 'l-1' }], rowCount: 1 });
    pushResult({
      rows: [
        {
          id: 'l-1',
          experiment_id: 'e-1',
          protocol_id: 'p-1',
          pinned_version: '1.0',
          notes: 'new note',
          created_at: new Date('2026-05-12T00:00:00Z'),
        },
      ],
    });
    const out = await updateExperimentProtocolNotes('e-1', 'p-1', 'u-1', {
      notes: 'new note',
    });
    expect(out?.notes).toBe('new note');
    expect(calls[0].sql).toMatch(/SET notes = \$4/);
  });

  it('unpin returns row count', async () => {
    pushResult({ rows: [], rowCount: 2 });
    expect(await unpinProtocolFromExperiment('e-1', 'p-1', 'u-1')).toBe(2);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_experiment_protocols/);
  });
});
