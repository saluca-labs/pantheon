/**
 * Maker OS — Phase 3 repo CRUD tests.
 *
 * Mocks the pg Pool and asserts the SQL shape + ownership wiring for the
 * new build-step, log-entry, and milestone repos. Pattern mirrors
 * `repo-phase2.test.ts`: a sequential queue of fake results plus a
 * calls[] capture for SQL/params assertions.
 *
 * Covers:
 *   - listBuildSteps / createBuildStep ordinal default + project ownership.
 *   - completeStep happy path + undo flag + idempotency (no row written
 *     when the toggle direction matches state).
 *   - reorderBuildSteps uses two-pass transactional renumber.
 *   - listLogEntries filters by stepId + limit.
 *   - createLogEntry verifies the step belongs to the project when stepId
 *     is supplied; sets author_id from session.
 *   - listRecentLogEntries joins project name + caps at 25.
 *   - Milestones CRUD + toggleMilestoneComplete.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Pool mock ────────────────────────────────────────────────────────────

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];
let lastInsertedId: string | null = null;

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

// Reusable client mock for transactional calls (reorderBuildSteps).
const clientMock = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/^INSERT INTO /m.test(sql) && typeof params[0] === 'string') {
      lastInsertedId = params[0];
    }
    const next = queue.shift() ?? { rows: [], rowCount: 0 };
    if (lastInsertedId && next.rows[0] && /^SELECT /m.test(sql)) {
      next.rows[0] = { ...next.rows[0], id: lastInsertedId };
    }
    return next;
  }),
  release: vi.fn(),
};

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getMakerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/^INSERT INTO /m.test(sql) && typeof params[0] === 'string') {
        lastInsertedId = params[0];
      }
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      if (lastInsertedId && next.rows[0] && /^SELECT /m.test(sql)) {
        next.rows[0] = { ...next.rows[0], id: lastInsertedId };
      }
      return next;
    }),
    connect: async () => clientMock,
  }),
}));

import {
  listBuildSteps,
  createBuildStep,
  updateBuildStep,
  deleteBuildStep,
  completeStep,
  reorderBuildSteps,
  listLogEntries,
  createLogEntry,
  listRecentLogEntries,
  listMilestones,
  createMilestone,
  toggleMilestoneComplete,
  deleteMilestone,
} from '@/lib/agentic-os/maker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  lastInsertedId = null;
  clientMock.query.mockClear();
  clientMock.release.mockClear();
});

function projectRow(over: Record<string, any> = {}): any {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'CNC v2',
    description: null,
    status: 'concept',
    tags: [],
    cover_image_url: null,
    target_completion_date: null,
    team_size: null,
    phase_progress: {},
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function stepRow(over: Record<string, any> = {}): any {
  return {
    id: 's-1',
    project_id: 'p-1',
    ordinal: 1,
    title: 'Cut frame',
    body: null,
    est_minutes: 30,
    completed_at: null,
    blocker_text: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function logRow(over: Record<string, any> = {}): any {
  return {
    id: 'e-1',
    project_id: 'p-1',
    step_id: null,
    body: 'Cut all panels today',
    attached_urls: [],
    author_id: 'u-1',
    created_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function milestoneRow(over: Record<string, any> = {}): any {
  return {
    id: 'm-1',
    project_id: 'p-1',
    label: 'Frame welded',
    due_at: null,
    completed_at: null,
    sort_order: 0,
    notes: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

// ─── Build steps ──────────────────────────────────────────────────────────

describe('listBuildSteps', () => {
  it('asserts project ownership first then queries by project_id ASC ordinal', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rows: [stepRow()] }); // SELECT
    const steps = await listBuildSteps('p-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_projects/);
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_build_steps/);
    expect(calls[1]!.sql).toMatch(/ORDER BY ordinal ASC/);
    expect(steps).toHaveLength(1);
  });

  it('throws when project not owned by user', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(listBuildSteps('p-1', 'u-1')).rejects.toThrow(/not owned/);
  });
});

describe('createBuildStep', () => {
  it('defaults ordinal to MAX(ordinal)+1 when not supplied', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rows: [{ next_ordinal: 5 }] }); // MAX(ordinal)+1
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [projectRow()] }); // ownership re-read (getBuildStep)
    pushResult({ rows: [stepRow({ ordinal: 5 })] }); // SELECT
    const step = await createBuildStep('p-1', 'u-1', { title: 'Bend tabs' });
    expect(step.ordinal).toBe(5);
    expect(calls[1]!.sql).toMatch(/COALESCE\(MAX\(ordinal\), 0\) \+ 1/);
  });

  it('honours an explicit ordinal', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [projectRow()] }); // ownership re-read
    pushResult({ rows: [stepRow({ ordinal: 12 })] }); // SELECT
    const step = await createBuildStep('p-1', 'u-1', {
      title: 'Polish',
      ordinal: 12,
    });
    expect(step.ordinal).toBe(12);
    // Ensure we did NOT issue the MAX(ordinal) query when ordinal was explicit
    expect(calls.find((c) => /MAX\(ordinal\)/.test(c.sql))).toBeUndefined();
  });
});

describe('completeStep', () => {
  it('sets completed_at = now() when undo is false (conditional UPDATE)', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [projectRow()] }); // ownership for re-read
    pushResult({ rows: [stepRow({ completed_at: new Date() })] });
    const step = await completeStep('s-1', 'p-1', 'u-1');
    expect(step?.completedAt).toBeTruthy();
    const update = calls.find((c) => /SET completed_at = now\(\)/.test(c.sql));
    expect(update).toBeTruthy();
    expect(update!.sql).toMatch(/completed_at IS NULL/);
  });

  it('clears completed_at when undo is true (conditional UPDATE on IS NOT NULL)', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [projectRow()] }); // ownership for re-read
    pushResult({ rows: [stepRow({ completed_at: null })] });
    const step = await completeStep('s-1', 'p-1', 'u-1', { undo: true });
    expect(step?.completedAt).toBeNull();
    const update = calls.find((c) => /SET completed_at = NULL/.test(c.sql));
    expect(update).toBeTruthy();
    expect(update!.sql).toMatch(/completed_at IS NOT NULL/);
  });

  it('is idempotent: writing same direction twice issues conditional UPDATE both times', async () => {
    // 1st call
    pushResult({ rows: [projectRow()] });
    pushResult({ rowCount: 0, rows: [] }); // already complete -> no rows changed
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [stepRow({ completed_at: new Date() })] });
    await completeStep('s-1', 'p-1', 'u-1');
    // 2nd call (still trying to mark complete)
    pushResult({ rows: [projectRow()] });
    pushResult({ rowCount: 0, rows: [] });
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [stepRow({ completed_at: new Date() })] });
    await completeStep('s-1', 'p-1', 'u-1');
    // Both UPDATEs have IS NULL guard so a row already done won't double-write.
    const updates = calls.filter((c) => /SET completed_at = now\(\)/.test(c.sql));
    expect(updates).toHaveLength(2);
    for (const u of updates) {
      expect(u.sql).toMatch(/completed_at IS NULL/);
    }
  });
});

describe('reorderBuildSteps', () => {
  it('runs inside a transaction with two-pass renumber', async () => {
    pushResult({ rows: [projectRow()] }); // ownership outside client
    // No more queue.push needed — the client mock pulls from the same queue.
    // Provide existing rows for the SELECT inside the transaction.
    pushResult({ rows: [] }); // BEGIN result is unused
    pushResult({
      rows: [{ id: 's-1' }, { id: 's-2' }, { id: 's-3' }],
    });
    // 6 UPDATE calls (3 negative pass + 3 positive pass), then COMMIT.
    for (let i = 0; i < 7; i++) pushResult({ rowCount: 1, rows: [] });
    await reorderBuildSteps('p-1', 'u-1', ['s-3', 's-1', 's-2']);
    // BEGIN + SELECT + 6 UPDATE + COMMIT = at least 9 client.query calls.
    expect(clientMock.query).toHaveBeenCalled();
    const sqls = clientMock.query.mock.calls.map((c: any[]) => c[0]);
    expect(sqls.some((s: string) => /^BEGIN$/.test(s))).toBe(true);
    expect(sqls.some((s: string) => /^COMMIT$/.test(s))).toBe(true);
    // First-pass writes negative ordinals, second-pass writes positive.
    const negativeWrites = sqls.filter((s: string) => /SET ordinal = -/.test(s));
    const positiveWrites = sqls.filter((s: string) => /SET ordinal = \$2/.test(s));
    expect(negativeWrites.length).toBe(3);
    expect(positiveWrites.length).toBe(3);
    // Client released after transaction.
    expect(clientMock.release).toHaveBeenCalled();
  });
});

describe('updateBuildStep', () => {
  it('issues a COALESCE UPDATE then re-reads the row', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [projectRow()] }); // ownership re-read
    pushResult({ rows: [stepRow({ title: 'New title' })] });
    const step = await updateBuildStep('s-1', 'p-1', 'u-1', { title: 'New title' });
    expect(step?.title).toBe('New title');
    expect(calls[1]!.sql).toMatch(/UPDATE agos_maker_build_steps/);
    expect(calls[1]!.sql).toMatch(/COALESCE/);
  });
});

describe('deleteBuildStep', () => {
  it('returns true when a row was removed', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteBuildStep('s-1', 'p-1', 'u-1')).toBe(true);
  });

  it('returns false when nothing was removed', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteBuildStep('s-x', 'p-1', 'u-1')).toBe(false);
  });
});

// ─── Build log ────────────────────────────────────────────────────────────

describe('listLogEntries', () => {
  it('asserts project ownership + queries newest-first', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [logRow()] });
    await listLogEntries({ projectId: 'p-1', userId: 'u-1' });
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_build_log_entries/);
    expect(calls[1]!.sql).toMatch(/ORDER BY created_at DESC/);
  });

  it('applies stepId filter when supplied', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [] });
    await listLogEntries({ projectId: 'p-1', userId: 'u-1', stepId: 's-9' });
    expect(calls[1]!.sql).toMatch(/step_id =/);
    expect(calls[1]!.params).toContain('s-9');
  });

  it('clamps limit to [1, 200]', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [] });
    await listLogEntries({ projectId: 'p-1', userId: 'u-1', limit: 5000 });
    // Last param is the limit.
    const params = calls[1]!.params;
    expect(params[params.length - 1]).toBe(200);
  });
});

describe('createLogEntry', () => {
  it('inserts with author_id = userId and re-reads', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [projectRow()] }); // ownership re-read
    pushResult({ rows: [logRow({ author_id: 'u-1' })] }); // SELECT
    const entry = await createLogEntry('p-1', 'u-1', { body: 'hello' });
    expect(entry.authorId).toBe('u-1');
    const insert = calls.find((c) => /INSERT INTO agos_maker_build_log_entries/.test(c.sql));
    expect(insert!.params[5]).toBe('u-1'); // author_id is the 6th positional param
  });

  it('verifies step ownership when stepId is supplied', async () => {
    pushResult({ rows: [projectRow()] }); // project ownership
    pushResult({ rows: [projectRow()] }); // getBuildStep -> project ownership
    pushResult({ rows: [stepRow()] }); // step lookup
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [projectRow()] }); // ownership re-read
    pushResult({ rows: [logRow({ step_id: 's-1' })] }); // SELECT
    const entry = await createLogEntry('p-1', 'u-1', {
      body: 'hello',
      stepId: 's-1',
    });
    expect(entry.stepId).toBe('s-1');
  });

  it('rejects when the supplied step is not on the project', async () => {
    pushResult({ rows: [projectRow()] }); // project ownership
    pushResult({ rows: [projectRow()] }); // step's project ownership
    pushResult({ rows: [], rowCount: 0 }); // step lookup -> not found
    await expect(
      createLogEntry('p-1', 'u-1', { body: 'hi', stepId: 's-x' }),
    ).rejects.toThrow(/Step not found/);
  });
});

describe('listRecentLogEntries', () => {
  it('joins to projects + caps limit at 25', async () => {
    pushResult({
      rows: [
        { ...logRow(), project_name: 'CNC v2' },
        { ...logRow({ id: 'e-2' }), project_name: 'CNC v2' },
      ],
    });
    const entries = await listRecentLogEntries('u-1', 1000);
    expect(entries[0]!.projectName).toBe('CNC v2');
    expect(calls[0]!.sql).toMatch(/JOIN agos_maker_projects/);
    expect(calls[0]!.sql).toMatch(/ORDER BY e\.created_at DESC/);
    // limit is the 2nd positional param.
    expect(calls[0]!.params[1]).toBe(25);
  });

  it('defaults to 5 when called with no limit', async () => {
    pushResult({ rows: [] });
    await listRecentLogEntries('u-1');
    expect(calls[0]!.params[1]).toBe(5);
  });
});

// ─── Milestones ───────────────────────────────────────────────────────────

describe('listMilestones + createMilestone', () => {
  it('listMilestones asserts ownership and orders by sort_order ASC', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [milestoneRow()] });
    await listMilestones('p-1', 'u-1');
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_build_milestones/);
    expect(calls[1]!.sql).toMatch(/ORDER BY sort_order ASC/);
  });

  it('createMilestone inserts then re-reads', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [projectRow()] }); // ownership re-read
    pushResult({ rows: [milestoneRow({ label: 'Frame welded' })] });
    const m = await createMilestone('p-1', 'u-1', { label: 'Frame welded' });
    expect(m.label).toBe('Frame welded');
  });
});

describe('toggleMilestoneComplete', () => {
  it('uses a single CASE UPDATE so a click swaps direction', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [projectRow()] }); // ownership re-read
    pushResult({ rows: [milestoneRow({ completed_at: new Date() })] });
    const m = await toggleMilestoneComplete('m-1', 'p-1', 'u-1');
    expect(m?.completedAt).toBeTruthy();
    const update = calls.find(
      (c) => /UPDATE agos_maker_build_milestones/.test(c.sql) && /CASE/.test(c.sql),
    );
    expect(update).toBeTruthy();
  });
});

describe('deleteMilestone', () => {
  it('returns true when removed', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteMilestone('m-1', 'p-1', 'u-1')).toBe(true);
  });

  it('returns false on miss', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteMilestone('m-x', 'p-1', 'u-1')).toBe(false);
  });
});
