/**
 * CyberSec OS — Playbook runs + step runs regression tests.
 *
 * Exercises:
 *   - startPlaybookRun snapshots playbook.steps into step_runs
 *   - updateStepRun timestamp side effects (started_at / completed_at)
 *   - completeRun terminal state via BEGIN/UPDATE/COMMIT
 *   - cross-user denied
 *
 * Cascade semantics (FKs):
 *   - playbook_runs → playbooks: ON DELETE RESTRICT (PG enforces; tests do not
 *     exercise the cascade itself, but they do assert the SQL contracts that
 *     produce that behaviour at the FK boundary).
 *   - step_runs → runs: ON DELETE CASCADE (likewise PG-enforced).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

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
  listPlaybookRuns,
  getPlaybookRun,
  startPlaybookRun,
  updateStepRun,
  completeRun,
} from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  poolQueue.length = 0;
  txQueue.length = 0;
  poolCalls.length = 0;
  txCalls.length = 0;
});

function runRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'run-1',
    playbook_id: 'pb-1',
    owner_id: 'u-1',
    case_id: null,
    status: 'in_progress',
    started_at: new Date('2026-05-10T00:00:00Z'),
    completed_at: null,
    notes: null,
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    playbook_name: 'Ransomware IR',
    ...overrides,
  };
}

function stepRunRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'sr-1',
    run_id: 'run-1',
    step_index: 0,
    step_snapshot: { kind: 'checklist', label: 'Triage' },
    status: 'pending',
    input: {},
    notes: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

// ─── listPlaybookRuns ────────────────────────────────────────────────────

describe('listPlaybookRuns', () => {
  it('joins playbook for name, scopes by owner, orders started_at DESC', async () => {
    pushPool({ rows: [runRow()] });
    const out = await listPlaybookRuns({ ownerId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0]!.playbookName).toBe('Ransomware IR');
    expect(poolCalls[0]!.sql).toContain('JOIN agos_cyber_playbooks pb');
    expect(poolCalls[0]!.sql).toContain('pr.owner_id = $1');
    expect(poolCalls[0]!.sql).toContain('pr.started_at DESC');
  });

  it('filters by status and playbookId', async () => {
    pushPool({ rows: [] });
    await listPlaybookRuns({ ownerId: 'u-1', status: 'in_progress', playbookId: 'pb-1' });
    expect(poolCalls[0]!.sql).toMatch(/pr\.status = \$\d/);
    expect(poolCalls[0]!.sql).toMatch(/pr\.playbook_id = \$\d/);
    expect(poolCalls[0]!.params).toContain('in_progress');
    expect(poolCalls[0]!.params).toContain('pb-1');
  });
});

// ─── startPlaybookRun (snapshot stability) ───────────────────────────────

describe('startPlaybookRun', () => {
  it('creates run + step_runs from the playbook.steps snapshot at run-start time', async () => {
    const templateSteps = [
      { kind: 'checklist',   label: 'Triage'   },
      { kind: 'input',       label: 'Evidence' },
      { kind: 'runbook_step', label: 'Isolate' },
    ];
    pushPool({ rows: [{ '?column?': 1 }] });             // playbook ownership check
    pushPool({ rows: [{ steps: templateSteps }] });       // fetch steps
    pushPool({ rowCount: 1 });                            // INSERT run
    pushPool({ rowCount: 1 });                            // INSERT step_run 0
    pushPool({ rowCount: 1 });                            // INSERT step_run 1
    pushPool({ rowCount: 1 });                            // INSERT step_run 2
    pushPool({ rows: [runRow()] });                       // getPlaybookRun → run
    pushPool({                                            // getPlaybookRun → step_runs
      rows: [
        stepRunRow({ id: 'sr-0', step_index: 0, step_snapshot: templateSteps[0] }),
        stepRunRow({ id: 'sr-1', step_index: 1, step_snapshot: templateSteps[1] }),
        stepRunRow({ id: 'sr-2', step_index: 2, step_snapshot: templateSteps[2] }),
      ],
    });

    const out = await startPlaybookRun({ ownerId: 'u-1', playbookId: 'pb-1' });
    expect(out).not.toBeNull();
    expect(out!.stepRuns).toHaveLength(3);
    expect(out!.stepRuns[0]!.stepSnapshot).toEqual(templateSteps[0]);
    expect(out!.stepRuns[2]!.stepSnapshot).toEqual(templateSteps[2]);

    // 3 INSERTs into step_runs, in order, snapshot serialized as JSON
    const stepInserts = poolCalls.filter((c) => c.sql.includes('INSERT INTO agos_cyber_playbook_step_runs'));
    expect(stepInserts).toHaveLength(3);
    expect(stepInserts[0]!.params[2]).toBe(0);
    expect(stepInserts[1]!.params[2]).toBe(1);
    expect(stepInserts[2]!.params[2]).toBe(2);
    // step_snapshot serialized matches the template
    expect(JSON.parse(stepInserts[0]!.params[3] as string)).toEqual(templateSteps[0]);
  });

  it('returns null when playbook is foreign', async () => {
    pushPool({ rows: [], rowCount: 0 }); // ownership check fails
    const out = await startPlaybookRun({ ownerId: 'u-other', playbookId: 'pb-1' });
    expect(out).toBeNull();
    expect(poolCalls).toHaveLength(1); // no insert attempted
  });
});

// ─── updateStepRun (timestamp side-effects) ──────────────────────────────

describe('updateStepRun', () => {
  it('transitioning pending → in_progress sets started_at when null', async () => {
    pushPool({ rows: [stepRunRow({ status: 'pending', started_at: null })] }); // current
    pushPool({ rowCount: 1 }); // UPDATE
    pushPool({ rows: [stepRunRow({ status: 'in_progress', started_at: new Date('2026-05-10T01:00:00Z') })] }); // re-select
    const out = await updateStepRun({
      id: 'sr-1',
      ownerId: 'u-1',
      patch: { status: 'in_progress' },
    });
    expect(out?.status).toBe('in_progress');
    const updateCall = poolCalls.find((c) => c.sql.includes('UPDATE agos_cyber_playbook_step_runs'));
    expect(updateCall?.sql).toContain('started_at = now()');
  });

  it('transitioning to completed sets completed_at when null', async () => {
    pushPool({ rows: [stepRunRow({ status: 'in_progress', started_at: new Date(), completed_at: null })] });
    pushPool({ rowCount: 1 });
    pushPool({ rows: [stepRunRow({ status: 'completed', completed_at: new Date() })] });
    const out = await updateStepRun({
      id: 'sr-1',
      ownerId: 'u-1',
      patch: { status: 'completed' },
    });
    expect(out?.status).toBe('completed');
    const updateCall = poolCalls.find((c) => c.sql.includes('UPDATE agos_cyber_playbook_step_runs'));
    expect(updateCall?.sql).toContain('completed_at = now()');
  });

  it('returns null when step is foreign (sub-query enforces owner)', async () => {
    pushPool({ rows: [], rowCount: 0 }); // current SELECT fails ownership join
    const out = await updateStepRun({ id: 'sr-1', ownerId: 'u-other', patch: { status: 'completed' } });
    expect(out).toBeNull();
    expect(poolCalls).toHaveLength(1);
  });
});

// ─── completeRun (transactional terminal-state) ──────────────────────────

describe('completeRun', () => {
  it('BEGIN → UPDATE → audit → COMMIT then re-fetches detail', async () => {
    pushTx({ rowCount: 1 });                                                   // BEGIN
    pushTx({ rows: [runRow({ status: 'completed' })] });                       // UPDATE RETURNING
    // recordAudit uses pool.query (not client), so push to poolQueue
    pushPool({ rowCount: 1 });                                                 // recordAudit INSERT
    pushTx({ rowCount: 1 });                                                   // COMMIT
    pushPool({ rows: [runRow({ status: 'completed' })] });                     // getPlaybookRun
    pushPool({ rows: [stepRunRow({ status: 'completed' })] });                 // step_runs

    const out = await completeRun({ runId: 'run-1', ownerId: 'u-1', status: 'completed' });
    expect(out?.status).toBe('completed');
    expect(txCalls[0]!.sql).toBe('BEGIN');
    expect(txCalls[1]!.sql).toContain('UPDATE agos_cyber_playbook_runs');
    expect(txCalls[1]!.sql).toContain('completed_at = now()');
    expect(txCalls[txCalls.length - 1]!.sql).toBe('COMMIT');
    expect(poolCalls.some((c) => c.sql.includes('INSERT INTO agos_audit'))).toBe(true);
  });

  it('returns null and rolls back when run is foreign', async () => {
    pushTx({ rowCount: 1 });                          // BEGIN
    pushTx({ rows: [], rowCount: 0 });                // UPDATE 0 rows
    pushTx({ rowCount: 1 });                          // ROLLBACK
    const out = await completeRun({ runId: 'run-x', ownerId: 'u-other', status: 'completed' });
    expect(out).toBeNull();
    expect(txCalls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
  });
});

// ─── getPlaybookRun ──────────────────────────────────────────────────────

describe('getPlaybookRun', () => {
  it('returns null when run is missing or owned by someone else', async () => {
    pushPool({ rows: [], rowCount: 0 });
    const out = await getPlaybookRun('run-x', 'u-other');
    expect(out).toBeNull();
  });
});
