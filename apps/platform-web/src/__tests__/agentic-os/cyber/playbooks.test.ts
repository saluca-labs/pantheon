/**
 * CyberSec OS — Playbooks (template) regression tests.
 *
 * Covers list/get/create/update/delete and the PUT-style replacePlaybookSteps.
 * Run lifecycle is exercised in playbook-runs.test.ts.
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
  listPlaybooks,
  getPlaybook,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  replacePlaybookSteps,
} from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function playbookRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'pb-1',
    owner_id: 'u-1',
    name: 'Ransomware IR',
    category: 'incident_response',
    description: 'Steps to handle ransomware',
    lifecycle: 'active',
    tactic: 'impact',
    steps: [],
    tags: ['ir'],
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

// ─── list / get ───────────────────────────────────────────────────────────

describe('listPlaybooks', () => {
  it('scopes by owner and orders by name', async () => {
    pushResult({ rows: [playbookRow()] });
    const out = await listPlaybooks({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Ransomware IR');
    expect(calls[0]!.sql).toContain('owner_id = $1');
    expect(calls[0]!.sql).toContain('ORDER BY name ASC');
  });

  it('filters by lifecycle and q', async () => {
    pushResult({ rows: [] });
    await listPlaybooks({ ownerId: 'u-1', lifecycle: 'active', q: 'ransom' });
    expect(calls[0]!.sql).toMatch(/lifecycle = \$\d/);
    expect(calls[0]!.sql).toMatch(/name ILIKE/);
    expect(calls[0]!.params).toContain('active');
    expect(calls[0]!.params).toContain('%ransom%');
  });
});

describe('getPlaybook', () => {
  it('returns null when missing', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getPlaybook('pb-x', 'u-1');
    expect(out).toBeNull();
  });
});

// ─── CRUD ────────────────────────────────────────────────────────────────

describe('playbook CRUD roundtrip', () => {
  it('createPlaybook INSERTs with default lifecycle=active', async () => {
    pushResult({ rows: [playbookRow({ lifecycle: 'active' })] });
    const out = await createPlaybook('u-1', { name: 'Ransomware IR' });
    expect(out.id).toBe('pb-1');
    expect(out.lifecycle).toBe('active');
    expect(calls[0]!.sql).toContain('INSERT INTO agos_cyber_playbooks');
    // id, owner_id, name, category, description, lifecycle...
    expect(calls[0]!.params[1]).toBe('u-1');
    expect(calls[0]!.params[5]).toBe('active');
  });

  it('updatePlaybook patches only provided fields', async () => {
    pushResult({ rows: [playbookRow({ lifecycle: 'deprecated' })] });
    const out = await updatePlaybook('pb-1', 'u-1', { lifecycle: 'deprecated' });
    expect(out?.lifecycle).toBe('deprecated');
    expect(calls[0]!.sql).toContain('UPDATE agos_cyber_playbooks');
    expect(calls[0]!.sql).toContain('lifecycle = $');
    expect(calls[0]!.params).toContain('deprecated');
  });

  it('deletePlaybook binds owner; FK with ON DELETE RESTRICT means existing runs would error at PG level (covered in tests for runs cascade)', async () => {
    pushResult({ rowCount: 1 });
    const ok = await deletePlaybook('pb-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[0]!.sql).toContain('DELETE FROM agos_cyber_playbooks');
    expect(calls[0]!.params).toEqual(['pb-1', 'u-1']);
  });
});

// ─── replacePlaybookSteps ────────────────────────────────────────────────

describe('replacePlaybookSteps', () => {
  it('verifies ownership then replaces steps cleanly', async () => {
    pushResult({ rows: [{ '?column?': 1 }] }); // ownership check
    pushResult({ rowCount: 1 }); // UPDATE
    pushResult({ rows: [playbookRow({ steps: [{ kind: 'checklist', label: 'Triage' }] })] }); // getPlaybook
    const out = await replacePlaybookSteps({
      id: 'pb-1',
      ownerId: 'u-1',
      steps: [{ kind: 'checklist', label: 'Triage' }],
    });
    expect(out?.steps).toEqual([{ kind: 'checklist', label: 'Triage' }]);
    expect(calls[0]!.sql).toContain('SELECT 1 FROM agos_cyber_playbooks');
    expect(calls[1]!.sql).toContain('UPDATE agos_cyber_playbooks');
    expect(calls[1]!.sql).toContain('steps = $1::jsonb');
  });

  it('returns null when playbook foreign', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await replacePlaybookSteps({
      id: 'pb-1',
      ownerId: 'u-other',
      steps: [],
    });
    expect(out).toBeNull();
    expect(calls).toHaveLength(1); // no update attempted
  });
});

// ─── cross-user access denied ────────────────────────────────────────────

describe('cross-user access denied', () => {
  it('getPlaybook returns null when owner mismatched', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const out = await getPlaybook('pb-1', 'u-other');
    expect(out).toBeNull();
    expect(calls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
    expect(calls[0]!.params).toEqual(['pb-1', 'u-other']);
  });
});
