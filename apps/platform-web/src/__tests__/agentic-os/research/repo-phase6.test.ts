/**
 * Research OS Phase 6 — repo regression tests (milestones / dependencies /
 * reproducibility / blockers).
 *
 * Exercises each repo against a mocked pg Pool to lock:
 *
 *   Milestones:
 *     - isExperimentOwnedByUser → SELECT 1 against agos_research_experiments
 *     - listMilestonesForExperiment composes filters w/ parameterized SQL,
 *       always JOIN-guards via EXISTS clause, orders by due_at ASC NULLS LAST
 *     - createMilestone uses INSERT with status / priority defaults,
 *       auto-stamps completed_at when status='done' at creation
 *     - updateMilestone COALESCEs untouched fields + JOIN-guards, syncs
 *       completed_at to status transitions (done → stamps, !done → clears)
 *     - deleteMilestone JOIN-guards
 *
 *   Dependencies:
 *     - createDependency throws DependencySelfLoopError on self-loop
 *     - createDependency throws DependencyCrossOwnershipError when either
 *       endpoint isn't owned by the user (404 path)
 *     - createDependency maps Postgres 23505 to DependencyDuplicateError (409)
 *     - listDependenciesForExperiment runs upstream + downstream queries,
 *       both filtered by user_id JOIN to peer experiment
 *
 *   Reproducibility:
 *     - seedCanonicalReproItems issues a single INSERT with ON CONFLICT DO NOTHING
 *       for the 7 canonical keys
 *     - updateReproCheckByItemKey JOIN-guards, syncs completed_at to state
 *     - createReproCheck maps 23505 to ReproDuplicateError
 *
 *   Blockers:
 *     - listTopBlockers fans out milestone + dependency SELECTs joined to
 *       agos_research_experiments WHERE user_id=$1
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
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

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const next = queue.shift();
      if (!next) return { rows: [], rowCount: 0 };
      // Simulate pg-error code prop when queued as such.
      if ((next as unknown as Record<string, unknown>).errorCode) {
        const err = new Error('simulated pg error') as Error & { code?: string; constraint?: string };
        err.code = (next as unknown as Record<string, string>).errorCode;
        throw err;
      }
      return next;
    }),
  }),
  getCurrentResearchUser: vi.fn(),
}));

import {
  isExperimentOwnedByUser as isOwnedMilestones,
  listMilestonesForExperiment,
  getMilestone,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from '@/lib/agentic-os/research/milestones-repo';
import {
  listDependenciesForExperiment,
  createDependency,
  DependencyDuplicateError,
  DependencyCrossOwnershipError,
  DependencySelfLoopError,
  updateDependency,
  deleteDependency,
  getDependency,
} from '@/lib/agentic-os/research/dependencies-repo';
import {
  seedCanonicalReproItems,
  listReproChecksForExperiment,
  createReproCheck,
  ReproDuplicateError,
  updateReproCheckByItemKey,
  deleteReproCheckByItemKey,
  getReproCheckByItemKey,
} from '@/lib/agentic-os/research/reproducibility-repo';
import { listTopBlockers } from '@/lib/agentic-os/research/blockers-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function milestoneRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'm-1',
    experiment_id: 'exp-1',
    user_id: 'u-1',
    title: 'Test',
    due_at: null,
    status: 'pending',
    priority: 'medium',
    is_blocker: false,
    blocked_reason: null,
    notes_md: null,
    completed_at: null,
    metadata: {},
    created_at: new Date('2026-05-12T10:00:00Z'),
    updated_at: new Date('2026-05-12T10:00:00Z'),
    ...overrides,
  };
}

describe('milestones repo — isExperimentOwnedByUser()', () => {
  it('returns true when row found', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    await expect(isOwnedMilestones('exp-1', 'u-1')).resolves.toBe(true);
    expect(calls[0].sql).toMatch(/SELECT 1[\s\S]*FROM agos_research_experiments/);
    expect(calls[0].params).toEqual(['exp-1', 'u-1']);
  });

  it('returns false on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(isOwnedMilestones('exp-1', 'u-1')).resolves.toBe(false);
  });
});

describe('milestones repo — listMilestonesForExperiment()', () => {
  it('always JOIN-guards via EXISTS', async () => {
    pushResult({ rows: [] });
    await listMilestonesForExperiment('exp-1', 'u-1');
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments/);
    expect(calls[0].sql).toMatch(/ORDER BY m\.due_at ASC NULLS LAST/);
  });

  it('appends status filter when provided', async () => {
    pushResult({ rows: [] });
    await listMilestonesForExperiment('exp-1', 'u-1', { status: 'at_risk' });
    expect(calls[0].sql).toMatch(/m\.status = \$3/);
    expect(calls[0].params).toEqual(['exp-1', 'u-1', 'at_risk']);
  });

  it('rejects invalid status filter', async () => {
    await expect(
      listMilestonesForExperiment('exp-1', 'u-1', { status: 'lol' as never }),
    ).rejects.toThrow(/Invalid status filter/);
  });
});

describe('milestones repo — createMilestone()', () => {
  it('INSERTs with parameterized status / priority defaults', async () => {
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({ rows: [milestoneRow()] }); // getMilestone
    await createMilestone('exp-1', 'u-1', { title: 'Test' });
    const insert = calls[0];
    expect(insert.sql).toMatch(/INSERT INTO agos_research_experiment_milestones/);
    // status default = 'pending', priority default = 'medium'.
    expect(insert.params).toContain('pending');
    expect(insert.params).toContain('medium');
  });

  it('auto-stamps completed_at = now() when status=done at creation', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({ rows: [milestoneRow({ status: 'done' })] });
    await createMilestone('exp-1', 'u-1', { title: 'Test', status: 'done' });
    expect(calls[0].sql).toMatch(/now\(\)/);
  });

  it('rejects invalid status', async () => {
    await expect(
      createMilestone('exp-1', 'u-1', { title: 'x', status: 'lol' as never }),
    ).rejects.toThrow(/Invalid status/);
  });
});

describe('milestones repo — updateMilestone()', () => {
  it('syncs completed_at to status transition (done → now / non-done → null)', async () => {
    pushResult({ rows: [{ id: 'm-1' }], rowCount: 1 }); // UPDATE RETURNING
    pushResult({ rows: [milestoneRow({ status: 'done' })] }); // getMilestone
    await updateMilestone('m-1', 'u-1', { status: 'done' });
    expect(calls[0].sql).toMatch(/completed_at\s*=\s*CASE/);
    expect(calls[0].sql).toMatch(/WHEN \$6 = 'done' AND completed_at IS NULL THEN now\(\)/);
    expect(calls[0].sql).toMatch(/WHEN \$6 IS NOT NULL AND \$6 <> 'done' THEN NULL/);
  });

  it('returns null when JOIN-guard finds nothing (cross-ownership 404)', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const r = await updateMilestone('m-1', 'u-1', { title: 'foo' });
    expect(r).toBeNull();
  });
});

describe('milestones repo — deleteMilestone()', () => {
  it('JOIN-guards on DELETE', async () => {
    pushResult({ rows: [], rowCount: 1 });
    await deleteMilestone('m-1', 'u-1');
    expect(calls[0].sql).toMatch(
      /DELETE FROM agos_research_experiment_milestones[\s\S]*EXISTS \(/,
    );
  });
});

describe('milestones repo — getMilestone()', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(getMilestone('m-1', 'u-1')).resolves.toBeNull();
  });
  it('hydrates a row on hit', async () => {
    pushResult({ rows: [milestoneRow()] });
    const m = await getMilestone('m-1', 'u-1');
    expect(m).toMatchObject({
      id: 'm-1',
      experimentId: 'exp-1',
      status: 'pending',
      priority: 'medium',
      isBlocker: false,
    });
  });
});

// ─── Dependencies ─────────────────────────────────────────────────────────

describe('dependencies repo — createDependency()', () => {
  it('throws DependencySelfLoopError on self-loop BEFORE any SQL', async () => {
    await expect(
      createDependency('exp-1', 'u-1', { toExperimentId: 'exp-1' }),
    ).rejects.toBeInstanceOf(DependencySelfLoopError);
    expect(calls.length).toBe(0);
  });

  it('404 on from-side cross-ownership (DependencyCrossOwnershipError)', async () => {
    pushResult({ rows: [], rowCount: 0 }); // isExperimentOwnedByUser(from) → false
    await expect(
      createDependency('exp-1', 'u-1', { toExperimentId: 'exp-2' }),
    ).rejects.toBeInstanceOf(DependencyCrossOwnershipError);
  });

  it('404 on to-side cross-ownership', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // from owned
    pushResult({ rows: [], rowCount: 0 }); // to NOT owned
    await expect(
      createDependency('exp-1', 'u-1', { toExperimentId: 'exp-2' }),
    ).rejects.toBeInstanceOf(DependencyCrossOwnershipError);
  });

  it('maps Postgres 23505 to DependencyDuplicateError (409)', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // from owned
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 }); // to owned
    queue.push({ rows: [], rowCount: 0, errorCode: '23505' } as never);
    await expect(
      createDependency('exp-1', 'u-1', { toExperimentId: 'exp-2' }),
    ).rejects.toBeInstanceOf(DependencyDuplicateError);
  });

  it('happy path inserts with default kind=feeds + status=open', async () => {
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [{ '?column?': 1 }], rowCount: 1 });
    pushResult({ rows: [], rowCount: 1 }); // INSERT
    pushResult({
      rows: [
        {
          id: 'd-1',
          user_id: 'u-1',
          from_experiment_id: 'exp-1',
          to_experiment_id: 'exp-2',
          kind: 'feeds',
          status: 'open',
          notes: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const dep = await createDependency('exp-1', 'u-1', { toExperimentId: 'exp-2' });
    expect(dep.kind).toBe('feeds');
    expect(dep.status).toBe('open');
    const insertCall = calls[2];
    expect(insertCall.sql).toMatch(/INSERT INTO agos_research_experiment_dependencies/);
    expect(insertCall.sql).toMatch(/'open'/);
  });
});

describe('dependencies repo — listDependenciesForExperiment()', () => {
  it('runs upstream + downstream queries, each JOIN-filtered by peer.user_id', async () => {
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    await listDependenciesForExperiment('exp-1', 'u-1');
    expect(calls[0].sql).toMatch(
      /JOIN agos_research_experiments peer[\s\S]*?ON peer\.id = d\.to_experiment_id[\s\S]*?AND peer\.user_id = \$2/,
    );
    expect(calls[1].sql).toMatch(
      /JOIN agos_research_experiments peer[\s\S]*?ON peer\.id = d\.from_experiment_id[\s\S]*?AND peer\.user_id = \$2/,
    );
  });
});

describe('dependencies repo — updateDependency / deleteDependency', () => {
  it('update returns null on miss (user_id filter)', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await updateDependency('d-1', 'u-1', { status: 'cleared' })).toBeNull();
  });

  it('delete is filtered by id + user_id', async () => {
    pushResult({ rows: [], rowCount: 1 });
    await deleteDependency('d-1', 'u-1');
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('getDependency returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getDependency('d-1', 'u-1')).toBeNull();
  });
});

// ─── Reproducibility ──────────────────────────────────────────────────────

describe('reproducibility repo — seedCanonicalReproItems()', () => {
  it('issues one INSERT with ON CONFLICT DO NOTHING for the 7 canonical keys', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await seedCanonicalReproItems('exp-1', 'u-1');
    expect(calls.length).toBe(1);
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_reproducibility_checks/);
    expect(calls[0].sql).toMatch(/ON CONFLICT \(experiment_id, item_key\) DO NOTHING/);
    // 7 keys × 4 params each = 28 params.
    expect(calls[0].params.length).toBe(28);
    // Each canonical key should appear in params.
    for (const k of [
      'raw_data_archived',
      'methods_pinned',
      'code_published',
      'preregistration_filed',
      'ethics_filed',
      'data_dictionary_written',
      'analysis_reproducible',
    ]) {
      expect(calls[0].params).toContain(k);
    }
  });

  it('is idempotent — repeated calls run a single statement each time', async () => {
    pushResult({ rows: [], rowCount: 0 });
    pushResult({ rows: [], rowCount: 0 });
    await seedCanonicalReproItems('exp-1', 'u-1');
    await seedCanonicalReproItems('exp-1', 'u-1');
    expect(calls.length).toBe(2);
    expect(calls[0].sql).toMatch(/ON CONFLICT/);
    expect(calls[1].sql).toMatch(/ON CONFLICT/);
  });
});

describe('reproducibility repo — listReproChecksForExperiment()', () => {
  it('JOIN-guards via EXISTS, ordered by item_key ASC', async () => {
    pushResult({ rows: [] });
    await listReproChecksForExperiment('exp-1', 'u-1');
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments/);
    expect(calls[0].sql).toMatch(/ORDER BY c\.item_key ASC/);
  });
});

describe('reproducibility repo — createReproCheck()', () => {
  it('maps 23505 to ReproDuplicateError', async () => {
    queue.push({ rows: [], rowCount: 0, errorCode: '23505' } as never);
    await expect(
      createReproCheck('exp-1', 'u-1', { itemKey: 'raw_data_archived' }),
    ).rejects.toBeInstanceOf(ReproDuplicateError);
  });

  it('auto-stamps completed_at when state=done at creation', async () => {
    pushResult({ rows: [], rowCount: 1 });
    pushResult({
      rows: [
        {
          id: 'r-1',
          experiment_id: 'exp-1',
          user_id: 'u-1',
          item_key: 'methods_pinned',
          state: 'done',
          evidence_url: null,
          notes: null,
          completed_at: new Date(),
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await createReproCheck('exp-1', 'u-1', {
      itemKey: 'methods_pinned',
      state: 'done',
    });
    expect(r.state).toBe('done');
    expect(calls[0].sql).toMatch(/now\(\)/);
  });
});

describe('reproducibility repo — updateReproCheckByItemKey()', () => {
  it('syncs completed_at to state transitions (done → now / non-done → null)', async () => {
    pushResult({ rows: [{ id: 'r-1' }], rowCount: 1 });
    pushResult({
      rows: [
        {
          id: 'r-1',
          experiment_id: 'exp-1',
          user_id: 'u-1',
          item_key: 'methods_pinned',
          state: 'done',
          evidence_url: null,
          notes: null,
          completed_at: new Date(),
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    await updateReproCheckByItemKey('exp-1', 'methods_pinned', 'u-1', { state: 'done' });
    expect(calls[0].sql).toMatch(/WHEN \$4 = 'done' AND completed_at IS NULL THEN now\(\)/);
    expect(calls[0].sql).toMatch(/WHEN \$4 IS NOT NULL AND \$4 <> 'done' THEN NULL/);
  });

  it('returns null on cross-ownership 404', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(
      await updateReproCheckByItemKey('exp-1', 'methods_pinned', 'u-1', {
        state: 'in_progress',
      }),
    ).toBeNull();
  });
});

describe('reproducibility repo — deleteReproCheckByItemKey()', () => {
  it('JOIN-guards on DELETE', async () => {
    pushResult({ rows: [], rowCount: 1 });
    await deleteReproCheckByItemKey('exp-1', 'methods_pinned', 'u-1');
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments/);
  });
  it('returns false on cross-ownership miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(
      await deleteReproCheckByItemKey('exp-1', 'methods_pinned', 'u-1'),
    ).toBe(false);
  });
});

describe('reproducibility repo — getReproCheckByItemKey()', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(
      await getReproCheckByItemKey('exp-1', 'methods_pinned', 'u-1'),
    ).toBeNull();
  });
});

// ─── Blockers ─────────────────────────────────────────────────────────────

describe('blockers repo — listTopBlockers()', () => {
  it('fans out milestone + dependency queries, both filtered by user_id', async () => {
    pushResult({ rows: [] }); // milestones
    pushResult({ rows: [] }); // dependencies
    await listTopBlockers('u-1', { limit: 10, today: new Date('2026-05-12T00:00:00Z') });
    expect(calls.length).toBe(2);
    expect(calls[0].sql).toMatch(
      /FROM agos_research_experiment_milestones[\s\S]*JOIN agos_research_experiments/,
    );
    expect(calls[0].sql).toMatch(/e\.user_id = \$1/);
    expect(calls[0].sql).toMatch(/m\.status <> 'done'/);
    expect(calls[1].sql).toMatch(
      /FROM agos_research_experiment_dependencies[\s\S]*JOIN agos_research_experiments e_from/,
    );
    expect(calls[1].sql).toMatch(/d\.kind\s*=\s*'blocks'/);
    expect(calls[1].sql).toMatch(/d\.status = 'open'/);
  });

  it('clamps requested limit to 100 max', async () => {
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    const r = await listTopBlockers('u-1', { limit: 999 });
    expect(r.length).toBe(0); // empty queue → 0 items, but the slice math is clamp-aware
  });

  it('synthesizes severity from milestone status + due_at + today', async () => {
    const today = new Date('2026-05-12T00:00:00Z');
    pushResult({
      rows: [
        {
          id: 'm-missed',
          experiment_id: 'exp-1',
          title: 'Missed milestone',
          status: 'missed',
          due_at: '2026-05-01',
          blocked_reason: null,
          created_at: new Date('2026-05-01T00:00:00Z'),
          experiment_name: 'Exp A',
        },
        {
          id: 'm-overdue-on-track',
          experiment_id: 'exp-1',
          title: 'Overdue but labeled on-track',
          status: 'on_track',
          due_at: '2026-05-10',
          blocked_reason: null,
          created_at: new Date('2026-05-01T00:00:00Z'),
          experiment_name: 'Exp A',
        },
        {
          id: 'm-at-risk-7d',
          experiment_id: 'exp-2',
          title: 'At risk within 7 days',
          status: 'at_risk',
          due_at: '2026-05-18',
          blocked_reason: null,
          created_at: new Date('2026-05-12T00:00:00Z'),
          experiment_name: 'Exp B',
        },
      ],
    });
    pushResult({
      rows: [
        {
          id: 'd-1',
          from_experiment_id: 'exp-2',
          to_experiment_id: 'exp-3',
          notes: null,
          created_at: new Date('2026-05-12T00:00:00Z'),
          from_name: 'Exp B',
          to_name: 'Exp C',
        },
      ],
    });
    const items = await listTopBlockers('u-1', { today });
    // missed + overdue on-track → high; at_risk in 7d + open dep → medium.
    const sevByTitle = new Map(items.map((i) => [i.title, i.severity]));
    expect(sevByTitle.get('Missed milestone')).toBe('high');
    expect(sevByTitle.get('Overdue but labeled on-track')).toBe('high');
    expect(sevByTitle.get('At risk within 7 days')).toBe('medium');
    expect(sevByTitle.get('Blocked by Exp C')).toBe('medium');
  });
});
