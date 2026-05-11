/**
 * Filmmaker OS — Schedule test suite.
 *
 * Domain helpers + repo plumbing against a mocked pg Pool.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SHOOTING_UNIT_VALUES,
  SHOOTING_DAY_STATUS_VALUES,
  SHOOTING_DAY_STATUSES,
  SHOOTING_UNITS,
  groupByUnit,
  totalShootMinutes,
  totalEighths,
  type ShootingDay,
  type ShootingDayWithStrips,
  type ScheduleStripJoined,
} from '@/lib/agentic-os/filmmaker/schedule';

// ─── Pure helpers ───────────────────────────────────────────────────────────

describe('SHOOTING_UNITS', () => {
  it('has three units in spec order', () => {
    expect(SHOOTING_UNITS.map((u) => u.unit)).toEqual([
      'main',
      'second_unit',
      'splinter',
    ]);
  });
  it('SHOOTING_UNIT_VALUES matches', () => {
    expect([...SHOOTING_UNIT_VALUES]).toEqual(SHOOTING_UNITS.map((u) => u.unit));
  });
});

describe('SHOOTING_DAY_STATUSES', () => {
  it('has four statuses', () => {
    expect(SHOOTING_DAY_STATUSES.map((s) => s.status)).toEqual([
      'planned',
      'in_progress',
      'completed',
      'cancelled',
    ]);
  });
  it('SHOOTING_DAY_STATUS_VALUES matches', () => {
    expect([...SHOOTING_DAY_STATUS_VALUES]).toEqual(
      SHOOTING_DAY_STATUSES.map((s) => s.status),
    );
  });
});

describe('groupByUnit', () => {
  it('returns three empty arrays for empty input', () => {
    expect(groupByUnit([])).toEqual({ main: [], second_unit: [], splinter: [] });
  });
  it('groups days into their unit bucket', () => {
    const day = (id: string, unit: any): ShootingDay => ({
      id,
      projectId: 'p',
      shootDate: null,
      dayNumber: 1,
      label: null,
      callTime: null,
      wrapTime: null,
      unit,
      status: 'planned',
      notes: null,
      metadata: {},
      createdAt: '',
      updatedAt: '',
    });
    const r = groupByUnit([
      day('a', 'main'),
      day('b', 'second_unit'),
      day('c', 'main'),
    ]);
    expect(r.main.map((d) => d.id)).toEqual(['a', 'c']);
    expect(r.second_unit.map((d) => d.id)).toEqual(['b']);
    expect(r.splinter).toEqual([]);
  });
});

describe('totalShootMinutes / totalEighths', () => {
  function strip(estMinutes: number | null, metaMinutes: number | null, eighths: number): ScheduleStripJoined {
    return {
      id: 's',
      shootingDayId: 'd',
      sceneId: 'sc',
      orderIndex: 0,
      estMinutes,
      notes: null,
      createdAt: '',
      updatedAt: '',
      scene: {
        id: 'sc',
        screenplayId: 's',
        versionId: 'v',
        sceneNumber: 1,
        heading: 'INT.',
        interior: true,
        location: null,
        timeOfDay: null,
        pageStart: null,
        eighths: null,
        dialogueWordCounts: {},
        actionText: null,
        dialogueText: null,
        metadata: {},
      },
      sceneMeta: {
        id: 'm',
        sceneId: 'sc',
        eighths,
        estShootMinutes: metaMinutes,
        notes: null,
        complexity: null,
        status: 'scheduled',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
    };
  }
  it('prefers strip estMinutes over scene fallback', () => {
    const day: ShootingDayWithStrips = {
      id: 'd',
      projectId: 'p',
      shootDate: null,
      dayNumber: 1,
      label: null,
      callTime: null,
      wrapTime: null,
      unit: 'main',
      status: 'planned',
      notes: null,
      metadata: {},
      createdAt: '',
      updatedAt: '',
      strips: [strip(30, 60, 8), strip(null, 45, 4)],
    };
    expect(totalShootMinutes(day)).toBe(75);
    expect(totalEighths(day)).toBe(12);
  });
});

// ─── Repo plumbing (mocked pg) ──────────────────────────────────────────────

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];
const txCalls: { sql: string; params: any[] }[] = [];
let released = 0;

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

function makeClient() {
  return {
    query: vi.fn(async (sql: string, params: any[] = []) => {
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
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => makeClient()),
  }),
}));

import {
  listShootingDays,
  createShootingDay,
  deleteShootingDay,
  addStripToDay,
  removeStripFromDay,
  moveStrip,
  reorderShootingDays,
  reorderStripsWithinDay,
} from '@/lib/agentic-os/filmmaker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  txCalls.length = 0;
  released = 0;
});

function projectRow(): any {
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

function dayRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'd-1',
    project_id: 'p-1',
    shoot_date: null,
    day_number: 1,
    label: null,
    call_time: null,
    wrap_time: null,
    unit: 'main',
    status: 'planned',
    notes: null,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function sceneRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'sc-1',
    screenplay_id: 's-1',
    version_id: 'v-1',
    scene_number: 1,
    heading: 'INT. ROOM - DAY',
    interior: true,
    location: 'ROOM',
    time_of_day: 'DAY',
    page_start: 0,
    eighths: null,
    dialogue_word_counts: {},
    action_text: null,
    dialogue_text: null,
    metadata: {},
    ...overrides,
  };
}

function stripRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'st-1',
    shooting_day_id: 'd-1',
    scene_id: 'sc-1',
    order_index: 0,
    est_minutes: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── listShootingDays ───────────────────────────────────────────────────────

describe('listShootingDays', () => {
  it('joins through project ownership', async () => {
    pushResult({ rows: [dayRow(), dayRow({ id: 'd-2', day_number: 2 })] });
    const days = await listShootingDays({ projectId: 'p-1', userId: 'u-1' });
    expect(days).toHaveLength(2);
    expect(calls[0].sql).toContain('p.user_id = $2');
  });

  it('rejects invalid unit filter', async () => {
    await expect(
      listShootingDays({ projectId: 'p-1', userId: 'u-1', unit: 'aerial' as any }),
    ).rejects.toThrow(/Invalid shooting unit/);
  });
});

// ─── createShootingDay ──────────────────────────────────────────────────────

describe('createShootingDay', () => {
  it('throws when project not owned', async () => {
    pushResult({ rows: [] }); // getProject
    await expect(
      createShootingDay({ projectId: 'p-x', userId: 'u-1', data: {} }),
    ).rejects.toThrow(/Project not found/);
  });

  it('auto-assigns next day_number per (project, unit)', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [{ next_num: 4 }] }); // SELECT next_num
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [dayRow({ day_number: 4 })] }); // refetch
    const d = await createShootingDay({
      projectId: 'p-1',
      userId: 'u-1',
      data: {},
    });
    expect(d.dayNumber).toBe(4);
  });
});

// ─── addStripToDay ──────────────────────────────────────────────────────────

describe('addStripToDay', () => {
  it('throws when day not owned', async () => {
    pushResult({ rows: [] }); // getShootingDayBare
    await expect(
      addStripToDay({
        shootingDayId: 'd-x',
        sceneId: 'sc-1',
        userId: 'u-1',
      }),
    ).rejects.toThrow(/Shooting day not found/);
  });

  it('throws when scene not owned', async () => {
    pushResult({ rows: [dayRow()] });
    pushResult({ rows: [] }); // getScreenplayScene
    await expect(
      addStripToDay({
        shootingDayId: 'd-1',
        sceneId: 'sc-x',
        userId: 'u-1',
      }),
    ).rejects.toThrow(/Scene not found/);
  });

  it('transactionally inserts strip + flips meta status to scheduled', async () => {
    pushResult({ rows: [dayRow()] }); // getShootingDayBare
    pushResult({ rows: [sceneRow()] }); // getScreenplayScene
    // Tx: BEGIN, SELECT next_idx, INSERT strip, UPSERT meta, COMMIT
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [{ next_idx: 0 }] }); // SELECT next_idx
    pushResult({ rows: [] }); // INSERT strip
    pushResult({ rows: [] }); // UPSERT meta
    pushResult({ rows: [] }); // COMMIT
    // Refetch strip (uses pool.query, not client.query)
    pushResult({ rows: [stripRow()] });

    const strip = await addStripToDay({
      shootingDayId: 'd-1',
      sceneId: 'sc-1',
      userId: 'u-1',
    });
    expect(strip.orderIndex).toBe(0);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('BEGIN');
    expect(tx).toContain('INSERT INTO agos_filmmaker_schedule_strips');
    expect(tx).toContain('INSERT INTO agos_filmmaker_scene_breakdown_meta');
    expect(tx).toContain("'scheduled'");
    expect(tx).toContain('COMMIT');
    expect(released).toBe(1);
  });
});

// ─── removeStripFromDay ─────────────────────────────────────────────────────

describe('removeStripFromDay', () => {
  it('flips meta back to unscheduled when last strip removed', async () => {
    pushResult({ rows: [stripRow()] }); // getStrip
    // Tx: BEGIN, DELETE strip, UPDATE reindex, SELECT remaining count, UPDATE meta, COMMIT
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [] }); // DELETE
    pushResult({ rows: [] }); // UPDATE order_index siblings
    pushResult({ rows: [{ c: 0 }] }); // remaining count = 0
    pushResult({ rows: [] }); // UPDATE meta -> unscheduled
    pushResult({ rows: [] }); // COMMIT

    const ok = await removeStripFromDay('st-1', 'u-1');
    expect(ok).toBe(true);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('DELETE FROM agos_filmmaker_schedule_strips');
    expect(tx).toContain("SET status = 'unscheduled'");
    expect(released).toBe(1);
  });

  it('does NOT flip meta when scene has other strips', async () => {
    pushResult({ rows: [stripRow()] });
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [] }); // DELETE
    pushResult({ rows: [] }); // UPDATE siblings
    pushResult({ rows: [{ c: 1 }] }); // remaining = 1
    pushResult({ rows: [] }); // COMMIT

    const ok = await removeStripFromDay('st-1', 'u-1');
    expect(ok).toBe(true);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).not.toContain("SET status = 'unscheduled'");
  });

  it('returns false when strip not owned', async () => {
    pushResult({ rows: [] });
    expect(await removeStripFromDay('st-x', 'u-1')).toBe(false);
  });
});

// ─── moveStrip ──────────────────────────────────────────────────────────────

describe('moveStrip', () => {
  it('throws when strip not owned', async () => {
    pushResult({ rows: [] });
    await expect(
      moveStrip({
        stripId: 'st-x',
        toShootingDayId: 'd-2',
        toOrderIndex: 0,
        userId: 'u-1',
      }),
    ).rejects.toThrow(/Strip not found/);
  });

  it('throws when destination day not owned', async () => {
    pushResult({ rows: [stripRow()] });
    pushResult({ rows: [] }); // getShootingDayBare for dest
    await expect(
      moveStrip({
        stripId: 'st-1',
        toShootingDayId: 'd-other',
        toOrderIndex: 0,
        userId: 'u-1',
      }),
    ).rejects.toThrow(/Destination shooting day/);
  });

  it('transactionally moves strip across days reindexing both sides', async () => {
    pushResult({ rows: [stripRow({ order_index: 1 })] }); // getStrip
    pushResult({ rows: [dayRow({ id: 'd-2' })] }); // getShootingDayBare dest
    // Tx
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [] }); // UPDATE park strip at -1
    pushResult({ rows: [] }); // UPDATE shift source siblings down
    pushResult({ rows: [{ max_idx: 2 }] }); // SELECT max on dest
    pushResult({ rows: [] }); // UPDATE make room on dest
    pushResult({ rows: [] }); // UPDATE finalize strip
    pushResult({ rows: [] }); // COMMIT
    // Refetch
    pushResult({ rows: [stripRow({ shooting_day_id: 'd-2', order_index: 0 })] });

    const moved = await moveStrip({
      stripId: 'st-1',
      toShootingDayId: 'd-2',
      toOrderIndex: 0,
      userId: 'u-1',
    });
    expect(moved.shootingDayId).toBe('d-2');
    expect(moved.orderIndex).toBe(0);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('BEGIN');
    // Both source-side reindex AND dest-side make-room should fire.
    expect(tx.match(/order_index = order_index - 1/g)?.length).toBeGreaterThan(0);
    expect(tx.match(/order_index = order_index \+ 1/g)?.length).toBeGreaterThan(0);
    expect(tx).toContain('COMMIT');
    expect(released).toBe(1);
  });
});

// ─── deleteShootingDay (cascade) ────────────────────────────────────────────

describe('deleteShootingDay', () => {
  it('cascades + flips orphaned scene meta back to unscheduled', async () => {
    pushResult({ rows: [dayRow()] }); // getShootingDayBare
    // Tx: BEGIN, SELECT orphans, DELETE day, UPDATE meta, COMMIT
    pushResult({ rows: [] }); // BEGIN
    pushResult({ rows: [{ scene_id: 'sc-1' }, { scene_id: 'sc-2' }] }); // orphans
    pushResult({ rows: [] }); // DELETE day
    pushResult({ rows: [] }); // UPDATE meta
    pushResult({ rows: [] }); // COMMIT

    const ok = await deleteShootingDay('d-1', 'u-1');
    expect(ok).toBe(true);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('DELETE FROM agos_filmmaker_shooting_days');
    expect(tx).toContain("SET status = 'unscheduled'");
    expect(released).toBe(1);
  });

  it('returns false when not owned', async () => {
    pushResult({ rows: [] });
    expect(await deleteShootingDay('d-x', 'u-1')).toBe(false);
  });
});

// ─── reorderShootingDays ────────────────────────────────────────────────────

describe('reorderShootingDays', () => {
  it('throws when project not owned', async () => {
    pushResult({ rows: [] });
    await expect(
      reorderShootingDays('p-x', 'u-1', ['d-1', 'd-2']),
    ).rejects.toThrow(/Project not found/);
  });

  it('renumbers per unit in two passes', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [] }); // BEGIN
    pushResult({
      rows: [
        { id: 'd-1', unit: 'main' },
        { id: 'd-2', unit: 'main' },
      ],
    });
    // 2 days × 2 passes = 4 UPDATEs
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] }); // COMMIT

    await reorderShootingDays('p-1', 'u-1', ['d-2', 'd-1']);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx.match(/UPDATE agos_filmmaker_shooting_days/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(released).toBe(1);
  });
});

// ─── reorderStripsWithinDay ─────────────────────────────────────────────────

describe('reorderStripsWithinDay', () => {
  it('throws when day not owned', async () => {
    pushResult({ rows: [] });
    await expect(
      reorderStripsWithinDay('d-x', 'u-1', []),
    ).rejects.toThrow(/Shooting day not found/);
  });

  it('reindexes strips 0..N', async () => {
    pushResult({ rows: [dayRow()] });
    pushResult({ rows: [] }); // BEGIN
    pushResult({
      rows: [{ id: 'st-1' }, { id: 'st-2' }, { id: 'st-3' }],
    }); // SELECT existing
    // 3 UPDATEs
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] });
    pushResult({ rows: [] }); // COMMIT

    await reorderStripsWithinDay('d-1', 'u-1', ['st-3', 'st-1', 'st-2']);
    const tx = txCalls.map((c) => c.sql).join(' || ');
    expect(tx).toContain('UPDATE agos_filmmaker_schedule_strips');
    expect(released).toBe(1);
  });
});
