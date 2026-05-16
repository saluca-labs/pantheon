/**
 * CyberSec OS — Asset repo regression tests.
 *
 * Exercises the asset + asset-group repo against a mocked pg Pool. Same
 * harness pattern as filmmaker/repo.test.ts. The tests assert correct SQL
 * shape (table names, parameter binding, owner-scope clauses) and the
 * promised row→object mapping.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  decommissionAsset,
  deleteAsset,
  listAssetGroups,
  getAssetGroup,
  createAssetGroup,
  deleteAssetGroup,
  addAssetToGroup,
  removeAssetFromGroup,
} from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function assetRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a-1',
    owner_id: 'u-1',
    name: 'prod-web-01',
    kind: 'host',
    criticality: 'high',
    environment: 'prod',
    hostname: 'prod-web-01.example.com',
    ip_address: '10.0.0.42',
    os_family: 'linux',
    os_version: '22.04',
    owner_email: 'devops@example.com',
    tags: ['pci'],
    metadata: {},
    decommissioned_at: null,
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

// ─── listAssets ────────────────────────────────────────────────────────────

describe('listAssets', () => {
  it('scopes to owner and excludes decommissioned by default', async () => {
    pushResult({ rows: [assetRow()] });
    const out = await listAssets({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('prod-web-01');
    expect(calls[0]!.sql).toContain('owner_id = $1');
    expect(calls[0]!.sql).toContain('decommissioned_at IS NULL');
    expect(calls[0]!.params[0]).toBe('u-1');
  });

  it('includes decommissioned when includeDecommissioned=true', async () => {
    pushResult({ rows: [] });
    await listAssets({ ownerId: 'u-1', includeDecommissioned: true });
    expect(calls[0]!.sql).not.toContain('decommissioned_at IS NULL');
  });

  it('filters by kind + criticality when provided', async () => {
    pushResult({ rows: [] });
    await listAssets({ ownerId: 'u-1', kind: 'container', criticality: 'critical' });
    expect(calls[0]!.sql).toMatch(/kind = \$\d/);
    expect(calls[0]!.sql).toMatch(/criticality = \$\d/);
    expect(calls[0]!.params).toContain('container');
    expect(calls[0]!.params).toContain('critical');
  });
});

// ─── CRUD roundtrip ────────────────────────────────────────────────────────

describe('asset CRUD roundtrip', () => {
  it('createAsset INSERTs then re-selects', async () => {
    pushResult({ rowCount: 1 }); // INSERT
    pushResult({ rows: [assetRow()] }); // SELECT in getAsset
    const out = await createAsset('u-1', {
      name: 'prod-web-01',
      kind: 'host',
      criticality: 'high',
    });
    expect(out.id).toBe('a-1');
    expect(calls[0]!.sql).toContain('INSERT INTO agos_cyber_assets');
    // INSERT issues its own generated UUID as $1, owner_id as $2.
    expect(typeof calls[0]!.params[0]).toBe('string');
    expect(calls[0]!.params[1]).toBe('u-1');
    // The follow-up SELECT uses the same generated id, scoped by owner.
    expect(calls[1]!.sql).toContain('FROM agos_cyber_assets');
    expect(calls[1]!.params[0]).toBe(calls[0]!.params[0]);
    expect(calls[1]!.params[1]).toBe('u-1');
  });

  it('getAsset returns null when missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getAsset('missing', 'u-1');
    expect(out).toBeNull();
  });

  it('updateAsset builds dynamic SET clauses and re-selects', async () => {
    pushResult({ rowCount: 1 }); // UPDATE
    pushResult({ rows: [assetRow({ name: 'renamed' })] }); // SELECT
    const out = await updateAsset('a-1', 'u-1', { name: 'renamed', criticality: 'critical' });
    expect(out?.name).toBe('renamed');
    expect(calls[0]!.sql).toMatch(/SET\s+name = \$3/);
    expect(calls[0]!.sql).toMatch(/criticality = \$4/);
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
  });

  it('updateAsset short-circuits to a re-select when no fields supplied', async () => {
    pushResult({ rows: [assetRow()] });
    await updateAsset('a-1', 'u-1', {});
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('FROM agos_cyber_assets');
  });

  it('deleteAsset DELETEs scoped by owner', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteAsset('a-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toContain('DELETE FROM agos_cyber_assets');
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
  });

  it('deleteAsset returns false when row not found', async () => {
    pushResult({ rowCount: 0 });
    const ok = await deleteAsset('a-1', 'u-1');
    expect(ok).toBe(false);
  });
});

// ─── decommission ─────────────────────────────────────────────────────────

describe('decommissionAsset', () => {
  it('sets decommissioned_at via COALESCE (idempotent) and re-selects', async () => {
    pushResult({ rowCount: 1 });
    pushResult({
      rows: [assetRow({ decommissioned_at: new Date('2026-05-10T01:00:00Z') })],
    });
    const out = await decommissionAsset('a-1', 'u-1');
    expect(out?.decommissionedAt).toBe('2026-05-10T01:00:00.000Z');
    expect(calls[0]!.sql).toContain(
      'SET decommissioned_at = COALESCE(decommissioned_at, now())',
    );
  });

  it('default list excludes decommissioned (SQL check via listAssets)', async () => {
    pushResult({ rows: [] });
    await listAssets({ ownerId: 'u-1' });
    expect(calls[0]!.sql).toContain('decommissioned_at IS NULL');
  });
});

// ─── Cross-user access denied ─────────────────────────────────────────────

describe('cross-user access denied', () => {
  it('getAsset scoped by owner_id (no rows for foreign owner)', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getAsset('a-1', 'u-OTHER');
    expect(out).toBeNull();
    expect(calls[0]!.params).toEqual(['a-1', 'u-OTHER']);
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
  });

  it('updateAsset cannot touch another owner row (no SELECT rows after)', async () => {
    pushResult({ rowCount: 0 }); // UPDATE matched 0
    pushResult({ rows: [], rowCount: 0 }); // re-select finds nothing
    const out = await updateAsset('a-1', 'u-OTHER', { name: 'pwned' });
    expect(out).toBeNull();
  });

  it('deleteAsset DELETE binds the supplied owner_id', async () => {
    pushResult({ rowCount: 0 });
    await deleteAsset('a-1', 'u-OTHER');
    expect(calls[0]!.params).toEqual(['a-1', 'u-OTHER']);
  });
});

// ─── Asset groups ─────────────────────────────────────────────────────────

function groupRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'g-1',
    owner_id: 'u-1',
    name: 'prod-public-facing',
    description: null,
    tags: [],
    member_count: '0',
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

describe('asset groups', () => {
  it('listAssetGroups joins member count and is owner-scoped', async () => {
    pushResult({ rows: [groupRow({ member_count: '3' })] });
    const out = await listAssetGroups({ ownerId: 'u-1' });
    expect(out[0]!.memberCount).toBe(3);
    expect(calls[0]!.sql).toContain('agos_cyber_asset_groups');
    expect(calls[0]!.sql).toContain('agos_cyber_asset_group_members');
    expect(calls[0]!.sql).toContain('owner_id = $1');
  });

  it('getAssetGroup returns null when missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getAssetGroup('g-1', 'u-1');
    expect(out).toBeNull();
  });

  it('getAssetGroup returns group with members on hit', async () => {
    pushResult({ rows: [groupRow({ member_count: '1' })] });
    pushResult({ rows: [assetRow()] }); // members join select
    const out = await getAssetGroup('g-1', 'u-1');
    expect(out).not.toBeNull();
    expect(out!.members).toHaveLength(1);
    expect(out!.members[0]!.name).toBe('prod-web-01');
  });

  it('createAssetGroup INSERTs then re-selects', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [groupRow()] });
    const out = await createAssetGroup('u-1', { name: 'prod-public-facing' });
    expect(out.name).toBe('prod-public-facing');
    expect(calls[0]!.sql).toContain('INSERT INTO agos_cyber_asset_groups');
  });

  it('deleteAssetGroup cascades members in DB (FK ON DELETE CASCADE)', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteAssetGroup('g-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toContain('DELETE FROM agos_cyber_asset_groups');
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
  });

  it('addAssetToGroup verifies ownership of both group + asset before inserting', async () => {
    pushResult({ rows: [{ g_ok: 1, a_ok: 1 }] }); // ownership check
    pushResult({ rowCount: 1 }); // INSERT ... ON CONFLICT DO NOTHING
    const ok = await addAssetToGroup({ groupId: 'g-1', assetId: 'a-1', ownerId: 'u-1' });
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toContain('FROM agos_cyber_asset_groups');
    expect(calls[0]!.sql).toContain('FROM agos_cyber_assets');
    expect(calls[1]!.sql).toContain('INSERT INTO agos_cyber_asset_group_members');
  });

  it('addAssetToGroup rejects when group or asset is foreign', async () => {
    pushResult({ rows: [{ g_ok: null, a_ok: 1 }] });
    const ok = await addAssetToGroup({ groupId: 'g-1', assetId: 'a-1', ownerId: 'u-OTHER' });
    expect(ok).toBe(false);
    expect(calls).toHaveLength(1); // no INSERT issued
  });

  it('removeAssetFromGroup joins back to group + filters by owner', async () => {
    pushResult({ rowCount: 1 });
    const ok = await removeAssetFromGroup({ groupId: 'g-1', assetId: 'a-1', ownerId: 'u-1' });
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toContain('DELETE FROM agos_cyber_asset_group_members');
    expect(calls[0]!.sql).toContain('g.owner_id = $3');
  });
});
