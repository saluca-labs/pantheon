/**
 * Maker OS Phase 7 — coach context loader tests.
 *
 * Covers:
 *   - Per-mode dispatch (procurement / build_planner / shop_safety / general).
 *   - Selectivity: procurement loads BOM+suppliers+variants and skips steps/
 *     tools; build_planner loads steps/milestones/deps/tools and skips BOM;
 *     shop_safety loads tools+maintenance+consumables; general loads counts
 *     only.
 *   - 404 when projectId doesn't belong to user.
 *   - 50 KB size cap truncates the largest arrays tail-first.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listProjects: vi.fn(),
  listBomLines: vi.fn(),
  getBomSummary: vi.fn(),
  listSupplierLinks: vi.fn(),
  listVariants: vi.fn(),
  listBuildSteps: vi.fn(),
  listMilestones: vi.fn(),
  listProjectDependencies: vi.fn(),
  listToolsForProject: vi.fn(),
  listTools: vi.fn(),
  listConsumables: vi.fn(),
  listMaintenanceEvents: vi.fn(),
}));

vi.mock('@/lib/agentic-os/maker/repo', () => repoMocks);
vi.mock('@/lib/agentic-os/maker/session', () => ({
  getMakerPool: () => ({ query: vi.fn() }),
}));

import {
  buildCoachContext,
  enforceContextSizeCap,
  MAX_CONTEXT_BYTES,
} from '@/lib/agentic-os/maker/coach/context';

beforeEach(() => {
  for (const m of Object.values(repoMocks)) (m as any).mockReset();
});

function makeProject(over: Record<string, any> = {}): any {
  return {
    id: 'p-1',
    userId: 'u-1',
    name: 'CNC Build',
    status: 'fabrication',
    description: 'A CNC mill rebuild',
    targetCompletionDate: '2026-06-15',
    teamSize: 1,
    tags: ['cnc', 'mill'],
    phaseProgress: {
      concept: 100,
      design: 90,
      procurement: 70,
      fabrication: 40,
      assembly: 0,
      commissioning: 0,
      shipping: 0,
    },
    ...over,
  };
}

// ═════════ procurement_advisor ══════════════════════════════════════════════

describe('buildCoachContext: procurement_advisor', () => {
  beforeEach(() => {
    repoMocks.getProject.mockResolvedValue(makeProject());
    repoMocks.getBomSummary.mockResolvedValue({
      projectId: 'p-1',
      rows: [
        {
          line: { id: 'bom-1', priority: 'high', notes: 'must-have' },
          catalog: { id: 'cat-1', name: 'ER20 collet' },
          variant: null,
          needed: 5,
          onHand: 2,
          free: 1,
          deficit: 4,
          estCostCents: 5000,
          currency: 'USD',
          cheapestLinkId: 'link-1',
        },
        {
          line: { id: 'bom-2', priority: 'normal', notes: null },
          catalog: { id: 'cat-2', name: 'spindle bearing' },
          variant: null,
          needed: 2,
          onHand: 0,
          free: 0,
          deficit: 2,
          estCostCents: null,
          currency: 'USD',
          cheapestLinkId: null,
        },
      ],
      totalEstCostCents: 5000,
    });
    repoMocks.listBomLines.mockResolvedValue([
      { id: 'bom-1', priority: 'high', notes: 'must-have' },
      { id: 'bom-2', priority: 'normal', notes: null },
    ]);
    repoMocks.listSupplierLinks.mockImplementation((catalogId: string) => {
      if (catalogId === 'cat-1') {
        return Promise.resolve([
          { id: 'link-1', supplierId: 'sup-1', unitPriceCents: 1000, currency: 'USD', leadTimeDays: 7 },
        ]);
      }
      return Promise.resolve([]);
    });
    repoMocks.listVariants.mockResolvedValue([]);
  });

  it('loads BOM rows with supplier links', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'procurement_advisor',
      projectId: 'p-1',
    });
    expect(ctx.mode).toBe('procurement_advisor');
    if (ctx.mode !== 'procurement_advisor') return;
    expect(ctx.data.bom_lines).toHaveLength(2);
    expect(ctx.data.bom_lines[0].part_name).toBe('ER20 collet');
    expect(ctx.data.bom_lines[0].supplier_link_count).toBe(1);
    expect(ctx.data.bom_lines[1].supplier_link_count).toBe(0);
  });

  it('computes totals correctly', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'procurement_advisor',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'procurement_advisor') return;
    expect(ctx.data.totals.line_count).toBe(2);
    expect(ctx.data.totals.total_est_cost_cents).toBe(5000);
    expect(ctx.data.totals.deficit_line_count).toBe(2);
    expect(ctx.data.totals.missing_supplier_line_count).toBe(1);
  });

  it('does NOT load build steps / tools / maintenance', async () => {
    await buildCoachContext({
      userId: 'u-1',
      mode: 'procurement_advisor',
      projectId: 'p-1',
    });
    expect(repoMocks.listBuildSteps).not.toHaveBeenCalled();
    expect(repoMocks.listToolsForProject).not.toHaveBeenCalled();
    expect(repoMocks.listMaintenanceEvents).not.toHaveBeenCalled();
    expect(repoMocks.listConsumables).not.toHaveBeenCalled();
  });

  it('throws when called without a projectId', async () => {
    await expect(
      buildCoachContext({ userId: 'u-1', mode: 'procurement_advisor' }),
    ).rejects.toThrow(/requires a projectId/);
  });
});

// ═════════ build_planner ════════════════════════════════════════════════════

describe('buildCoachContext: build_planner', () => {
  beforeEach(() => {
    repoMocks.getProject.mockResolvedValue(makeProject());
    repoMocks.listBuildSteps.mockResolvedValue([
      { id: 's-1', title: 'Source bearings', completedAt: null, ordinal: 1, blockerText: null, estMinutes: 30 },
      { id: 's-2', title: 'Tune drives', completedAt: '2026-05-09', ordinal: 2, blockerText: null, estMinutes: 90 },
    ]);
    repoMocks.listMilestones.mockResolvedValue([
      {
        id: 'm-1',
        label: 'Bearings on bench',
        status: 'at_risk',
        priority: 'high',
        isBlocker: true,
        dueAt: '2026-05-15',
        blockedReason: 'lead time',
      },
    ]);
    repoMocks.listProjectDependencies.mockResolvedValue({
      upstream: [
        { id: 'd-1', kind: 'blocks', status: 'open', toProjectId: 'p-2', fromProjectId: 'p-1', notes: 'needs p-2 first' },
      ],
      downstream: [],
    });
    repoMocks.listToolsForProject.mockResolvedValue([
      { toolId: 't-1', toolName: 'Tormach 770', toolKind: 'cnc', toolStatus: 'active', required: true },
    ]);
  });

  it('loads steps, milestones, deps, and tools', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'build_planner',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'build_planner') return;
    expect(ctx.data.steps).toHaveLength(2);
    expect(ctx.data.milestones).toHaveLength(1);
    expect(ctx.data.dependencies).toHaveLength(1);
    expect(ctx.data.tools).toHaveLength(1);
  });

  it('marks completed steps', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'build_planner',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'build_planner') return;
    expect(ctx.data.steps[0].completed).toBe(false);
    expect(ctx.data.steps[1].completed).toBe(true);
  });

  it('threads milestone priority / blocker flags through', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'build_planner',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'build_planner') return;
    expect(ctx.data.milestones[0].priority).toBe('high');
    expect(ctx.data.milestones[0].is_blocker).toBe(true);
    expect(ctx.data.milestones[0].status).toBe('at_risk');
  });

  it('tags upstream dependencies with direction=upstream', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'build_planner',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'build_planner') return;
    expect(ctx.data.dependencies[0].direction).toBe('upstream');
  });

  it('does NOT load BOM or maintenance', async () => {
    await buildCoachContext({
      userId: 'u-1',
      mode: 'build_planner',
      projectId: 'p-1',
    });
    expect(repoMocks.listBomLines).not.toHaveBeenCalled();
    expect(repoMocks.getBomSummary).not.toHaveBeenCalled();
    expect(repoMocks.listMaintenanceEvents).not.toHaveBeenCalled();
  });

  it('throws when called without a projectId', async () => {
    await expect(
      buildCoachContext({ userId: 'u-1', mode: 'build_planner' }),
    ).rejects.toThrow(/requires a projectId/);
  });
});

// ═════════ shop_safety ═════════════════════════════════════════════════════

describe('buildCoachContext: shop_safety', () => {
  beforeEach(() => {
    repoMocks.getProject.mockResolvedValue(makeProject());
    const now = Date.now();
    const pastDate = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);
    const futureDate = new Date(now + 30 * 86_400_000).toISOString().slice(0, 10);
    repoMocks.listTools.mockResolvedValue([
      { id: 't-1', name: 'Laser', kind: 'laser', status: 'active', notes: null },
      { id: 't-2', name: 'Old drill', kind: 'powertool', status: 'retired', notes: null },
      { id: 't-3', name: 'Mill', kind: 'cnc', status: 'down', notes: 'spindle out' },
    ]);
    repoMocks.listMaintenanceEvents.mockImplementation((toolId: string) => {
      if (toolId === 't-1') {
        return Promise.resolve([
          { id: 'm-1', eventKind: 'serviced', performedAt: '2026-04-01', nextDueAt: pastDate },
        ]);
      }
      if (toolId === 't-3') {
        return Promise.resolve([
          { id: 'm-2', eventKind: 'inspected', performedAt: '2026-04-01', nextDueAt: futureDate },
        ]);
      }
      return Promise.resolve([]);
    });
    repoMocks.listConsumables.mockImplementation((toolId: string) => {
      if (toolId === 't-1') {
        return Promise.resolve([
          { name: 'CO2 tube', kind: 'tube', hoursRemaining: 10, maxHours: 1000 }, // 1%
          { name: 'Lens', kind: 'lens', hoursRemaining: 600, maxHours: 1000 }, // 60% (skip)
        ]);
      }
      return Promise.resolve([]);
    });
    repoMocks.listToolsForProject.mockResolvedValue([]);
  });

  it('filters out retired tools from active_tools', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'shop_safety',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'shop_safety') return;
    expect(ctx.data.active_tools).toHaveLength(2);
    const ids = ctx.data.active_tools.map((t) => t.id).sort();
    expect(ids).toEqual(['t-1', 't-3']);
  });

  it('flags overdue maintenance (next_due_at < now)', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'shop_safety',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'shop_safety') return;
    expect(ctx.data.overdue_maintenance).toHaveLength(1);
    expect(ctx.data.overdue_maintenance[0].tool_id).toBe('t-1');
    expect(ctx.data.overdue_maintenance[0].overdue_days).toBeGreaterThan(0);
  });

  it('flags worn consumables under 20% of max_hours', async () => {
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'shop_safety',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'shop_safety') return;
    expect(ctx.data.worn_consumables).toHaveLength(1);
    expect(ctx.data.worn_consumables[0].name).toBe('CO2 tube');
  });

  it('does NOT load BOM or build steps', async () => {
    await buildCoachContext({
      userId: 'u-1',
      mode: 'shop_safety',
      projectId: 'p-1',
    });
    expect(repoMocks.listBomLines).not.toHaveBeenCalled();
    expect(repoMocks.listBuildSteps).not.toHaveBeenCalled();
  });

  it('runs without a project (workshop-scoped)', async () => {
    repoMocks.getProject.mockResolvedValue(null);
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'shop_safety',
    });
    if (ctx.mode !== 'shop_safety') return;
    expect(ctx.data.project).toBeNull();
    expect(ctx.data.project_tools).toEqual([]);
  });
});

// ═════════ general ══════════════════════════════════════════════════════════

describe('buildCoachContext: general', () => {
  beforeEach(() => {
    repoMocks.listProjects.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);
    repoMocks.listTools.mockResolvedValue([
      { id: 't-1', name: 'A', kind: 'cnc', status: 'active' },
      { id: 't-2', name: 'B', kind: 'cnc', status: 'retired' },
    ]);
  });

  it('returns counts-only when no project is scoped', async () => {
    repoMocks.getProject.mockResolvedValue(null);
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'general',
    });
    if (ctx.mode !== 'general') return;
    expect(ctx.data.project).toBeNull();
    expect(ctx.data.workshop_counts.project_count).toBe(2);
    expect(ctx.data.workshop_counts.active_tool_count).toBe(1);
  });

  it('loads project counts when scoped', async () => {
    repoMocks.getProject.mockResolvedValue(makeProject());
    repoMocks.listBomLines.mockResolvedValue([1, 2, 3]);
    repoMocks.listBuildSteps.mockResolvedValue([1, 2]);
    repoMocks.listMilestones.mockResolvedValue([
      { dueAt: null, status: 'pending', isBlocker: true },
      { dueAt: '2024-01-01', status: 'pending', isBlocker: false }, // overdue
      { dueAt: '2099-01-01', status: 'done', isBlocker: false },
    ]);
    repoMocks.listToolsForProject.mockResolvedValue([1]);
    const ctx = await buildCoachContext({
      userId: 'u-1',
      mode: 'general',
      projectId: 'p-1',
    });
    if (ctx.mode !== 'general') return;
    expect(ctx.data.counts.bom_line_count).toBe(3);
    expect(ctx.data.counts.step_count).toBe(2);
    expect(ctx.data.counts.open_milestone_count).toBe(2);
    expect(ctx.data.counts.overdue_milestone_count).toBe(1);
    expect(ctx.data.counts.tool_count).toBe(1);
    expect(ctx.data.counts.blocker_count).toBe(1);
  });
});

// ═════════ projectId ownership ═════════════════════════════════════════════

describe('buildCoachContext: project ownership', () => {
  it('throws when projectId is supplied but project lookup returns null', async () => {
    repoMocks.getProject.mockResolvedValue(null);
    await expect(
      buildCoachContext({
        userId: 'u-1',
        mode: 'general',
        projectId: 'p-bogus',
      }),
    ).rejects.toThrow(/not found or not owned/);
  });
});

// ═════════ enforceContextSizeCap ═══════════════════════════════════════════

describe('enforceContextSizeCap', () => {
  it('returns the payload unchanged when under cap', () => {
    const payload = { bom_lines: [1, 2, 3] };
    expect(enforceContextSizeCap(payload)).toBe(payload);
  });

  it('truncates the largest array tail-first when over cap', () => {
    // Build a payload whose JSON is well over MAX_CONTEXT_BYTES.
    const big = Array.from({ length: 5000 }, (_, i) => ({
      id: `entry-${i}`,
      padding: 'x'.repeat(50),
    }));
    const payload = { bom_lines: big };
    const out = enforceContextSizeCap(payload) as any;
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
    // The container is wrapped with the truncated shim.
    expect(out.bom_lines._truncated).toBe(true);
    expect(typeof out.bom_lines._kept).toBe('number');
  });
});
