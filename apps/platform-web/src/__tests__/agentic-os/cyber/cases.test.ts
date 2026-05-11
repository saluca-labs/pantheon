/**
 * CyberSec OS — Cases / events / alerts / evidence / tasks regression tests.
 *
 * Exercises the cases repo against a mocked pg Pool with both direct
 * .query() and .connect()→client.query() paths. Mirrors the filmmaker
 * schedule.test pattern for transactional flows.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

// Two parallel queues: pool-level vs tx-client-level. Tests push to the right
// one based on which path the function under test takes.
const poolQueue: PgResult[] = [];
const txQueue: PgResult[] = [];

const poolCalls: { sql: string; params: any[] }[] = [];
const txCalls: { sql: string; params: any[] }[] = [];

function pushPool(r: Partial<PgResult>): void {
  poolQueue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}
function pushTx(r: Partial<PgResult>): void {
  txQueue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

function makeClient() {
  return {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      txCalls.push({ sql, params });
      return txQueue.shift() ?? { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
}

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      poolCalls.push({ sql, params });
      return poolQueue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => makeClient()),
  }),
}));

import {
  listCases,
  getCase,
  getCaseDetail,
  createCase,
  updateCase,
  deleteCase,
  appendCaseEvent,
  listCaseEvents,
  attachAlertToCase,
  detachAlertFromCase,
  addTask,
  updateTask,
  deleteTask,
  reorderTasks,
} from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  poolQueue.length = 0;
  txQueue.length = 0;
  poolCalls.length = 0;
  txCalls.length = 0;
});

function caseRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'c-1',
    owner_id: 'u-1',
    title: 'PowerShell on prod-web-01',
    summary: 'Suspicious encoded PS',
    severity: 'high',
    status: 'open',
    priority: 'p2',
    assigned_to: null,
    tactic: null,
    technique: null,
    tags: [],
    closed_at: null,
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

function taskRow(overrides: Record<string, any> = {}): any {
  return {
    id: 't-1',
    case_id: 'c-1',
    title: 'Isolate host',
    description: null,
    status: 'open',
    assigned_to: null,
    priority: 'medium',
    due_at: null,
    completed_at: null,
    position: 0,
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

// ─── listCases ────────────────────────────────────────────────────────────

describe('listCases', () => {
  it('scopes by owner and orders critical-first by severity then updatedAt desc', async () => {
    pushPool({
      rows: [
        {
          ...caseRow({ severity: 'critical' }),
          alert_count: '2',
          event_count: '5',
          evidence_count: '1',
          open_task_count: '3',
        },
      ],
    });
    const out = await listCases({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('critical');
    expect(out[0]!.alertCount).toBe(2);
    expect(out[0]!.openTaskCount).toBe(3);
    expect(poolCalls[0]!.sql).toContain('c.owner_id = $1');
    expect(poolCalls[0]!.sql).toMatch(/CASE c\.severity\s+WHEN 'critical'/);
    expect(poolCalls[0]!.sql).toContain('c.updated_at DESC');
  });

  it('filters by status, severity, priority, q', async () => {
    pushPool({ rows: [] });
    await listCases({
      ownerId: 'u-1',
      status: 'investigating',
      severity: 'high',
      priority: 'p2',
      q: 'powershell',
    });
    expect(poolCalls[0]!.sql).toMatch(/c\.status = \$\d/);
    expect(poolCalls[0]!.sql).toMatch(/c\.severity = \$\d/);
    expect(poolCalls[0]!.sql).toMatch(/c\.priority = \$\d/);
    expect(poolCalls[0]!.params).toContain('investigating');
    expect(poolCalls[0]!.params).toContain('high');
    expect(poolCalls[0]!.params).toContain('p2');
    expect(poolCalls[0]!.params).toContain('%powershell%');
  });
});

// ─── CRUD roundtrip ───────────────────────────────────────────────────────

describe('case CRUD roundtrip', () => {
  it('createCase BEGIN-INSERT-COMMIT, then re-selects', async () => {
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rowCount: 1 }); // INSERT
    pushTx({ rowCount: 1 }); // COMMIT
    pushPool({ rows: [caseRow()] }); // SELECT in getCase
    const out = await createCase('u-1', { title: 'PowerShell on prod-web-01' });
    expect(out.id).toBe('c-1');
    expect(txCalls[0]!.sql).toBe('BEGIN');
    expect(txCalls[1]!.sql).toContain('INSERT INTO agos_cyber_cases');
    expect(txCalls[2]!.sql).toBe('COMMIT');
  });

  it('createCase with assignedTo also appends assignment_change event', async () => {
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rowCount: 1 }); // INSERT case
    pushTx({ rows: [{ id: 'e-1', case_id: 'c-1', kind: 'assignment_change', author: null, body: 'Assigned to alice', payload: {}, created_at: new Date() }] }); // INSERT event
    pushTx({ rowCount: 1 }); // COMMIT
    pushPool({ rows: [caseRow({ assigned_to: 'alice' })] }); // getCase
    await createCase('u-1', { title: 'X', assignedTo: 'alice' });
    expect(txCalls.some((c) => c.sql.includes('INSERT INTO agos_cyber_case_events') && c.params.includes('assignment_change'))).toBe(true);
  });

  it('getCase returns null when missing', async () => {
    pushPool({ rows: [], rowCount: 0 });
    const out = await getCase('missing', 'u-1');
    expect(out).toBeNull();
  });

  it('updateCase auto-appends severity_change event when severity changes', async () => {
    pushPool({ rows: [caseRow({ severity: 'medium' })] }); // getCase(before)
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rowCount: 1 }); // UPDATE
    pushTx({ rows: [{ id: 'e-1', case_id: 'c-1', kind: 'severity_change', author: null, body: null, payload: {}, created_at: new Date() }] }); // INSERT event
    pushTx({ rowCount: 1 }); // COMMIT
    pushPool({ rows: [caseRow({ severity: 'critical' })] }); // getCase(after)

    const out = await updateCase('c-1', 'u-1', { severity: 'critical' });
    expect(out?.severity).toBe('critical');
    const sevInsert = txCalls.find(
      (c) => c.sql.includes('INSERT INTO agos_cyber_case_events') && c.params.includes('severity_change'),
    );
    expect(sevInsert).toBeTruthy();
  });

  it('updateCase status → closed sets closed_at and appends status_change event', async () => {
    pushPool({ rows: [caseRow({ status: 'investigating' })] }); // getCase(before)
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rowCount: 1 }); // UPDATE
    pushTx({ rows: [{ id: 'e', case_id: 'c-1', kind: 'status_change', author: null, body: null, payload: {}, created_at: new Date() }] });
    pushTx({ rowCount: 1 }); // COMMIT
    pushPool({ rows: [caseRow({ status: 'closed', closed_at: new Date('2026-05-10T02:00:00Z') })] });

    const out = await updateCase('c-1', 'u-1', { status: 'closed' });
    expect(out?.status).toBe('closed');
    expect(out?.closedAt).toBe('2026-05-10T02:00:00.000Z');
    const update = txCalls.find((c) => c.sql.includes('UPDATE agos_cyber_cases'));
    expect(update?.sql).toContain('closed_at = now()');
  });

  it('updateCase returns null when case not found', async () => {
    pushPool({ rows: [], rowCount: 0 });
    const out = await updateCase('c-X', 'u-OTHER', { severity: 'high' });
    expect(out).toBeNull();
    expect(txCalls).toHaveLength(0);
  });

  it('deleteCase scoped by owner; cascade is handled by FK ON DELETE CASCADE', async () => {
    pushPool({ rowCount: 1 });
    const ok = await deleteCase('c-1', 'u-1');
    expect(ok).toBe(true);
    expect(poolCalls[0]!.sql).toContain('DELETE FROM agos_cyber_cases');
    expect(poolCalls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
  });
});

// ─── getCaseDetail ────────────────────────────────────────────────────────

describe('getCaseDetail', () => {
  it('returns case + linkedAlerts + events + evidence + tasks', async () => {
    pushPool({ rows: [caseRow()] }); // getCase
    pushPool({ rows: [{ id: 'a-1', title: 'Alert one', severity: 'high', occurred_at: new Date('2026-05-10T01:00:00Z') }] });
    pushPool({ rows: [{ id: 'e-1', case_id: 'c-1', kind: 'note', author: null, body: 'hi', payload: {}, created_at: new Date() }] });
    pushPool({ rows: [{ id: 'ev-1', case_id: 'c-1', kind: 'file', title: 'pcap', description: null, url: null, content: null, mime_type: null, sha256: null, collected_at: new Date(), collected_by: null, tags: [], metadata: {}, created_at: new Date(), updated_at: new Date() }] });
    pushPool({ rows: [taskRow()] });

    const out = await getCaseDetail('c-1', 'u-1');
    expect(out).not.toBeNull();
    expect(out!.linkedAlerts).toHaveLength(1);
    expect(out!.linkedAlerts[0]!.title).toBe('Alert one');
    expect(out!.events).toHaveLength(1);
    expect(out!.evidence).toHaveLength(1);
    expect(out!.tasks).toHaveLength(1);
  });

  it('returns null when the case is missing or owned by someone else', async () => {
    pushPool({ rows: [], rowCount: 0 });
    const out = await getCaseDetail('c-X', 'u-OTHER');
    expect(out).toBeNull();
  });
});

// ─── attach / detach alert ────────────────────────────────────────────────

describe('attachAlertToCase', () => {
  it('verifies dual ownership, inserts join row, and appends alert_attached event', async () => {
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rows: [{ case_title: 'PS case', alert_title: 'Encoded PS detected' }] });
    pushTx({ rowCount: 1 }); // INSERT join
    pushTx({ rows: [{ id: 'e-1', case_id: 'c-1', kind: 'alert_attached', author: null, body: 'Alert attached: Encoded PS detected', payload: {}, created_at: new Date() }] });
    pushTx({ rowCount: 1 }); // COMMIT

    const ok = await attachAlertToCase({ caseId: 'c-1', alertId: 'a-1', ownerId: 'u-1' });
    expect(ok).toBe(true);
    expect(txCalls.some((c) => c.sql.includes('INSERT INTO agos_cyber_case_alerts'))).toBe(true);
    expect(txCalls.some((c) => c.sql.includes('INSERT INTO agos_cyber_case_events') && c.params.includes('alert_attached'))).toBe(true);
  });

  it('returns false and rolls back when case or alert is foreign', async () => {
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rows: [{ case_title: null, alert_title: 'Encoded PS detected' }] }); // case is foreign
    pushTx({ rowCount: 1 }); // ROLLBACK

    const ok = await attachAlertToCase({ caseId: 'c-1', alertId: 'a-1', ownerId: 'u-OTHER' });
    expect(ok).toBe(false);
    expect(txCalls.some((c) => c.sql.includes('INSERT INTO agos_cyber_case_alerts'))).toBe(false);
  });
});

describe('detachAlertFromCase', () => {
  it('verifies case ownership, deletes join, and appends alert_detached event', async () => {
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rows: [{ '?column?': 1 }] }); // ownership check
    pushTx({ rowCount: 1 }); // DELETE join
    pushTx({ rows: [{ id: 'e-2', case_id: 'c-1', kind: 'alert_detached', author: null, body: 'Alert detached', payload: {}, created_at: new Date() }] });
    pushTx({ rowCount: 1 }); // COMMIT

    const ok = await detachAlertFromCase({ caseId: 'c-1', alertId: 'a-1', ownerId: 'u-1' });
    expect(ok).toBe(true);
    expect(txCalls.some((c) => c.sql.includes('DELETE FROM agos_cyber_case_alerts'))).toBe(true);
    expect(txCalls.some((c) => c.sql.includes('INSERT INTO agos_cyber_case_events') && c.params.includes('alert_detached'))).toBe(true);
  });

  it('returns false when case is foreign', async () => {
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rows: [], rowCount: 0 }); // ownership check fails
    pushTx({ rowCount: 1 }); // ROLLBACK
    const ok = await detachAlertFromCase({ caseId: 'c-1', alertId: 'a-1', ownerId: 'u-OTHER' });
    expect(ok).toBe(false);
  });
});

// ─── case events ──────────────────────────────────────────────────────────

describe('case events', () => {
  it('listCaseEvents joins case for ownership check and orders newest-first', async () => {
    pushPool({ rows: [{ id: 'e-1', case_id: 'c-1', kind: 'note', author: 'u', body: 'note body', payload: {}, created_at: new Date() }] });
    const out = await listCaseEvents('c-1', 'u-1');
    expect(out).toHaveLength(1);
    expect(poolCalls[0]!.sql).toContain('JOIN agos_cyber_cases c');
    expect(poolCalls[0]!.sql).toContain('c.owner_id = $2');
    expect(poolCalls[0]!.sql).toContain('ORDER BY e.created_at DESC');
  });

  it('appendCaseEvent rejects when case is foreign', async () => {
    pushPool({ rows: [], rowCount: 0 }); // ownership check
    const out = await appendCaseEvent({ caseId: 'c-1', ownerId: 'u-OTHER', kind: 'note' });
    expect(out).toBeNull();
  });
});

// ─── tasks ────────────────────────────────────────────────────────────────

describe('tasks', () => {
  it('addTask verifies case ownership, auto-positions, and appends task_added event', async () => {
    pushPool({ rows: [{ '?column?': 1 }] }); // ownership check
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rows: [{ next: 3 }] }); // MAX(position)+1
    pushTx({ rowCount: 1 }); // INSERT task
    pushTx({ rows: [{ id: 'e-3', case_id: 'c-1', kind: 'task_added', author: null, body: 'Task added: Isolate host', payload: {}, created_at: new Date() }] });
    pushTx({ rowCount: 1 }); // COMMIT
    pushPool({ rows: [taskRow({ position: 3 })] }); // getTask

    const out = await addTask({
      ownerId: 'u-1',
      caseId: 'c-1',
      title: 'Isolate host',
    });
    expect(out?.position).toBe(3);
    const insertTask = txCalls.find((c) => c.sql.includes('INSERT INTO agos_cyber_tasks'));
    expect(insertTask).toBeTruthy();
    // INSERT params: id, case_id, title, description, status, assigned_to, priority, due_at, position
    expect(insertTask!.params[8]).toBe(3);
    expect(txCalls.some((c) => c.sql.includes('INSERT INTO agos_cyber_case_events') && c.params.includes('task_added'))).toBe(true);
  });

  it('updateTask status → done sets completed_at and appends task_completed event', async () => {
    pushPool({ rows: [taskRow({ status: 'open' })] }); // getTask(before)
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rowCount: 1 }); // UPDATE
    pushTx({ rows: [{ id: 'e', case_id: 'c-1', kind: 'task_completed', author: null, body: null, payload: {}, created_at: new Date() }] });
    pushTx({ rowCount: 1 }); // COMMIT
    pushPool({ rows: [taskRow({ status: 'done', completed_at: new Date('2026-05-10T03:00:00Z') })] });

    const out = await updateTask({ id: 't-1', ownerId: 'u-1', status: 'done' });
    expect(out?.status).toBe('done');
    expect(out?.completedAt).toBe('2026-05-10T03:00:00.000Z');
    const update = txCalls.find((c) => c.sql.includes('UPDATE agos_cyber_tasks'));
    expect(update?.sql).toContain('completed_at = now()');
    expect(txCalls.some((c) => c.params.includes('task_completed'))).toBe(true);
  });

  it('updateTask status off done clears completed_at and appends task_reopened event', async () => {
    pushPool({ rows: [taskRow({ status: 'done', completed_at: new Date() })] });
    pushTx({ rowCount: 1 });
    pushTx({ rowCount: 1 });
    pushTx({ rows: [{ id: 'e', case_id: 'c-1', kind: 'task_reopened', author: null, body: null, payload: {}, created_at: new Date() }] });
    pushTx({ rowCount: 1 });
    pushPool({ rows: [taskRow({ status: 'open', completed_at: null })] });

    const out = await updateTask({ id: 't-1', ownerId: 'u-1', status: 'open' });
    expect(out?.status).toBe('open');
    const update = txCalls.find((c) => c.sql.includes('UPDATE agos_cyber_tasks'));
    expect(update?.sql).toContain('completed_at = NULL');
    expect(txCalls.some((c) => c.params.includes('task_reopened'))).toBe(true);
  });

  it('deleteTask joins case for ownership', async () => {
    pushPool({ rowCount: 1 });
    const ok = await deleteTask('t-1', 'u-1');
    expect(ok).toBe(true);
    expect(poolCalls[0]!.sql).toContain('DELETE FROM agos_cyber_tasks');
    expect(poolCalls[0]!.sql).toContain('USING agos_cyber_cases');
    expect(poolCalls[0]!.sql).toContain('c.owner_id = $2');
  });

  it('reorderTasks updates positions transactionally', async () => {
    pushPool({ rows: [{ '?column?': 1 }] }); // ownership check
    pushTx({ rowCount: 1 }); // BEGIN
    pushTx({ rowCount: 1 }); // UPDATE 0
    pushTx({ rowCount: 1 }); // UPDATE 1
    pushTx({ rowCount: 1 }); // UPDATE 2
    pushTx({ rowCount: 1 }); // COMMIT

    const ok = await reorderTasks('c-1', 'u-1', ['t-a', 't-b', 't-c']);
    expect(ok).toBe(true);

    const updates = txCalls.filter((c) => c.sql.includes('UPDATE agos_cyber_tasks'));
    expect(updates).toHaveLength(3);
    expect(updates[0]!.params).toEqual([0, 't-a', 'c-1']);
    expect(updates[1]!.params).toEqual([1, 't-b', 'c-1']);
    expect(updates[2]!.params).toEqual([2, 't-c', 'c-1']);
  });

  it('reorderTasks rejects foreign cases', async () => {
    pushPool({ rows: [], rowCount: 0 });
    const ok = await reorderTasks('c-1', 'u-OTHER', ['t-a']);
    expect(ok).toBe(false);
    expect(txCalls).toHaveLength(0);
  });
});

// ─── cross-user access denied ─────────────────────────────────────────────

describe('cross-user access denied', () => {
  it('getCase returns null when owner_id does not match', async () => {
    pushPool({ rows: [], rowCount: 0 });
    const out = await getCase('c-1', 'u-OTHER');
    expect(out).toBeNull();
    expect(poolCalls[0]!.params).toEqual(['c-1', 'u-OTHER']);
    expect(poolCalls[0]!.sql).toContain('WHERE id = $1 AND owner_id = $2');
  });

  it('deleteCase binds the supplied owner_id', async () => {
    pushPool({ rowCount: 0 });
    await deleteCase('c-1', 'u-OTHER');
    expect(poolCalls[0]!.params).toEqual(['c-1', 'u-OTHER']);
  });
});
