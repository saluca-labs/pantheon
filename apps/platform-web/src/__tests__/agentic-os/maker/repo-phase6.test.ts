/**
 * Maker OS — Phase 6 repo CRUD tests.
 *
 * Mocks the pg Pool and asserts the SQL shape + ownership wiring for the
 * new dependency / blockers / extended-milestone repo functions.
 *
 * Covers:
 *   - createMilestone with the new Phase 6 fields (status/priority/is_blocker).
 *   - updateMilestone wiring + completed_at <-> status='done' sync.
 *   - Status/priority validation rejects unknown values.
 *   - createProjectDependency: self-loop, cross-ownership 404, kind validation.
 *   - updateProjectDependency: status + kind + notes wiring; rejects unknown.
 *   - deleteProjectDependency wiring.
 *   - listProjectDependencies SQL shape (joins on agos_maker_projects with
 *     user_id filter on both sides).
 *   - listTopBlockers SQL: milestone+dependency fan-out, severity assignment,
 *     in-JS rank + limit.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
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
  }),
}));

import {
  createMilestone,
  updateMilestone,
  createProjectDependency,
  updateProjectDependency,
  deleteProjectDependency,
  listProjectDependencies,
  getProjectDependency,
  listTopBlockers,
} from '@/lib/agentic-os/maker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  lastInsertedId = null;
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
    phase_progress: { phase_0: 50, phase_1: 25 },
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
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
    status: 'pending',
    priority: 'medium',
    is_blocker: false,
    blocked_reason: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function dependencyRow(over: Record<string, any> = {}): any {
  return {
    id: 'd-1',
    user_id: 'u-1',
    from_project_id: 'p-1',
    to_project_id: 'p-2',
    kind: 'blocks',
    status: 'open',
    notes: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

// ═════════ createMilestone ═══════════════════════════════════════════════════

describe('createMilestone with Phase 6 fields', () => {
  it('inserts with status / priority / is_blocker / blocked_reason', async () => {
    // createMilestone -> assertProjectOwnership -> getProject
    pushResult({ rows: [projectRow()], rowCount: 1 });
    // INSERT
    pushResult({ rows: [], rowCount: 1 });
    // getMilestone post-insert -> assertProjectOwnership -> getProject
    pushResult({ rows: [projectRow()], rowCount: 1 });
    // getMilestone -> SELECT row
    pushResult({
      rows: [
        milestoneRow({
          status: 'at_risk',
          priority: 'high',
          is_blocker: true,
          blocked_reason: 'Awaiting fixture',
          label: 'Spindle aligned',
        }),
      ],
      rowCount: 1,
    });

    const m = await createMilestone('p-1', 'u-1', {
      label: 'Spindle aligned',
      status: 'at_risk',
      priority: 'high',
      isBlocker: true,
      blockedReason: 'Awaiting fixture',
    });
    expect(m.status).toBe('at_risk');
    expect(m.priority).toBe('high');
    expect(m.isBlocker).toBe(true);
    expect(m.blockedReason).toBe('Awaiting fixture');

    const insert = calls.find((c) => /^INSERT INTO agos_maker_build_milestones/.test(c.sql));
    expect(insert).toBeTruthy();
    expect(insert!.params).toContain('at_risk');
    expect(insert!.params).toContain('high');
    expect(insert!.params).toContain(true);
    expect(insert!.params).toContain('Awaiting fixture');
  });

  it('rejects unknown status', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    await expect(
      createMilestone('p-1', 'u-1', {
        label: 'x',
        status: 'bogus' as any,
      }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('rejects unknown priority', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    await expect(
      createMilestone('p-1', 'u-1', {
        label: 'x',
        priority: 'urgent' as any,
      }),
    ).rejects.toThrow(/Invalid priority/);
  });

  it('defaults to status=pending priority=medium when fields omitted', async () => {
    // createMilestone -> assertProjectOwnership -> getProject
    pushResult({ rows: [projectRow()], rowCount: 1 });
    // INSERT
    pushResult({ rows: [], rowCount: 1 });
    // getMilestone -> assertProjectOwnership -> getProject
    pushResult({ rows: [projectRow()], rowCount: 1 });
    // getMilestone -> SELECT row
    pushResult({ rows: [milestoneRow()], rowCount: 1 });

    await createMilestone('p-1', 'u-1', { label: 'x' });
    const insert = calls.find((c) =>
      /^INSERT INTO agos_maker_build_milestones/.test(c.sql),
    );
    expect(insert!.params).toContain('pending');
    expect(insert!.params).toContain('medium');
    expect(insert!.params).toContain(false);
  });
});

// ═════════ updateMilestone — completed_at sync ═══════════════════════════════

describe('updateMilestone keeps completed_at in sync with status=done', () => {
  it('SQL fragment sets completed_at to now() when status moves to done', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({
      rows: [milestoneRow({ status: 'done', completed_at: new Date() })],
      rowCount: 1,
    });

    await updateMilestone('m-1', 'p-1', 'u-1', { status: 'done' });
    const upd = calls.find((c) => /^UPDATE agos_maker_build_milestones/.test(c.sql));
    expect(upd).toBeTruthy();
    expect(upd!.sql).toMatch(/completed_at\s*=\s*CASE/);
    expect(upd!.sql).toMatch(/WHEN \$8 = 'done' AND completed_at IS NULL THEN now\(\)/);
    expect(upd!.sql).toMatch(/WHEN \$8 IS NOT NULL AND \$8 <> 'done' THEN NULL/);
  });

  it('rejects unknown status', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    await expect(
      updateMilestone('m-1', 'p-1', 'u-1', { status: 'bogus' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('rejects unknown priority', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    await expect(
      updateMilestone('m-1', 'p-1', 'u-1', { priority: 'urgent' as any }),
    ).rejects.toThrow(/Invalid priority/);
  });
});

// ═════════ createProjectDependency ═══════════════════════════════════════════

describe('createProjectDependency', () => {
  it('rejects self-loops before hitting the DB', async () => {
    await expect(
      createProjectDependency('p-1', 'u-1', { toProjectId: 'p-1' }),
    ).rejects.toThrow(/cannot depend on itself/);
    expect(calls).toHaveLength(0);
  });

  it('404 if peer project is not owned by the user', async () => {
    // assertProjectOwnership on from
    pushResult({ rows: [projectRow()], rowCount: 1 });
    // getProject on peer returns empty
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      createProjectDependency('p-1', 'u-1', { toProjectId: 'p-2' }),
    ).rejects.toThrow(/Peer project not found/);
  });

  it('rejects unknown kind', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [projectRow({ id: 'p-2' })], rowCount: 1 });
    await expect(
      createProjectDependency('p-1', 'u-1', {
        toProjectId: 'p-2',
        kind: 'bogus' as any,
      }),
    ).rejects.toThrow(/Invalid kind/);
  });

  it('happy path: inserts with the expected params', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [projectRow({ id: 'p-2' })], rowCount: 1 });
    pushResult({ rows: [], rowCount: 1 });
    // getProjectDependency post-insert
    pushResult({ rows: [projectRow()], rowCount: 1 }); // assertProjectOwnership in getProjectDependency
    pushResult({ rows: [dependencyRow()], rowCount: 1 });

    const dep = await createProjectDependency('p-1', 'u-1', {
      toProjectId: 'p-2',
      kind: 'blocks',
      notes: 'Awaiting spindle',
    });
    expect(dep.fromProjectId).toBe('p-1');
    expect(dep.toProjectId).toBe('p-2');
    expect(dep.kind).toBe('blocks');
    const insert = calls.find((c) =>
      /^INSERT INTO agos_maker_project_dependencies/.test(c.sql),
    );
    expect(insert).toBeTruthy();
    expect(insert!.params).toContain('u-1');
    expect(insert!.params).toContain('p-1');
    expect(insert!.params).toContain('p-2');
    expect(insert!.params).toContain('blocks');
    expect(insert!.params).toContain('Awaiting spindle');
  });
});

// ═════════ updateProjectDependency ═══════════════════════════════════════════

describe('updateProjectDependency', () => {
  it('rejects unknown status', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    await expect(
      updateProjectDependency('d-1', 'p-1', 'u-1', { status: 'bogus' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('rejects unknown kind', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    await expect(
      updateProjectDependency('d-1', 'p-1', 'u-1', { kind: 'bogus' as any }),
    ).rejects.toThrow(/Invalid kind/);
  });

  it('happy path: SQL touches the right COALESCE params', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [], rowCount: 1 });
    // getProjectDependency
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [dependencyRow({ status: 'cleared' })], rowCount: 1 });

    const dep = await updateProjectDependency('d-1', 'p-1', 'u-1', {
      status: 'cleared',
      notes: 'resolved',
    });
    expect(dep?.status).toBe('cleared');
    const upd = calls.find((c) =>
      /^UPDATE agos_maker_project_dependencies/.test(c.sql),
    );
    expect(upd).toBeTruthy();
    expect(upd!.sql).toMatch(/kind\s*=\s*COALESCE\(\$4/);
    expect(upd!.sql).toMatch(/status\s*=\s*COALESCE\(\$5/);
  });
});

// ═════════ deleteProjectDependency ═══════════════════════════════════════════

describe('deleteProjectDependency', () => {
  it('issues DELETE with the right where-clause', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [], rowCount: 1 });
    const ok = await deleteProjectDependency('d-1', 'p-1', 'u-1');
    expect(ok).toBe(true);
    const del = calls.find((c) =>
      /^DELETE FROM agos_maker_project_dependencies/.test(c.sql),
    );
    expect(del).toBeTruthy();
    expect(del!.sql).toMatch(/WHERE id = \$1 AND from_project_id = \$2 AND user_id = \$3/);
  });

  it('returns false when no row deleted', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [], rowCount: 0 });
    const ok = await deleteProjectDependency('d-1', 'p-1', 'u-1');
    expect(ok).toBe(false);
  });
});

// ═════════ getProjectDependency ═══════════════════════════════════════════════

describe('getProjectDependency', () => {
  it('returns null when row absent', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [], rowCount: 0 });
    const dep = await getProjectDependency('d-1', 'p-1', 'u-1');
    expect(dep).toBeNull();
  });

  it('hydrates the row into the entity shape', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    pushResult({ rows: [dependencyRow()], rowCount: 1 });
    const dep = await getProjectDependency('d-1', 'p-1', 'u-1');
    expect(dep).not.toBeNull();
    expect(dep!.id).toBe('d-1');
    expect(dep!.kind).toBe('blocks');
    expect(dep!.status).toBe('open');
  });
});

// ═════════ listProjectDependencies ═══════════════════════════════════════════

describe('listProjectDependencies', () => {
  it('joins on agos_maker_projects with user_id filter on both sides', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    // upstream
    pushResult({
      rows: [
        {
          ...dependencyRow(),
          peer_id: 'p-2',
          peer_name: 'Sub-build',
          peer_status: 'in_progress',
          peer_phase_progress: { phase_0: 100, phase_1: 50 },
        },
      ],
      rowCount: 1,
    });
    // downstream
    pushResult({ rows: [], rowCount: 0 });

    const view = await listProjectDependencies('p-1', 'u-1');
    expect(view.upstream).toHaveLength(1);
    expect(view.upstream[0]!.peer.name).toBe('Sub-build');
    expect(view.upstream[0]!.peer.phase).toBe(75); // (100+50)/2
    expect(view.downstream).toHaveLength(0);

    const upstreamQ = calls.find((c) =>
      /WHERE d\.from_project_id = \$1/.test(c.sql),
    );
    expect(upstreamQ).toBeTruthy();
    // Cross-ownership: peer must also belong to the caller.
    expect(upstreamQ!.sql).toMatch(/AND peer\.user_id = \$2/);
    const downstreamQ = calls.find((c) =>
      /WHERE d\.to_project_id = \$1/.test(c.sql),
    );
    expect(downstreamQ).toBeTruthy();
    expect(downstreamQ!.sql).toMatch(/AND peer\.user_id = \$2/);
  });

  it('drops edges whose peer is not owned by the caller', async () => {
    pushResult({ rows: [projectRow()], rowCount: 1 });
    // The repo joins against peer.user_id = $2, so cross-ownership-leaked
    // rows are filtered server-side. We simulate by returning empty.
    pushResult({ rows: [], rowCount: 0 });
    pushResult({ rows: [], rowCount: 0 });
    const view = await listProjectDependencies('p-1', 'u-1');
    expect(view.upstream).toHaveLength(0);
    expect(view.downstream).toHaveLength(0);
  });
});

// ═════════ listTopBlockers ═══════════════════════════════════════════════════

describe('listTopBlockers', () => {
  it('queries milestones + dependencies and ranks results', async () => {
    // milestones query
    pushResult({
      rows: [
        {
          id: 'm-1',
          project_id: 'p-1',
          project_name: 'CNC',
          label: 'Spindle aligned',
          status: 'blocked',
          due_at: '2026-05-12',
          blocked_reason: 'Awaiting fixture',
          created_at: new Date('2026-05-09T00:00:00Z'),
        },
        {
          id: 'm-2',
          project_id: 'p-1',
          project_name: 'CNC',
          label: 'Frame ready',
          status: 'at_risk',
          due_at: '2026-05-13',
          blocked_reason: null,
          created_at: new Date('2026-05-08T00:00:00Z'),
        },
        {
          id: 'm-3',
          project_id: 'p-1',
          project_name: 'CNC',
          label: 'Old miss',
          status: 'pending',
          due_at: '2026-04-01',
          blocked_reason: null,
          created_at: new Date('2026-04-01T00:00:00Z'),
        },
      ],
      rowCount: 3,
    });
    // dependencies query
    pushResult({
      rows: [
        {
          id: 'd-1',
          from_project_id: 'p-1',
          to_project_id: 'p-2',
          notes: null,
          created_at: new Date('2026-05-10T00:00:00Z'),
          from_name: 'CNC',
          to_name: 'PSU',
        },
      ],
      rowCount: 1,
    });

    const items = await listTopBlockers('u-1', {
      today: new Date('2026-05-11T12:00:00Z'),
    });
    // Order: blocked > overdue > at_risk > open_dependency.
    expect(items.map((i) => i.severity)).toEqual([
      'blocked',
      'overdue',
      'at_risk',
      'open_dependency',
    ]);
  });

  it('honors the limit option', async () => {
    pushResult({
      rows: Array.from({ length: 30 }, (_, i) => ({
        id: `m-${i}`,
        project_id: 'p-1',
        project_name: 'P',
        label: `m${i}`,
        status: 'blocked',
        due_at: null,
        blocked_reason: null,
        created_at: new Date(2026, 4, i + 1),
      })),
      rowCount: 30,
    });
    pushResult({ rows: [], rowCount: 0 });
    const items = await listTopBlockers('u-1', { limit: 5 });
    expect(items).toHaveLength(5);
  });

  it('filters milestone-side server-query by user_id + status + due_at logic', async () => {
    pushResult({ rows: [], rowCount: 0 });
    pushResult({ rows: [], rowCount: 0 });
    await listTopBlockers('u-1', { today: new Date('2026-05-11T12:00:00Z') });
    const mq = calls.find((c) =>
      /FROM agos_maker_build_milestones/.test(c.sql),
    );
    expect(mq).toBeTruthy();
    expect(mq!.sql).toMatch(/WHERE p\.user_id = \$1/);
    expect(mq!.sql).toMatch(/m\.status IN \('missed','blocked'\)/);
    expect(mq!.sql).toMatch(/m\.status = 'at_risk'/);
    expect(mq!.sql).toMatch(/m\.due_at < \$2::date/);
  });

  it('filters dependency-side query by status=open AND kind=blocks AND user', async () => {
    pushResult({ rows: [], rowCount: 0 });
    pushResult({ rows: [], rowCount: 0 });
    await listTopBlockers('u-1');
    const dq = calls.find((c) =>
      /FROM agos_maker_project_dependencies/.test(c.sql),
    );
    expect(dq).toBeTruthy();
    expect(dq!.sql).toMatch(/d\.status = 'open'/);
    expect(dq!.sql).toMatch(/d\.kind\s+= 'blocks'/);
    expect(dq!.sql).toMatch(/p_from\.user_id = \$1/);
    expect(dq!.sql).toMatch(/p_to\.user_id\s+= \$1/);
  });
});
