/**
 * CyberSec OS — Detection rules + detection runs regression tests.
 *
 * Mirrors the assets.test pattern (single pool queue, no transactions).
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

import {
  listDetectionRules,
  getDetectionRule,
  createDetectionRule,
  updateDetectionRule,
  deleteDetectionRule,
  listDetectionRuns,
  recordDetectionRun,
} from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function ruleRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'r-1',
    owner_id: 'u-1',
    name: 'SSH brute force',
    description: 'Detects multi-fail SSH',
    author: 'alice',
    lifecycle: 'draft',
    severity: 'high',
    tactic: 'credential-access',
    technique: 'T1110',
    log_source_kind: 'siem',
    detection: { condition: 'selection' },
    false_positives: [],
    references: [],
    tags: [],
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

function runRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'dr-1',
    rule_id: 'r-1',
    alert_id: null,
    triggered_at: new Date('2026-05-10T01:00:00Z'),
    payload: {},
    created_at: new Date('2026-05-10T01:00:00Z'),
    ...overrides,
  };
}

// ─── listDetectionRules ────────────────────────────────────────────────────

describe('listDetectionRules', () => {
  it('scopes by owner and orders critical-first', async () => {
    pushResult({ rows: [ruleRow({ severity: 'critical' })] });
    const out = await listDetectionRules({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('critical');
    expect(calls[0]!.sql).toContain('owner_id = $1');
    expect(calls[0]!.sql).toMatch(/CASE severity\s+WHEN 'critical'/);
    expect(calls[0]!.params[0]).toBe('u-1');
  });

  it('filters by lifecycle + severity + q', async () => {
    pushResult({ rows: [] });
    await listDetectionRules({ ownerId: 'u-1', lifecycle: 'active', severity: 'critical', q: 'ssh' });
    expect(calls[0]!.sql).toMatch(/lifecycle = \$\d/);
    expect(calls[0]!.sql).toMatch(/severity = \$\d/);
    expect(calls[0]!.sql).toMatch(/name ILIKE/);
    expect(calls[0]!.params).toContain('active');
    expect(calls[0]!.params).toContain('critical');
    expect(calls[0]!.params).toContain('%ssh%');
  });
});

// ─── CRUD ────────────────────────────────────────────────────────────────

describe('detection rule CRUD roundtrip', () => {
  it('createDetectionRule INSERTs with default lifecycle=draft and severity=medium', async () => {
    pushResult({ rows: [ruleRow({ lifecycle: 'draft', severity: 'medium' })] });
    const out = await createDetectionRule('u-1', { name: 'New rule' });
    expect(out.id).toBe('r-1');
    expect(calls[0]!.sql).toContain('INSERT INTO agos_cyber_detection_rules');
    // params order: id, owner_id, name, description, author, lifecycle, severity, ...
    expect(calls[0]!.params[1]).toBe('u-1');
    expect(calls[0]!.params[5]).toBe('draft');
    expect(calls[0]!.params[6]).toBe('medium');
  });

  it('updateDetectionRule with lifecycle transition sets lifecycle field', async () => {
    pushResult({ rows: [ruleRow({ lifecycle: 'active' })] });
    const out = await updateDetectionRule('r-1', 'u-1', { lifecycle: 'active' });
    expect(out?.lifecycle).toBe('active');
    expect(calls[0]!.sql).toContain('UPDATE agos_cyber_detection_rules');
    expect(calls[0]!.sql).toContain('lifecycle = $');
    expect(calls[0]!.params).toContain('active');
  });

  it('updateDetectionRule returns null when row missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await updateDetectionRule('r-x', 'u-other', { severity: 'low' });
    expect(out).toBeNull();
  });

  it('deleteDetectionRule binds owner_id', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deleteDetectionRule('r-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toContain('DELETE FROM agos_cyber_detection_rules');
    expect(calls[0]!.params).toEqual(['r-1', 'u-1']);
  });
});

// ─── detection runs ──────────────────────────────────────────────────────

describe('detection runs', () => {
  it('listDetectionRuns joins rules for owner-scoped filter, orders triggered_at DESC', async () => {
    pushResult({ rows: [runRow()] });
    const out = await listDetectionRuns({ ruleId: 'r-1', ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.ruleId).toBe('r-1');
    expect(calls[0]!.sql).toContain('JOIN agos_cyber_detection_rules');
    expect(calls[0]!.sql).toContain('triggered_at DESC');
    expect(calls[0]!.sql).toContain('drr.owner_id = $2');
  });

  it('recordDetectionRun checks rule ownership before insert', async () => {
    pushResult({ rows: [{ '?column?': 1 }] }); // ownership check
    pushResult({ rows: [runRow()] }); // insert
    const out = await recordDetectionRun({
      ownerId: 'u-1',
      ruleId: 'r-1',
      payload: { hit: 1 },
    });
    expect(out?.id).toBe('dr-1');
    expect(calls[0]!.sql).toContain('SELECT 1 FROM agos_cyber_detection_rules');
    expect(calls[0]!.params).toEqual(['r-1', 'u-1']);
    expect(calls[1]!.sql).toContain('INSERT INTO agos_cyber_detection_runs');
  });

  it('recordDetectionRun returns null when rule is foreign', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await recordDetectionRun({ ownerId: 'u-other', ruleId: 'r-1' });
    expect(out).toBeNull();
    expect(calls).toHaveLength(1); // no insert attempted
  });
});

// ─── cross-user access denied ────────────────────────────────────────────

describe('cross-user access denied', () => {
  it('getDetectionRule returns null when owner does not match', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getDetectionRule('r-1', 'u-other');
    expect(out).toBeNull();
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
    expect(calls[0]!.params).toEqual(['r-1', 'u-other']);
  });
});
