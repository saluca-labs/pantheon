/**
 * Filmmaker OS — Breakdown test suite.
 *
 * Pure helpers + repo plumbing against a mocked pg Pool.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BREAKDOWN_CATEGORIES,
  BREAKDOWN_CATEGORY_VALUES,
  SCENE_COMPLEXITIES,
  SCENE_STATUSES,
  pagesLabel,
  sumEighths,
} from '@/lib/agentic-os/filmmaker/breakdown';

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('BREAKDOWN_CATEGORIES', () => {
  it('has all 14 categories in spec order', () => {
    expect(BREAKDOWN_CATEGORIES.map((c) => c.category)).toEqual([
      'cast',
      'extras',
      'stunts',
      'props',
      'vehicles',
      'animals',
      'costume',
      'makeup',
      'set_dressing',
      'special_effects',
      'sound_effects',
      'music',
      'location',
      'other',
    ]);
  });
  it('BREAKDOWN_CATEGORY_VALUES matches', () => {
    expect([...BREAKDOWN_CATEGORY_VALUES]).toEqual(
      BREAKDOWN_CATEGORIES.map((c) => c.category),
    );
  });
});

describe('SCENE_COMPLEXITIES', () => {
  it('has four complexities', () => {
    expect(SCENE_COMPLEXITIES.map((c) => c.complexity)).toEqual([
      'simple',
      'standard',
      'complex',
      'epic',
    ]);
  });
});

describe('SCENE_STATUSES', () => {
  it('has five statuses with unscheduled first', () => {
    expect(SCENE_STATUSES.map((s) => s.status)).toEqual([
      'unscheduled',
      'scheduled',
      'shot',
      'omitted',
      'reshoot_needed',
    ]);
  });
});

describe('sumEighths', () => {
  it('returns zero on empty', () => {
    expect(sumEighths([])).toEqual({ total: 0, pages: 0 });
  });
  it('sums and divides by 8 for pages', () => {
    expect(sumEighths([{ eighths: 8 }, { eighths: 4 }, { eighths: 12 }])).toEqual({
      total: 24,
      pages: 3,
    });
  });
  it('handles fractional pages', () => {
    expect(sumEighths([{ eighths: 1 }, { eighths: 2 }])).toEqual({
      total: 3,
      pages: 3 / 8,
    });
  });
});

describe('pagesLabel', () => {
  it('returns 0 for zero / negative', () => {
    expect(pagesLabel(0)).toBe('0');
    expect(pagesLabel(-3)).toBe('0');
  });
  it('returns whole pages with no fraction', () => {
    expect(pagesLabel(8)).toBe('1');
    expect(pagesLabel(24)).toBe('3');
  });
  it('returns "n/8" when under a page', () => {
    expect(pagesLabel(3)).toBe('3/8');
  });
  it('returns "n m/8" for fractional pages', () => {
    expect(pagesLabel(11)).toBe('1 3/8');
    expect(pagesLabel(18)).toBe('2 2/8');
  });
});

// ─── Repo plumbing (mocked pg) ───────────────────────────────────────────────

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
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: vi.fn(),
    })),
  }),
}));

import {
  listBreakdownElements,
  getBreakdownElement,
  addBreakdownElement,
  updateBreakdownElement,
  deleteBreakdownElement,
  getSceneBreakdownMeta,
  updateSceneBreakdownMeta,
  getProjectBreakdownSummary,
} from '@/lib/agentic-os/filmmaker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

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

function elementRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'e-1',
    screenplay_id: 's-1',
    scene_id: 'sc-1',
    category: 'props',
    name: 'Coffee cup',
    description: null,
    quantity: 1,
    is_principal: false,
    character_id: null,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function metaRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'm-1',
    scene_id: 'sc-1',
    eighths: 0,
    est_shoot_minutes: null,
    notes: null,
    complexity: null,
    status: 'unscheduled',
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ─── listBreakdownElements ──────────────────────────────────────────────────

describe('listBreakdownElements', () => {
  it('returns rows through the project ownership join', async () => {
    pushResult({ rows: [elementRow({ category: 'cast', name: 'SARAH' }), elementRow()] });
    const rows = await listBreakdownElements({ sceneId: 'sc-1', userId: 'u-1' });
    expect(rows).toHaveLength(2);
    expect(calls[0].sql).toContain('p.user_id = $2');
  });
  it('returns empty when cross-user (join filters)', async () => {
    pushResult({ rows: [] });
    expect(
      await listBreakdownElements({ sceneId: 'sc-1', userId: 'other' }),
    ).toEqual([]);
  });
});

// ─── addBreakdownElement ────────────────────────────────────────────────────

describe('addBreakdownElement', () => {
  it('rejects invalid category', async () => {
    await expect(
      addBreakdownElement({
        sceneId: 'sc-1',
        userId: 'u-1',
        data: { category: 'bogus' as any, name: 'X' },
      }),
    ).rejects.toThrow(/Invalid breakdown category/);
  });

  it('rejects empty name', async () => {
    await expect(
      addBreakdownElement({
        sceneId: 'sc-1',
        userId: 'u-1',
        data: { category: 'props', name: '   ' },
      }),
    ).rejects.toThrow(/name is required/);
  });

  it('throws when scene not owned', async () => {
    pushResult({ rows: [] }); // getScreenplayScene
    await expect(
      addBreakdownElement({
        sceneId: 'sc-missing',
        userId: 'u-1',
        data: { category: 'props', name: 'Coffee cup' },
      }),
    ).rejects.toThrow(/Scene not found/);
  });

  it('inserts and refetches', async () => {
    pushResult({ rows: [sceneRow()] }); // getScreenplayScene
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [elementRow({ name: 'Coffee cup' })] }); // refetch
    const el = await addBreakdownElement({
      sceneId: 'sc-1',
      userId: 'u-1',
      data: { category: 'props', name: 'Coffee cup' },
    });
    expect(el.name).toBe('Coffee cup');
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).toContain('INSERT INTO agos_filmmaker_breakdown_elements');
  });
});

// ─── updateBreakdownElement / deleteBreakdownElement ────────────────────────

describe('updateBreakdownElement', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [] });
    const r = await updateBreakdownElement({
      id: 'e-1',
      userId: 'other',
      patch: { name: 'Hacked' },
    });
    expect(r).toBeNull();
  });

  it('rejects invalid category in patch', async () => {
    pushResult({ rows: [elementRow()] });
    await expect(
      updateBreakdownElement({
        id: 'e-1',
        userId: 'u-1',
        patch: { category: 'bogus' as any },
      }),
    ).rejects.toThrow(/Invalid breakdown category/);
  });

  it('updates and refetches', async () => {
    pushResult({ rows: [elementRow()] });
    pushResult({ rows: [] }); // UPDATE
    pushResult({ rows: [elementRow({ name: 'Espresso cup', quantity: 3 })] }); // refetch
    const r = await updateBreakdownElement({
      id: 'e-1',
      userId: 'u-1',
      patch: { name: 'Espresso cup', quantity: 3 },
    });
    expect(r?.name).toBe('Espresso cup');
    expect(r?.quantity).toBe(3);
  });
});

describe('deleteBreakdownElement', () => {
  it('refuses when not owned', async () => {
    pushResult({ rows: [] });
    expect(await deleteBreakdownElement('e-1', 'other')).toBe(false);
  });
  it('deletes when owned', async () => {
    pushResult({ rows: [elementRow()] });
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteBreakdownElement('e-1', 'u-1')).toBe(true);
  });
});

// ─── getSceneBreakdownMeta (auto-create) ────────────────────────────────────

describe('getSceneBreakdownMeta', () => {
  it('returns null when scene not owned', async () => {
    pushResult({ rows: [] }); // getScreenplayScene
    const r = await getSceneBreakdownMeta('sc-1', 'other');
    expect(r).toBeNull();
  });

  it('returns existing meta if present', async () => {
    pushResult({ rows: [sceneRow()] });
    pushResult({ rows: [metaRow({ eighths: 5 })] });
    const r = await getSceneBreakdownMeta('sc-1', 'u-1');
    expect(r?.eighths).toBe(5);
    // Should NOT have run the INSERT path
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).not.toContain('INSERT INTO agos_filmmaker_scene_breakdown_meta');
  });

  it('auto-creates default row on first read', async () => {
    pushResult({ rows: [sceneRow()] }); // getScreenplayScene
    pushResult({ rows: [] }); // SELECT existing → none
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [metaRow()] }); // SELECT after insert
    const r = await getSceneBreakdownMeta('sc-1', 'u-1');
    expect(r?.status).toBe('unscheduled');
    expect(r?.eighths).toBe(0);
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).toContain('INSERT INTO agos_filmmaker_scene_breakdown_meta');
  });
});

describe('updateSceneBreakdownMeta', () => {
  it('rejects invalid complexity', async () => {
    pushResult({ rows: [sceneRow()] }); // getScreenplayScene
    pushResult({ rows: [metaRow()] }); // SELECT existing
    await expect(
      updateSceneBreakdownMeta({
        sceneId: 'sc-1',
        userId: 'u-1',
        patch: { complexity: 'nuclear' as any },
      }),
    ).rejects.toThrow(/Invalid scene complexity/);
  });
  it('rejects invalid status', async () => {
    pushResult({ rows: [sceneRow()] });
    pushResult({ rows: [metaRow()] });
    await expect(
      updateSceneBreakdownMeta({
        sceneId: 'sc-1',
        userId: 'u-1',
        patch: { status: 'finalized' as any },
      }),
    ).rejects.toThrow(/Invalid scene status/);
  });
});

// ─── getProjectBreakdownSummary ─────────────────────────────────────────────

describe('getProjectBreakdownSummary', () => {
  it('returns zeros when project not owned', async () => {
    pushResult({ rows: [] }); // getProject
    const s = await getProjectBreakdownSummary('p-x', 'other');
    expect(s.totalScenes).toBe(0);
    expect(s.byCategory).toEqual([]);
  });

  it('aggregates counts by category', async () => {
    // getProject
    pushResult({
      rows: [
        {
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
        },
      ],
    });
    // scene count
    pushResult({ rows: [{ total: 4 }] });
    // element category groups
    pushResult({
      rows: [
        { category: 'cast', count: 3 },
        { category: 'props', count: 2 },
      ],
    });
    // scenes-with-breakdown + total eighths
    pushResult({
      rows: [{ scenes_with_breakdown: 2, total_eighths: 16 }],
    });
    const s = await getProjectBreakdownSummary('p-1', 'u-1');
    expect(s.totalScenes).toBe(4);
    expect(s.scenesWithBreakdown).toBe(2);
    expect(s.totalElements).toBe(5);
    expect(s.totalEighths).toBe(16);
    expect(s.totalPages).toBe(2);
    expect(s.byCategory).toHaveLength(2);
  });
});

describe('cross-user safety', () => {
  it('getBreakdownElement returns null cross-user', async () => {
    pushResult({ rows: [] });
    expect(await getBreakdownElement('e-1', 'other')).toBeNull();
  });
});
