/**
 * CyberSec OS — Trends payload shape regression tests.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult { rows: any[]; rowCount: number }
const queue: PgResult[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async () => queue.shift() ?? { rows: [], rowCount: 0 }),
  }),
}));

import { getCyberTrendsData } from '@/lib/agentic-os/cyber/repo';

beforeEach(() => { queue.length = 0; });

describe('getCyberTrendsData', () => {
  it('returns the full payload shape', async () => {
    // alertsByDay
    pushResult({
      rows: [
        { day: '2026-05-09', total: 10, critical: 1, high: 2 },
        { day: '2026-05-10', total: 12, critical: 0, high: 3 },
      ],
    });
    // openVulnsBySeverity
    pushResult({
      rows: [
        { severity: 'critical', count: 2 },
        { severity: 'high', count: 5 },
      ],
    });
    // mttr aggregate
    pushResult({
      rows: [{ mttr_days: 3.25, open_count: 7, closed_30d: 12 }],
    });
    // matchIocAgainstAlerts (within 7d)
    pushResult({ rows: [{
      alert_id: 'a-1', ioc_id: 'i-1', ioc_value: '1.2.3.4', ioc_kind: 'ipv4',
      occurred_at: new Date(),
    }] });
    // matchIocAgainstAlerts (within 30d)
    pushResult({ rows: [
      { alert_id: 'a-1', ioc_id: 'i-1', ioc_value: '1.2.3.4', ioc_kind: 'ipv4', occurred_at: new Date() },
      { alert_id: 'a-2', ioc_id: 'i-1', ioc_value: '1.2.3.4', ioc_kind: 'ipv4', occurred_at: new Date() },
    ] });
    // topVulnerableAssets
    pushResult({
      rows: [
        { asset_id: 'a-1', asset_name: 'web-1', open_exposures: 5 },
      ],
    });

    const out = await getCyberTrendsData({ ownerId: 'u-1' });
    expect(out.alertsByDay).toHaveLength(2);
    expect(out.alertsByDay[0]).toEqual({ date: '2026-05-09', total: 10, critical: 1, high: 2 });
    expect(out.openVulnsBySeverity).toHaveLength(2);
    expect(out.exposuresMttrDays).toBe(3.25);
    expect(out.exposuresOpen).toBe(7);
    expect(out.exposuresClosedLast30d).toBe(12);
    expect(out.iocHitsLast7d).toBe(1);
    expect(out.iocHitsLast30d).toBe(2);
    expect(out.topVulnerableAssets[0]?.openExposures).toBe(5);
  });

  it('returns null mttr when no closed exposures exist', async () => {
    pushResult({ rows: [] }); // alerts
    pushResult({ rows: [] }); // vulns
    pushResult({ rows: [{ mttr_days: null, open_count: 0, closed_30d: 0 }] });
    pushResult({ rows: [] }); // 7d hits
    pushResult({ rows: [] }); // 30d hits
    pushResult({ rows: [] }); // top assets
    const out = await getCyberTrendsData({ ownerId: 'u-1' });
    expect(out.exposuresMttrDays).toBeNull();
    expect(out.alertsByDay).toEqual([]);
  });
});
