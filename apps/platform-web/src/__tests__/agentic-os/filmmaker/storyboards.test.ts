/**
 * Filmmaker OS — Storyboard test suite.
 *
 * Repo plumbing against a mocked pg Pool.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  STORYBOARD_STATUS_VALUES,
  STORYBOARD_STATUSES,
} from '@/lib/agentic-os/filmmaker/storyboards';

// ─── Pure helpers ──────────────────────────────────────────────────────────

describe('STORYBOARD_STATUS_VALUES', () => {
  it('matches STORYBOARD_STATUSES order', () => {
    expect([...STORYBOARD_STATUS_VALUES]).toEqual(
      STORYBOARD_STATUSES.map((s) => s.status),
    );
  });
});

// ─── Repo plumbing (mocked pg) ─────────────────────────────────────────────

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];
const txCalls: { sql: string; params: unknown[] }[] = [];
let released = 0;

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

function makeClient() {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      txCalls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
    release: vi.fn(() => {
      released += 1;
    }),
  };
}

vi.mock('@/lib/agentic-os/filmmaker/session', () => ({
  getFilmmakerPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => makeClient()),
  }),
}));

import {
  listStoryboards,
  getStoryboard,
  createStoryboard,
  updateStoryboard,
  deleteStoryboard,
  addStoryboardPanel,
  updateStoryboardPanel,
  deleteStoryboardPanel,
  reorderStoryboardPanels,
  movePanel,
} from '@/lib/agentic-os/filmmaker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  txCalls.length = 0;
  released = 0;
});

function projectRow(): unknown {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'My Film',
    description: null,
    status: 'pre_production',
    tags: [],
    format: 'feature',
    logline: null,
    cover_image_url: null,
    phase_progress: {
      development: 0,
      pre_production: 0,
      production: 0,
      post_production: 0,
      distribution: 0,
    },
    target_completion_date: null,
    team_size: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function storyboardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sb-1',
    project_id: 'p-1',
    name: 'Storyboard 1',
    description: null,
    scene_id: null,
    status: 'draft',
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function panelRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pa-1',
    storyboard_id: 'sb-1',
    position: 1,
    image_url: null,
    camera_angle: null,
    camera_move: null,
    shot_size: null,
    description: null,
    dialogue_excerpt: null,
    duration_seconds: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── listStoryboards ───────────────────────────────────────────────────────

describe('listStoryboards', () => {
  it('joins through project ownership and returns summaries', async () => {
    pushResult({
      rows: [
        {
          id: 'sb-1',
          name: 'Storyboard 1',
          status: 'draft',
          scene_id: null,
          updated_at: new Date('2026-01-01T00:00:00Z'),
          panel_count: 3,
        },
        {
          id: 'sb-2',
          name: 'Storyboard 2',
          status: 'approved',
          scene_id: 'sc-1',
          updated_at: new Date('2026-01-02T00:00:00Z'),
          panel_count: 7,
        },
      ],
    });
    const out = await listStoryboards({ projectId: 'p-1', userId: 'u-1' });
    expect(out).toHaveLength(2);
    expect(out[0].panelCount).toBe(3);
    expect(out[1].sceneId).toBe('sc-1');
    expect(calls[0].sql).toContain('p.user_id = $2');
  });
});

// ─── getStoryboard ─────────────────────────────────────────────────────────

describe('getStoryboard', () => {
  it('returns storyboard with ordered panels', async () => {
    pushResult({ rows: [storyboardRow()] });
    pushResult({
      rows: [
        panelRow({ id: 'pa-1', position: 1 }),
        panelRow({ id: 'pa-2', position: 2 }),
      ],
    });
    const sb = await getStoryboard('sb-1', 'u-1');
    expect(sb).not.toBeNull();
    expect(sb!.panels).toHaveLength(2);
    expect(sb!.panels[0].position).toBe(1);
  });

  it('returns null when not owned', async () => {
    pushResult({ rows: [] });
    const sb = await getStoryboard('sb-x', 'u-1');
    expect(sb).toBeNull();
  });
});

// ─── createStoryboard ──────────────────────────────────────────────────────

describe('createStoryboard', () => {
  it('rejects when project not owned', async () => {
    pushResult({ rows: [] }); // getProject
    await expect(
      createStoryboard({ projectId: 'p-x', userId: 'u-1', data: {} }),
    ).rejects.toThrow(/Project not found/);
  });

  it('creates with default name', async () => {
    pushResult({ rows: [projectRow()] }); // getProject
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [storyboardRow()] }); // refetch
    const sb = await createStoryboard({
      projectId: 'p-1',
      userId: 'u-1',
      data: {},
    });
    expect(sb.name).toBe('Storyboard 1');
  });
});

// ─── addStoryboardPanel — position auto-increment ──────────────────────────

describe('addStoryboardPanel', () => {
  it('throws when storyboard not owned', async () => {
    pushResult({ rows: [] }); // getStoryboardBare
    await expect(
      addStoryboardPanel({
        storyboardId: 'sb-x',
        userId: 'u-1',
        data: {},
      }),
    ).rejects.toThrow(/Storyboard not found/);
  });

  it('auto-assigns the next position transactionally', async () => {
    pushResult({ rows: [storyboardRow()] }); // getStoryboardBare
    // Tx
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [{ next_pos: 4 }] }); // SELECT next_pos
    pushResult({ rows: [] }); // INSERT panel
    pushResult({ rows: [] }); // UPDATE storyboard updated_at
    pushResult({ rows: [] }); // COMMIT
    // refetch via getStoryboardPanel (pool.query)
    pushResult({ rows: [panelRow({ position: 4 })] });

    const panel = await addStoryboardPanel({
      storyboardId: 'sb-1',
      userId: 'u-1',
      data: { description: 'Beat 1' },
    });
    expect(panel.position).toBe(4);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('BEGIN');
    expect(tx).toContain('INSERT INTO agos_filmmaker_storyboard_panels');
    expect(tx).toContain('COMMIT');
    expect(released).toBe(1);
  });
});

// ─── reorderStoryboardPanels ──────────────────────────────────────────────

describe('reorderStoryboardPanels', () => {
  it('throws when storyboard not owned', async () => {
    pushResult({ rows: [] });
    await expect(
      reorderStoryboardPanels('sb-x', 'u-1', []),
    ).rejects.toThrow(/Storyboard not found/);
  });

  it('reindexes panels 1..N (two passes for collision safety)', async () => {
    pushResult({ rows: [storyboardRow()] });
    pushResult({ rows: [] }); // BEGIN
    pushResult({
      rows: [{ id: 'pa-1' }, { id: 'pa-2' }, { id: 'pa-3' }],
    });
    // 3 panels × 2 passes (negative-parking + final positions) = 6 UPDATEs
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] }); // UPDATE storyboard.updated_at
    pushResult({ rows: [] }); // COMMIT

    await reorderStoryboardPanels('sb-1', 'u-1', ['pa-3', 'pa-1', 'pa-2']);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('UPDATE agos_filmmaker_storyboard_panels');
    // Final pass uses positions 1, 2, 3 — verify all three appear as params somewhere.
    const positionParams = txCalls
      .filter((c) =>
        c.sql.includes('UPDATE agos_filmmaker_storyboard_panels'),
      )
      .map((c) => c.params[1]);
    expect(positionParams).toContain(1);
    expect(positionParams).toContain(2);
    expect(positionParams).toContain(3);
    expect(released).toBe(1);
  });
});

// ─── movePanel — across storyboards ───────────────────────────────────────

describe('movePanel', () => {
  it('throws when panel not owned', async () => {
    pushResult({ rows: [] }); // getStoryboardPanel
    await expect(
      movePanel({
        panelId: 'pa-x',
        toStoryboardId: 'sb-2',
        toPosition: 1,
        userId: 'u-1',
      }),
    ).rejects.toThrow(/Panel not found/);
  });

  it('throws when destination storyboard not owned', async () => {
    pushResult({ rows: [panelRow()] }); // getStoryboardPanel
    pushResult({ rows: [] }); // getStoryboardBare for dest
    await expect(
      movePanel({
        panelId: 'pa-1',
        toStoryboardId: 'sb-other',
        toPosition: 1,
        userId: 'u-1',
      }),
    ).rejects.toThrow(/Destination storyboard/);
  });

  it('reindexes source + destination boards in a single transaction', async () => {
    pushResult({ rows: [panelRow({ position: 2 })] }); // getStoryboardPanel
    pushResult({ rows: [storyboardRow({ id: 'sb-2' })] }); // getStoryboardBare dest
    // Tx
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [] }); // UPDATE park at -1
    pushResult({ rows: [] }); // UPDATE shift source siblings up
    pushResult({ rows: [{ max_pos: 2 }] }); // max on dest
    pushResult({ rows: [] }); // UPDATE dest make room
    pushResult({ rows: [] }); // UPDATE finalize move
    pushResult({ rows: [] }); // UPDATE source storyboard.updated_at
    pushResult({ rows: [] }); // UPDATE dest storyboard.updated_at
    pushResult({ rows: [] }); // COMMIT
    // refetch
    pushResult({ rows: [panelRow({ storyboard_id: 'sb-2', position: 1 })] });

    const moved = await movePanel({
      panelId: 'pa-1',
      toStoryboardId: 'sb-2',
      toPosition: 1,
      userId: 'u-1',
    });
    expect(moved.storyboardId).toBe('sb-2');
    expect(moved.position).toBe(1);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx.match(/position = position - 1/g)?.length).toBeGreaterThan(0);
    expect(tx.match(/position = position \+ 1/g)?.length).toBeGreaterThan(0);
    expect(tx).toContain('COMMIT');
    expect(released).toBe(1);
  });
});

// ─── deleteStoryboardPanel reindexes siblings ─────────────────────────────

describe('deleteStoryboardPanel', () => {
  it('returns false when not owned', async () => {
    pushResult({ rows: [] });
    expect(await deleteStoryboardPanel('pa-x', 'u-1')).toBe(false);
  });

  it('deletes + reindexes siblings transactionally', async () => {
    pushResult({ rows: [panelRow({ position: 2 })] }); // getStoryboardPanel
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [] }); // DELETE
    pushResult({ rows: [] }); // UPDATE position - 1
    pushResult({ rows: [] }); // UPDATE storyboard updated_at
    pushResult({ rows: [] }); // COMMIT

    expect(await deleteStoryboardPanel('pa-1', 'u-1')).toBe(true);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('DELETE FROM agos_filmmaker_storyboard_panels');
    expect(tx).toContain('position = position - 1');
    expect(released).toBe(1);
  });
});

// ─── updateStoryboardPanel cross-user denied ──────────────────────────────

describe('updateStoryboardPanel', () => {
  it('returns null when cross-user', async () => {
    pushResult({ rows: [] }); // getStoryboardPanel returns nothing
    const out = await updateStoryboardPanel({
      id: 'pa-1',
      userId: 'u-other',
      patch: { description: 'hello' },
    });
    expect(out).toBeNull();
  });
});

// ─── deleteStoryboard cascades panels ──────────────────────────────────────

describe('deleteStoryboard', () => {
  it('returns false when not owned', async () => {
    pushResult({ rows: [] });
    expect(await deleteStoryboard('sb-x', 'u-1')).toBe(false);
  });

  it('issues a single DELETE — panels cascade at the DB layer', async () => {
    pushResult({ rows: [storyboardRow()] }); // getStoryboardBare
    pushResult({ rows: [] }); // DELETE
    expect(await deleteStoryboard('sb-1', 'u-1')).toBe(true);
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).toContain('DELETE FROM agos_filmmaker_storyboards');
  });
});

// ─── updateStoryboard validation ──────────────────────────────────────────

describe('updateStoryboard', () => {
  it('rejects unknown status', async () => {
    pushResult({ rows: [storyboardRow()] }); // getStoryboardBare
    await expect(
      updateStoryboard({
        id: 'sb-1',
        userId: 'u-1',
        patch: { status: 'invalid' as never },
      }),
    ).rejects.toThrow(/Invalid storyboard status/);
  });
});
