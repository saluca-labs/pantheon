/**
 * Filmmaker OS — repo regression tests.
 *
 * Exercises the new Project Hub plumbing against a mocked pg Pool:
 *   - getProjectWithStats joins shot rollups and returns sane numbers.
 *   - JSONB phase_progress survives a write/read roundtrip.
 *   - deleteProject issues a single DELETE (FK cascade lives in the DB).
 *   - updatePhaseProgress merges over existing phases.
 *
 * Same harness pattern as health/phase2-mood.test.ts.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
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

vi.mock('@/lib/agentic-os/filmmaker/session', () => ({
  getFilmmakerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
}));

import {
  getProjectWithStats,
  createProject,
  updateProject,
  updatePhaseProgress,
  deleteProject,
} from '@/lib/agentic-os/filmmaker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function projectRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'Test',
    description: null,
    status: 'pre_production',
    tags: [],
    format: 'feature',
    logline: null,
    cover_image_url: null,
    phase_progress: { development: 0, pre_production: 0, production: 0, post_production: 0, distribution: 0 },
    target_completion_date: null,
    team_size: null,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

// ─── getProjectWithStats ─────────────────────────────────────────────────────

describe('getProjectWithStats', () => {
  it('returns 0 counts when there are no shots', async () => {
    pushResult({
      rows: [
        {
          ...projectRow(),
          shot_count: 0,
          completed_shot_count: 0,
          total_estimated_seconds: 0,
        },
      ],
    });
    const result = await getProjectWithStats('p-1', 'u-1');
    expect(result).not.toBeNull();
    expect(result!.shotCount).toBe(0);
    expect(result!.completedShotCount).toBe(0);
    expect(result!.totalEstimatedSeconds).toBe(0);
  });

  it('surfaces shot rollup numbers from the join', async () => {
    pushResult({
      rows: [
        {
          ...projectRow(),
          shot_count: '12',
          completed_shot_count: '4',
          total_estimated_seconds: '720',
        },
      ],
    });
    const result = await getProjectWithStats('p-1', 'u-1');
    expect(result!.shotCount).toBe(12);
    expect(result!.completedShotCount).toBe(4);
    expect(result!.totalEstimatedSeconds).toBe(720);
  });

  it('returns null when the project does not exist', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getProjectWithStats('missing', 'u-1')).toBeNull();
  });

  it('issues a LEFT JOIN against agos_filmmaker_shots', async () => {
    pushResult({
      rows: [{ ...projectRow(), shot_count: 0, completed_shot_count: 0, total_estimated_seconds: 0 }],
    });
    await getProjectWithStats('p-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/LEFT JOIN/);
    expect(calls[0]!.sql).toMatch(/agos_filmmaker_shots/);
  });
});

// ─── Phase progress JSONB roundtrip ──────────────────────────────────────────

describe('phase progress JSONB', () => {
  it('serializes phaseProgress to JSON on create', async () => {
    // First call: INSERT. Second call: SELECT for re-read (getProject).
    pushResult({ rowCount: 1, rows: [] });
    pushResult({
      rows: [
        projectRow({
          phase_progress: {
            development: 25,
            pre_production: 10,
            production: 0,
            post_production: 0,
            distribution: 0,
          },
        }),
      ],
    });

    const project = await createProject('u-1', {
      name: 'JSONB Test',
      phaseProgress: {
        development: 25,
        pre_production: 10,
        production: 0,
        post_production: 0,
        distribution: 0,
      },
    });

    const insertSql = calls[0]!.sql;
    expect(insertSql).toMatch(/phase_progress/);
    const insertParams = calls[0]!.params;
    const jsonParam = insertParams.find((p) => typeof p === 'string' && p.includes('development'));
    expect(jsonParam).toBeTruthy();
    expect(JSON.parse(jsonParam as string).development).toBe(25);

    expect(project.phaseProgress.development).toBe(25);
    expect(project.phaseProgress.pre_production).toBe(10);
  });

  it('updatePhaseProgress merges with existing phases', async () => {
    // Sequence:
    //   1. getProject() pre-read -> current phases
    //   2. updateProject() UPDATE
    //   3. getProject() post-read
    pushResult({
      rows: [
        projectRow({
          phase_progress: {
            development: 50,
            pre_production: 30,
            production: 10,
            post_production: 0,
            distribution: 0,
          },
        }),
      ],
    });
    pushResult({ rowCount: 1, rows: [] });
    pushResult({
      rows: [
        projectRow({
          phase_progress: {
            development: 50,
            pre_production: 30,
            production: 75, // <- changed
            post_production: 0,
            distribution: 0,
          },
        }),
      ],
    });

    const result = await updatePhaseProgress('p-1', 'u-1', { production: 75 });
    expect(result!.phaseProgress.production).toBe(75);

    // The UPDATE must have received the merged object, not just { production: 75 }.
    const updateCall = calls[1]!;
    const jsonbParam = updateCall.params.find((p) => typeof p === 'string' && p.includes('development'));
    expect(jsonbParam).toBeTruthy();
    const merged = JSON.parse(jsonbParam as string);
    expect(merged.development).toBe(50);
    expect(merged.pre_production).toBe(30);
    expect(merged.production).toBe(75);
  });
});

// ─── deleteProject ───────────────────────────────────────────────────────────

describe('deleteProject', () => {
  it('returns true when a row was removed', async () => {
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteProject('p-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_filmmaker_projects/);
    expect(calls[0]!.params).toEqual(['p-1', 'u-1']);
  });

  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteProject('missing', 'u-1')).toBe(false);
  });

  it('relies on the FK cascade — no separate DELETE on shots', async () => {
    pushResult({ rowCount: 1, rows: [] });
    await deleteProject('p-1', 'u-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).not.toMatch(/agos_filmmaker_shots/);
  });
});

// ─── updateProject preserves untouched columns ───────────────────────────────

describe('updateProject', () => {
  it('passes null for omitted fields so SQL COALESCE keeps existing values', async () => {
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [projectRow({ name: 'New name' })] });
    await updateProject('p-1', 'u-1', { name: 'New name' });
    const updateParams = calls[0]!.params;
    // $3 = name, $4 = description, $5 = status, ..., $13 = metadata
    expect(updateParams[2]).toBe('New name');
    expect(updateParams[3]).toBeNull(); // description left alone
    expect(updateParams[4]).toBeNull(); // status left alone
  });
});
