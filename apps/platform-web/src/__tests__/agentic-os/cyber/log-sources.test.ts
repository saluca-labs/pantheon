/**
 * CyberSec OS — Log source repo regression tests.
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
  listLogSources,
  getLogSource,
  createLogSource,
  updateLogSource,
  deleteLogSource,
} from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function sourceRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 's-1',
    owner_id: 'u-1',
    name: 'Splunk — prod',
    kind: 'siem',
    vendor: 'Splunk',
    endpoint_hint: 'splunk.example.com:8089',
    status: 'active',
    notes: null,
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

describe('listLogSources', () => {
  it('owner-scopes and returns mapped rows', async () => {
    pushResult({ rows: [sourceRow()] });
    const out = await listLogSources({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('siem');
    expect(out[0]!.vendor).toBe('Splunk');
    expect(calls[0]!.sql).toContain('owner_id = $1');
    expect(calls[0]!.params).toEqual(['u-1']);
  });

  it('filters by status when provided', async () => {
    pushResult({ rows: [] });
    await listLogSources({ ownerId: 'u-1', status: 'paused' });
    expect(calls[0]!.sql).toMatch(/status = \$\d/);
    expect(calls[0]!.params).toContain('paused');
  });

  it('filters by kind when provided', async () => {
    pushResult({ rows: [] });
    await listLogSources({ ownerId: 'u-1', kind: 'edr' });
    expect(calls[0]!.sql).toMatch(/kind = \$\d/);
    expect(calls[0]!.params).toContain('edr');
  });

  it('combines kind + status filters', async () => {
    pushResult({ rows: [] });
    await listLogSources({ ownerId: 'u-1', status: 'active', kind: 'webhook' });
    expect(calls[0]!.params).toEqual(['u-1', 'active', 'webhook']);
  });
});

describe('log source CRUD', () => {
  it('createLogSource INSERTs and re-selects', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [sourceRow()] });
    const out = await createLogSource('u-1', {
      name: 'Splunk — prod',
      kind: 'siem',
      vendor: 'Splunk',
    });
    expect(out.name).toBe('Splunk — prod');
    expect(calls[0]!.sql).toContain('INSERT INTO agos_cyber_log_sources');
  });

  it('getLogSource returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getLogSource('s-1', 'u-OTHER');
    expect(out).toBeNull();
  });

  it('updateLogSource builds dynamic SET', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [sourceRow({ status: 'paused' })] });
    const out = await updateLogSource('s-1', 'u-1', { status: 'paused' });
    expect(out?.status).toBe('paused');
    expect(calls[0]!.sql).toMatch(/SET\s+status = \$3/);
  });

  it('deleteLogSource is owner-scoped', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteLogSource('s-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
    expect(calls[0]!.params).toEqual(['s-1', 'u-1']);
  });
});
