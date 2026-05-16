/**
 * CyberSec OS — Exposures regression tests.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult { rows: unknown[]; rowCount: number }
const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

const mockClient = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return queue.shift() ?? { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => mockClient),
  }),
}));

import {
  listExposures,
  createExposure,
  updateExposure,
  deleteExposure,
  closeExposure,
  bulkCreateExposures,
} from '@/lib/agentic-os/cyber/repo';
import {
  isExposureClosed,
  EXPOSURE_STATUSES,
  EXPOSURE_PRIORITIES,
} from '@/lib/agentic-os/cyber/exposures';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  mockClient.query.mockClear();
});

function exposureRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e-1',
    vulnerability_id: 'v-1',
    asset_id: 'a-1',
    owner_id: 'u-1',
    status: 'open',
    detected_at: new Date('2026-05-10T00:00:00Z'),
    remediated_at: null,
    detected_by: 'trivy',
    assigned_to: null,
    priority: 'p3',
    notes: null,
    evidence_url: null,
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    vuln_title: 'HTTP/2 Rapid Reset',
    vuln_cve_id: 'CVE-2023-44487',
    vuln_severity: 'high',
    asset_name: 'web-1',
    asset_criticality: 'high',
    ...overrides,
  };
}

describe('isExposureClosed', () => {
  it('treats resolved/mitigated/false_positive as closed', () => {
    expect(isExposureClosed({ status: 'resolved' })).toBe(true);
    expect(isExposureClosed({ status: 'mitigated' })).toBe(true);
    expect(isExposureClosed({ status: 'false_positive' })).toBe(true);
    expect(isExposureClosed({ status: 'open' })).toBe(false);
    expect(isExposureClosed({ status: 'in_progress' })).toBe(false);
    expect(isExposureClosed({ status: 'accepted' })).toBe(false);
  });

  it('exposes all six statuses and five priorities', () => {
    expect(EXPOSURE_STATUSES).toHaveLength(6);
    expect(EXPOSURE_PRIORITIES).toHaveLength(5);
  });
});

describe('listExposures', () => {
  it('joins vulnerabilities + assets and orders by priority', async () => {
    pushResult({ rows: [exposureRow()] });
    const out = await listExposures({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.vulnerabilityCveId).toBe('CVE-2023-44487');
    expect(out[0]!.assetName).toBe('web-1');
    expect(calls[0]!.sql).toContain('JOIN agos_cyber_vulnerabilities');
    expect(calls[0]!.sql).toContain('JOIN agos_cyber_assets');
    expect(calls[0]!.sql).toMatch(/CASE e\.priority/);
  });

  it('filters by status + priority + assetId', async () => {
    pushResult({ rows: [] });
    await listExposures({
      ownerId: 'u-1',
      status: 'open',
      priority: 'p1',
      assetId: 'a-1',
    });
    const sql = calls[0]!.sql;
    expect(sql).toContain('e.status = $');
    expect(sql).toContain('e.priority = $');
    expect(sql).toContain('e.asset_id = $');
  });
});

describe('exposure CRUD', () => {
  it('createExposure checks vuln + asset ownership before insert', async () => {
    pushResult({ rows: [{ vuln_ok: 1, asset_ok: 1 }] }); // ownership
    pushResult({ rows: [exposureRow()] });                // insert
    const out = await createExposure('u-1', { vulnerabilityId: 'v-1', assetId: 'a-1' });
    expect(out?.id).toBe('e-1');
    expect(calls[0]!.sql).toContain('SELECT');
    expect(calls[1]!.sql).toContain('INSERT INTO agos_cyber_exposures');
  });

  it('createExposure returns null when vuln does not belong to owner', async () => {
    pushResult({ rows: [{ vuln_ok: null, asset_ok: 1 }] });
    const out = await createExposure('u-other', { vulnerabilityId: 'v-1', assetId: 'a-1' });
    expect(out).toBeNull();
    expect(calls).toHaveLength(1); // no INSERT attempted
  });

  it('updateExposure with status updates the column', async () => {
    pushResult({ rows: [exposureRow({ status: 'in_progress' })] });
    const out = await updateExposure('e-1', 'u-1', { status: 'in_progress' });
    expect(out?.status).toBe('in_progress');
  });

  it('deleteExposure binds owner_id', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteExposure('e-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.params).toEqual(['e-1', 'u-1']);
  });
});

describe('closeExposure stamps remediated_at', () => {
  it('sets remediated_at via COALESCE(remediated_at, now())', async () => {
    pushResult({ rows: [exposureRow({ status: 'resolved', remediated_at: new Date() })] });
    const out = await closeExposure({ id: 'e-1', ownerId: 'u-1', status: 'resolved' });
    expect(out?.status).toBe('resolved');
    expect(calls[0]!.sql).toContain('remediated_at = COALESCE');
    expect(calls[0]!.params[0]).toBe('resolved');
  });
});

describe('bulkCreateExposures', () => {
  it('inserts one row per asset, idempotent via ON CONFLICT DO NOTHING', async () => {
    mockClient.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      // vuln owner check
      if (/agos_cyber_vulnerabilities WHERE id = \$1 AND owner_id/.test(sql)) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      // asset owner check
      if (/agos_cyber_assets WHERE id = \$1 AND owner_id/.test(sql)) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      // INSERT
      return { rows: [], rowCount: 1 };
    });
    const out = await bulkCreateExposures({
      ownerId: 'u-1',
      vulnerabilityId: 'v-1',
      assetIds: ['a-1', 'a-2', 'a-3'],
    });
    expect(out.created).toBe(3);
    expect(out.skipped).toBe(0);
    const insertSqls = calls.filter((c) => /INSERT INTO agos_cyber_exposures/.test(c.sql));
    expect(insertSqls).toHaveLength(3);
    expect(insertSqls[0]!.sql).toContain('ON CONFLICT (vulnerability_id, asset_id) DO NOTHING');
  });
});
