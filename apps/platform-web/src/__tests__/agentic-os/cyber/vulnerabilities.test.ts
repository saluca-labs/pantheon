/**
 * CyberSec OS — Vulnerabilities + importer regression tests.
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

const mockClient = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    return queue.shift() ?? { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => mockClient),
  }),
}));

import {
  listVulnerabilities,
  getVulnerability,
  createVulnerability,
  updateVulnerability,
  deleteVulnerability,
  bulkUpsertVulnerabilities,
} from '@/lib/agentic-os/cyber/repo';
import {
  cvssToSeverity,
  VULNERABILITY_SEVERITIES,
} from '@/lib/agentic-os/cyber/vulnerabilities';
import {
  parseTrivyReport,
  parseOpenvasReport,
} from '@/lib/agentic-os/cyber/vuln-importer';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  mockClient.query.mockClear();
});

function vulnRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'v-1',
    owner_id: 'u-1',
    cve_id: 'CVE-2023-44487',
    title: 'HTTP/2 Rapid Reset',
    description: 'desc',
    severity: 'high',
    cvss_score: 7.5,
    cvss_vector: null,
    cwe_id: null,
    vendor: null,
    product: null,
    affected_versions: [],
    fixed_versions: [],
    published_at: null,
    references: [],
    tags: [],
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

describe('cvssToSeverity', () => {
  it('maps the qualitative bands', () => {
    expect(cvssToSeverity(9.8)).toBe('critical');
    expect(cvssToSeverity(9.0)).toBe('critical');
    expect(cvssToSeverity(8.9)).toBe('high');
    expect(cvssToSeverity(7.0)).toBe('high');
    expect(cvssToSeverity(6.9)).toBe('medium');
    expect(cvssToSeverity(4.0)).toBe('medium');
    expect(cvssToSeverity(3.9)).toBe('low');
    expect(cvssToSeverity(0.1)).toBe('low');
    expect(cvssToSeverity(0)).toBe('info');
  });
});

describe('VULNERABILITY_SEVERITIES', () => {
  it('exposes all five buckets in order', () => {
    expect(VULNERABILITY_SEVERITIES.map((s) => s.value)).toEqual([
      'critical', 'high', 'medium', 'low', 'info',
    ]);
  });
});

describe('listVulnerabilities', () => {
  it('scopes by owner and orders critical first', async () => {
    pushResult({ rows: [vulnRow({ severity: 'critical' })] });
    const out = await listVulnerabilities({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('critical');
    expect(calls[0]!.sql).toContain('owner_id = $1');
    expect(calls[0]!.sql).toMatch(/CASE severity\s+WHEN 'critical'/);
  });

  it('filters by severity + q', async () => {
    pushResult({ rows: [] });
    await listVulnerabilities({ ownerId: 'u-1', severity: 'high', q: 'rapid' });
    expect(calls[0]!.sql).toMatch(/severity = \$\d/);
    expect(calls[0]!.sql).toMatch(/title ILIKE/);
    expect(calls[0]!.params).toContain('high');
    expect(calls[0]!.params).toContain('%rapid%');
  });
});

describe('vulnerability CRUD', () => {
  it('createVulnerability INSERTs and returns the row', async () => {
    pushResult({ rows: [vulnRow()] });
    const out = await createVulnerability('u-1', { title: 'x', cveId: 'CVE-2023-44487' });
    expect(out.id).toBe('v-1');
    expect(calls[0]!.sql).toContain('INSERT INTO agos_cyber_vulnerabilities');
  });

  it('getVulnerability binds owner_id', async () => {
    pushResult({ rows: [vulnRow()] });
    const out = await getVulnerability('v-1', 'u-1');
    expect(out?.id).toBe('v-1');
    expect(calls[0]!.params).toEqual(['v-1', 'u-1']);
  });

  it('updateVulnerability with severity sets the column', async () => {
    pushResult({ rows: [vulnRow({ severity: 'critical' })] });
    const out = await updateVulnerability('v-1', 'u-1', { severity: 'critical' });
    expect(out?.severity).toBe('critical');
    expect(calls[0]!.sql).toContain('UPDATE agos_cyber_vulnerabilities');
    expect(calls[0]!.sql).toContain('severity = $');
  });

  it('updateVulnerability returns null when row missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await updateVulnerability('v-x', 'u-other', { severity: 'low' });
    expect(out).toBeNull();
  });

  it('deleteVulnerability binds owner_id', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteVulnerability('v-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.params).toEqual(['v-1', 'u-1']);
  });
});

describe('bulkUpsertVulnerabilities dedup by cve_id', () => {
  it('updates existing rows with same cve_id, inserts new ones', async () => {
    mockClient.query.mockImplementation(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // begin
      if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
      // existing-id lookup for first vuln (cve match)
      if (/SELECT id FROM agos_cyber_vulnerabilities WHERE owner_id/.test(sql)
          && params[1] === 'CVE-2023-1') {
        return { rows: [{ id: 'existing-1' }], rowCount: 1 };
      }
      // existing-id lookup for second vuln (no match)
      if (/SELECT id FROM agos_cyber_vulnerabilities WHERE owner_id/.test(sql)
          && params[1] === 'CVE-2023-2') {
        return { rows: [], rowCount: 0 };
      }
      // UPDATE / INSERT / COMMIT — all return empty
      return { rows: [], rowCount: 1 };
    });

    const out = await bulkUpsertVulnerabilities({
      ownerId: 'u-1',
      vulnerabilities: [
        { cveId: 'CVE-2023-1', title: 'one' },
        { cveId: 'CVE-2023-2', title: 'two' },
      ],
    });
    expect(out.updated).toBe(1);
    expect(out.inserted).toBe(1);
    const sqls = calls.map((c) => c.sql).join('\n');
    expect(sqls).toContain('BEGIN');
    expect(sqls).toContain('COMMIT');
    expect(sqls).toContain('UPDATE agos_cyber_vulnerabilities');
    expect(sqls).toContain('INSERT INTO agos_cyber_vulnerabilities');
  });
});

describe('parseTrivyReport', () => {
  it('parses a minimal Trivy report into VulnerabilityUpserts', () => {
    const report = {
      Results: [
        {
          Target: 'app:1.0',
          Type: 'ubuntu',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2023-44487',
              PkgName: 'nginx',
              InstalledVersion: '1.18',
              FixedVersion: '1.18.0-6ubuntu14.4',
              Severity: 'HIGH',
              Title: 'HTTP/2 Rapid Reset',
              Description: 'Heap-based buffer overflow',
              References: ['https://example/advisory'],
              CweIDs: ['CWE-400'],
              CVSS: { nvd: { V3Score: 7.5, V3Vector: 'CVSS:3.1/AV:N/AC:L/PR:N' } },
            },
          ],
        },
      ],
    };
    const out = parseTrivyReport(report);
    expect(out.errors).toHaveLength(0);
    expect(out.vulnerabilities).toHaveLength(1);
    const v = out.vulnerabilities[0]!;
    expect(v.cveId).toBe('CVE-2023-44487');
    expect(v.severity).toBe('high');
    expect(v.cvssScore).toBe(7.5);
    expect(v.cweId).toBe('CWE-400');
    expect(v.product).toBe('nginx');
  });

  it('does not crash on malformed input — returns an errors row', () => {
    const out = parseTrivyReport('not a Trivy report');
    expect(out.vulnerabilities).toHaveLength(0);
    expect(out.errors[0]!.row).toBe(-1);
  });

  it('skips entries with no title / CVE / package', () => {
    const out = parseTrivyReport({ Results: [{ Vulnerabilities: [{}] }] });
    expect(out.vulnerabilities).toHaveLength(0);
    expect(out.errors).toHaveLength(1);
  });
});

describe('parseOpenvasReport', () => {
  it('parses an OpenVAS-shaped report', () => {
    const report = {
      report: {
        results: {
          result: [
            {
              name: 'OpenSSL outdated',
              description: 'old',
              severity: 7.5,
              threat: 'High',
              port: '443/tcp',
              nvt: {
                cve: 'CVE-2023-0286',
                cvss_base_vector: 'AV:N/AC:L',
                cwe: 'CWE-843',
                family: 'SSL/TLS',
              },
            },
          ],
        },
      },
    };
    const out = parseOpenvasReport(report);
    expect(out.errors).toHaveLength(0);
    expect(out.vulnerabilities).toHaveLength(1);
    const v = out.vulnerabilities[0]!;
    expect(v.cveId).toBe('CVE-2023-0286');
    expect(v.severity).toBe('high');
    expect(v.cvssScore).toBe(7.5);
    expect(v.tags).toContain('openvas');
  });

  it('returns an error row when shape is unrecognised', () => {
    const out = parseOpenvasReport('garbage');
    expect(out.errors[0]!.row).toBe(-1);
  });

  it('parses results when severity arrives as a string', () => {
    const report = {
      report: {
        results: {
          result: [
            { name: 'finding', severity: '5.0', threat: 'Medium', nvt: {} },
          ],
        },
      },
    };
    const out = parseOpenvasReport(report);
    expect(out.vulnerabilities[0]!.cvssScore).toBe(5.0);
    expect(out.vulnerabilities[0]!.severity).toBe('medium');
  });
});
