/**
 * CyberSec OS — Alert enrichment regression tests.
 *
 * Verifies `updateAlertEnrichment` builds correct dynamic SET clauses for
 * partial patches, that `null` is preserved (clearing an FK), and that
 * cross-user access is denied at the SQL level via owner_id binding.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
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

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import { updateAlertEnrichment, getAlert } from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function alertRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'al-1',
    title: 'SSH brute force',
    description: '',
    severity: 'high',
    category: 'authentication',
    status: 'open',
    source: 'Wazuh',
    source_ip: null,
    assigned_to: null,
    notes: null,
    occurred_at: new Date('2026-05-10T00:00:00Z'),
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    asset_id: null,
    log_source_id: null,
    tactic: null,
    technique: null,
    correlation_id: null,
    tags: [],
    raw_jsonb: {},
    ...overrides,
  };
}

describe('updateAlertEnrichment', () => {
  it('links alert to asset + log source + sets tactic/technique/tags', async () => {
    pushResult({ rowCount: 1 }); // UPDATE
    pushResult({
      rows: [
        alertRow({
          asset_id: 'a-1',
          log_source_id: 's-1',
          tactic: 'TA0001',
          technique: 'T1190',
          tags: ['escalated', 'pci'],
        }),
      ],
    });
    const out = await updateAlertEnrichment({
      alertId: 'al-1',
      ownerId: 'u-1',
      patch: {
        assetId: 'a-1',
        logSourceId: 's-1',
        tactic: 'TA0001',
        technique: 'T1190',
        tags: ['escalated', 'pci'],
      },
    });
    expect(out?.assetId).toBe('a-1');
    expect(out?.logSourceId).toBe('s-1');
    expect(out?.tactic).toBe('TA0001');
    expect(out?.technique).toBe('T1190');
    expect(out?.tags).toEqual(['escalated', 'pci']);
    expect(calls[0]!.sql).toContain('UPDATE agos_cyber_alerts');
    expect(calls[0]!.sql).toMatch(/asset_id = \$3/);
    expect(calls[0]!.sql).toMatch(/log_source_id = \$4/);
    expect(calls[0]!.sql).toMatch(/tactic = \$5/);
    expect(calls[0]!.sql).toMatch(/technique = \$6/);
    expect(calls[0]!.sql).toMatch(/tags = \$7/);
  });

  it('passing assetId=null clears the FK (param is null, not undefined)', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [alertRow({ asset_id: null })] });
    const out = await updateAlertEnrichment({
      alertId: 'al-1',
      ownerId: 'u-1',
      patch: { assetId: null },
    });
    expect(out?.assetId).toBeNull();
    expect(calls[0]!.params[2]).toBeNull();
    expect(calls[0]!.sql).toMatch(/asset_id = \$3/);
  });

  it('omitting a field leaves it untouched (no SET clause emitted)', async () => {
    pushResult({ rowCount: 1 });
    pushResult({ rows: [alertRow({ asset_id: 'a-1' })] });
    await updateAlertEnrichment({
      alertId: 'al-1',
      ownerId: 'u-1',
      patch: { tactic: 'TA0007' },
    });
    expect(calls[0]!.sql).toMatch(/tactic = \$3/);
    expect(calls[0]!.sql).not.toMatch(/asset_id = /);
    expect(calls[0]!.sql).not.toMatch(/log_source_id = /);
  });

  it('empty patch short-circuits to a re-select (no UPDATE)', async () => {
    pushResult({ rows: [alertRow()] });
    await updateAlertEnrichment({
      alertId: 'al-1',
      ownerId: 'u-1',
      patch: {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('FROM agos_cyber_alerts');
    expect(calls[0]!.sql).not.toContain('UPDATE');
  });

  it('always scopes by owner_id in WHERE', async () => {
    pushResult({ rowCount: 0 }); // foreign owner — UPDATE matched 0
    pushResult({ rows: [], rowCount: 0 }); // re-select empty
    const out = await updateAlertEnrichment({
      alertId: 'al-1',
      ownerId: 'u-OTHER',
      patch: { assetId: 'a-1' },
    });
    expect(out).toBeNull();
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
    expect(calls[0]!.params[0]).toBe('al-1');
    expect(calls[0]!.params[1]).toBe('u-OTHER');
  });
});

describe('getAlert (returns enrichment fields)', () => {
  it('maps tags and raw_jsonb to camelCase / sensible defaults', async () => {
    pushResult({
      rows: [alertRow({ tags: ['pci'], raw_jsonb: { foo: 'bar' } })],
    });
    const out = await getAlert('al-1', 'u-1');
    expect(out?.tags).toEqual(['pci']);
    expect(out?.raw).toEqual({ foo: 'bar' });
  });

  it('null-coalesces tags / raw_jsonb if DB returns null', async () => {
    pushResult({
      rows: [alertRow({ tags: null, raw_jsonb: null })],
    });
    const out = await getAlert('al-1', 'u-1');
    expect(out?.tags).toEqual([]);
    expect(out?.raw).toEqual({});
  });
});
