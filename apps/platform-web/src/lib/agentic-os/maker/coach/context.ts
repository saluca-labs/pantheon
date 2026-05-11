/**
 * Maker OS coach — per-mode context snapshot.
 *
 * Loads a compact, current-state view for one session. The shape varies
 * by mode so the model isn't given a full workshop dump every turn:
 *
 *   - procurement_advisor: BOM rows + supplier links for the project's
 *     parts.
 *   - build_planner: steps + milestones (with deadline metadata) + open
 *     dependencies + tools required.
 *   - shop_safety: workshop tools (filtered to non-retired) + overdue
 *     maintenance + worn-out consumables + current/selected build step.
 *   - general: project meta + counts ("X has 12 BOM lines, 4 steps,
 *     2 open milestones, 3 tools required").
 *
 * Workshop-scoped sessions (no `projectId`) load a slimmer "across the
 * workshop" view that covers the relevant counts without binding to a
 * single project. The size cap (`MAX_CONTEXT_BYTES`) is enforced after
 * rendering to JSON so a pathological tag/notes payload can't blow the
 * model's context window.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import 'server-only';
import {
  getProject,
  listProjects,
  listBomLines,
  getBomSummary,
  listSupplierLinks,
  listVariants,
  listBuildSteps,
  listMilestones,
  listProjectDependencies,
  listToolsForProject,
  listTools,
  listConsumables,
  listMaintenanceEvents,
} from '../repo';
import type { MakerProject } from '../repo';
import type { CoachMode } from './modes';

/** Hard cap on the rendered JSON size (50 KB pre-prompt). Truncate beyond. */
export const MAX_CONTEXT_BYTES = 50_000;

export interface CoachContextProjectSummary {
  id: string;
  name: string;
  status: string;
  description: string | null;
  target_completion_date: string | null;
  team_size: number | null;
  tags: string[];
  phase_progress_avg: number;
}

export interface CoachProcurementBomEntry {
  bom_line_id: string;
  part_name: string;
  quantity_needed: number;
  priority: string;
  notes: string | null;
  on_hand: number;
  free: number;
  deficit: number;
  est_cost_cents: number | null;
  currency: string;
  supplier_link_count: number;
  cheapest_supplier_id: string | null;
  /** Supplier rows for this part (id, price, currency, lead time). */
  suppliers: Array<{
    supplier_id: string;
    unit_price_cents: number | null;
    currency: string;
    lead_time_days: number | null;
  }>;
  variant_count: number;
}

export interface CoachProcurementContext {
  project: CoachContextProjectSummary;
  bom_lines: CoachProcurementBomEntry[];
  totals: {
    line_count: number;
    total_est_cost_cents: number;
    deficit_line_count: number;
    missing_supplier_line_count: number;
  };
}

export interface CoachBuildPlannerStepEntry {
  id: string;
  title: string;
  completed: boolean;
  ordinal: number;
  blocker_text: string | null;
  est_minutes: number | null;
}

export interface CoachBuildPlannerMilestoneEntry {
  id: string;
  label: string;
  status: string;
  priority: string;
  is_blocker: boolean;
  due_at: string | null;
  blocked_reason: string | null;
}

export interface CoachBuildPlannerToolEntry {
  tool_id: string;
  tool_name: string;
  tool_kind: string;
  tool_status: string;
  required: boolean;
}

export interface CoachBuildPlannerDependencyEntry {
  id: string;
  direction: 'upstream' | 'downstream';
  kind: string;
  status: string;
  other_project_id: string;
  notes: string | null;
}

export interface CoachBuildPlannerContext {
  project: CoachContextProjectSummary;
  steps: CoachBuildPlannerStepEntry[];
  milestones: CoachBuildPlannerMilestoneEntry[];
  tools: CoachBuildPlannerToolEntry[];
  dependencies: CoachBuildPlannerDependencyEntry[];
}

export interface CoachShopSafetyToolEntry {
  id: string;
  name: string;
  kind: string;
  status: string;
  notes: string | null;
}

export interface CoachShopSafetyMaintenanceEntry {
  tool_id: string;
  tool_name: string;
  event_kind: string;
  performed_at: string;
  next_due_at: string;
  /** Days overdue (positive number when overdue). */
  overdue_days: number;
}

export interface CoachShopSafetyConsumableEntry {
  tool_id: string;
  tool_name: string;
  name: string;
  kind: string | null;
  hours_remaining: number | null;
  max_hours: number | null;
  /** Fraction in [0,1] when both fields known; null otherwise. */
  fraction_remaining: number | null;
}

export interface CoachShopSafetyContext {
  project: CoachContextProjectSummary | null;
  active_tools: CoachShopSafetyToolEntry[];
  overdue_maintenance: CoachShopSafetyMaintenanceEntry[];
  worn_consumables: CoachShopSafetyConsumableEntry[];
  /** Project tools list when scope is project. */
  project_tools: CoachBuildPlannerToolEntry[];
}

export interface CoachGeneralContext {
  project: CoachContextProjectSummary | null;
  counts: {
    bom_line_count: number;
    step_count: number;
    open_milestone_count: number;
    overdue_milestone_count: number;
    tool_count: number;
    blocker_count: number;
  };
  workshop_counts: {
    project_count: number;
    active_tool_count: number;
  };
}

export type MakerCoachContext =
  | { mode: 'procurement_advisor'; data: CoachProcurementContext }
  | { mode: 'build_planner'; data: CoachBuildPlannerContext }
  | { mode: 'shop_safety'; data: CoachShopSafetyContext }
  | { mode: 'general'; data: CoachGeneralContext };

export interface BuildCoachContextInput {
  userId: string;
  mode: CoachMode;
  projectId?: string | null;
}

function projectSummary(p: MakerProject): CoachContextProjectSummary {
  const phases = p.phaseProgress;
  const values = Object.values(phases) as number[];
  const avg =
    values.length === 0
      ? 0
      : Math.round(values.reduce((acc, v) => acc + v, 0) / values.length);
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    description: p.description,
    target_completion_date: p.targetCompletionDate,
    team_size: p.teamSize ?? null,
    tags: p.tags ?? [],
    phase_progress_avg: avg,
  };
}

/**
 * Truncate a rendered JSON payload to MAX_CONTEXT_BYTES. We accept the
 * "lossy" truncation tradeoff: the routing layer prefers a slightly
 * truncated JSON object to a thrown error mid-stream.
 *
 * The truncation drops the largest array fields (`bom_lines`,
 * `milestones`, `active_tools`, etc.) tail-first until the byte budget
 * is satisfied. Any field whose JSON encoding alone exceeds the budget
 * is replaced with an `{ "_truncated": true, "_kept": N }` shim.
 */
export function enforceContextSizeCap(payload: unknown): unknown {
  const initial = JSON.stringify(payload);
  if (initial.length <= MAX_CONTEXT_BYTES) return payload;

  // Walk the payload and tail-truncate array fields until under budget.
  const clone = JSON.parse(initial);
  const containers = collectArrayContainers(clone);
  // Truncate biggest arrays first.
  containers.sort((a, b) => b.array.length - a.array.length);
  for (const container of containers) {
    while (
      container.array.length > 0 &&
      JSON.stringify(clone).length > MAX_CONTEXT_BYTES
    ) {
      container.array.pop();
      container.truncated = true;
    }
    if (container.truncated) {
      container.parent[container.key] = {
        _truncated: true,
        _kept: container.array.length,
        items: container.array,
      };
    }
    if (JSON.stringify(clone).length <= MAX_CONTEXT_BYTES) break;
  }
  return clone;
}

interface ArrayContainer {
  parent: any;
  key: string;
  array: any[];
  truncated: boolean;
}

function collectArrayContainers(node: any, into: ArrayContainer[] = []): ArrayContainer[] {
  if (node == null || typeof node !== 'object') return into;
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      into.push({ parent: node, key, array: value, truncated: false });
    } else if (value && typeof value === 'object') {
      collectArrayContainers(value, into);
    }
  }
  return into;
}

// ─── Mode-specific loaders ────────────────────────────────────────────────

async function loadProcurement(
  userId: string,
  project: MakerProject,
): Promise<CoachProcurementContext> {
  const summary = await getBomSummary(project.id, userId);
  const lines = await listBomLines(project.id, userId);
  const lineMap = new Map(lines.map((l) => [l.id, l]));

  const entries: CoachProcurementBomEntry[] = [];
  for (const row of summary.rows) {
    const links = await listSupplierLinks(row.catalog.id, userId);
    const variants = await listVariants(row.catalog.id, userId);
    const line = lineMap.get(row.line.id) ?? row.line;
    entries.push({
      bom_line_id: line.id,
      part_name: row.catalog.name,
      quantity_needed: row.needed,
      priority: line.priority,
      notes: line.notes,
      on_hand: row.onHand,
      free: row.free,
      deficit: row.deficit,
      est_cost_cents: row.estCostCents,
      currency: row.currency,
      supplier_link_count: links.length,
      cheapest_supplier_id: row.cheapestLinkId,
      suppliers: links.slice(0, 5).map((l) => ({
        supplier_id: l.supplierId,
        unit_price_cents: l.unitPriceCents,
        currency: l.currency,
        lead_time_days: l.leadTimeDays,
      })),
      variant_count: variants.length,
    });
  }

  return {
    project: projectSummary(project),
    bom_lines: entries,
    totals: {
      line_count: entries.length,
      total_est_cost_cents: summary.totalEstCostCents,
      deficit_line_count: entries.filter((e) => e.deficit > 0).length,
      missing_supplier_line_count: entries.filter(
        (e) => e.supplier_link_count === 0,
      ).length,
    },
  };
}

async function loadBuildPlanner(
  userId: string,
  project: MakerProject,
): Promise<CoachBuildPlannerContext> {
  const [steps, milestones, deps, tools] = await Promise.all([
    listBuildSteps(project.id, userId),
    listMilestones(project.id, userId),
    listProjectDependencies(project.id, userId),
    listToolsForProject(project.id, userId),
  ]);
  return {
    project: projectSummary(project),
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      completed: s.completedAt != null,
      ordinal: s.ordinal,
      blocker_text: s.blockerText,
      est_minutes: s.estMinutes,
    })),
    milestones: milestones.map((m) => ({
      id: m.id,
      label: m.label,
      status: m.status,
      priority: m.priority,
      is_blocker: m.isBlocker,
      due_at: m.dueAt,
      blocked_reason: m.blockedReason,
    })),
    tools: tools.map((t) => ({
      tool_id: t.toolId,
      tool_name: t.toolName,
      tool_kind: t.toolKind,
      tool_status: t.toolStatus,
      required: t.required,
    })),
    dependencies: [
      ...deps.upstream.map((d): CoachBuildPlannerDependencyEntry => ({
        id: d.id,
        direction: 'upstream',
        kind: d.kind,
        status: d.status,
        other_project_id: d.toProjectId,
        notes: d.notes,
      })),
      ...deps.downstream.map((d): CoachBuildPlannerDependencyEntry => ({
        id: d.id,
        direction: 'downstream',
        kind: d.kind,
        status: d.status,
        other_project_id: d.fromProjectId,
        notes: d.notes,
      })),
    ],
  };
}

async function loadShopSafety(
  userId: string,
  project: MakerProject | null,
): Promise<CoachShopSafetyContext> {
  // Workshop-global tools (non-retired only).
  const allTools = await listTools({ userId });
  const liveTools = allTools.filter((t) => t.status !== 'retired');

  const overdueMaintenance: CoachShopSafetyMaintenanceEntry[] = [];
  const wornConsumables: CoachShopSafetyConsumableEntry[] = [];
  const now = Date.now();

  for (const tool of liveTools) {
    const [events, consumables] = await Promise.all([
      listMaintenanceEvents(tool.id, userId),
      listConsumables(tool.id, userId),
    ]);

    // Filter events with a future-or-past next_due_at, take the most recent
    // per tool, and keep it if it's overdue (now > nextDueAt).
    const dueEvents = events.filter((e) => !!e.nextDueAt);
    if (dueEvents.length > 0) {
      // Most recent next_due_at per tool wins (the freshest scheduled date).
      const next = dueEvents.sort((a, b) =>
        (a.nextDueAt ?? '') < (b.nextDueAt ?? '') ? 1 : -1,
      )[0];
      const dueMs = Date.parse(`${next.nextDueAt}T00:00:00Z`);
      if (Number.isFinite(dueMs) && dueMs < now) {
        overdueMaintenance.push({
          tool_id: tool.id,
          tool_name: tool.name,
          event_kind: next.eventKind,
          performed_at: next.performedAt,
          next_due_at: next.nextDueAt!,
          overdue_days: Math.floor((now - dueMs) / 86_400_000),
        });
      }
    }

    for (const c of consumables) {
      if (
        c.hoursRemaining != null &&
        c.maxHours != null &&
        c.maxHours > 0 &&
        c.hoursRemaining < 0.2 * c.maxHours
      ) {
        wornConsumables.push({
          tool_id: tool.id,
          tool_name: tool.name,
          name: c.name,
          kind: c.kind,
          hours_remaining: c.hoursRemaining,
          max_hours: c.maxHours,
          fraction_remaining: c.hoursRemaining / c.maxHours,
        });
      }
    }
  }

  let projectTools: CoachBuildPlannerToolEntry[] = [];
  if (project) {
    const tools = await listToolsForProject(project.id, userId);
    projectTools = tools.map((t) => ({
      tool_id: t.toolId,
      tool_name: t.toolName,
      tool_kind: t.toolKind,
      tool_status: t.toolStatus,
      required: t.required,
    }));
  }

  return {
    project: project ? projectSummary(project) : null,
    active_tools: liveTools.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      status: t.status,
      notes: t.notes ?? null,
    })),
    overdue_maintenance: overdueMaintenance,
    worn_consumables: wornConsumables,
    project_tools: projectTools,
  };
}

async function loadGeneral(
  userId: string,
  project: MakerProject | null,
): Promise<CoachGeneralContext> {
  const [allProjects, allTools] = await Promise.all([
    listProjects(userId),
    listTools({ userId }),
  ]);
  const activeToolCount = allTools.filter((t) => t.status !== 'retired').length;

  if (!project) {
    return {
      project: null,
      counts: {
        bom_line_count: 0,
        step_count: 0,
        open_milestone_count: 0,
        overdue_milestone_count: 0,
        tool_count: 0,
        blocker_count: 0,
      },
      workshop_counts: {
        project_count: allProjects.length,
        active_tool_count: activeToolCount,
      },
    };
  }

  const [bom, steps, milestones, tools] = await Promise.all([
    listBomLines(project.id, userId),
    listBuildSteps(project.id, userId),
    listMilestones(project.id, userId),
    listToolsForProject(project.id, userId),
  ]);
  const now = Date.now();
  const openMs = milestones.filter((m) => m.status !== 'done');
  const overdueMs = openMs.filter((m) => {
    if (!m.dueAt) return false;
    const due = Date.parse(`${m.dueAt}T00:00:00Z`);
    return Number.isFinite(due) && due < now;
  });
  const blockerCount = milestones.filter((m) => m.isBlocker).length;

  return {
    project: projectSummary(project),
    counts: {
      bom_line_count: bom.length,
      step_count: steps.length,
      open_milestone_count: openMs.length,
      overdue_milestone_count: overdueMs.length,
      tool_count: tools.length,
      blocker_count: blockerCount,
    },
    workshop_counts: {
      project_count: allProjects.length,
      active_tool_count: activeToolCount,
    },
  };
}

/**
 * Build the context payload for a single coach turn. Throws when the
 * caller passes a `projectId` that doesn't belong to `userId`; the route
 * layer maps that to a 404.
 */
export async function buildCoachContext(
  input: BuildCoachContextInput,
): Promise<MakerCoachContext> {
  const project = input.projectId
    ? await getProject(input.projectId, input.userId)
    : null;
  if (input.projectId && !project) {
    throw new Error('Project not found or not owned by user');
  }

  switch (input.mode) {
    case 'procurement_advisor': {
      if (!project) {
        // Procurement always needs a project.
        throw new Error('procurement_advisor requires a projectId');
      }
      const data = await loadProcurement(input.userId, project);
      return {
        mode: 'procurement_advisor',
        data: enforceContextSizeCap(data) as CoachProcurementContext,
      };
    }
    case 'build_planner': {
      if (!project) {
        throw new Error('build_planner requires a projectId');
      }
      const data = await loadBuildPlanner(input.userId, project);
      return {
        mode: 'build_planner',
        data: enforceContextSizeCap(data) as CoachBuildPlannerContext,
      };
    }
    case 'shop_safety': {
      const data = await loadShopSafety(input.userId, project);
      return {
        mode: 'shop_safety',
        data: enforceContextSizeCap(data) as CoachShopSafetyContext,
      };
    }
    case 'general': {
      const data = await loadGeneral(input.userId, project);
      return {
        mode: 'general',
        data: enforceContextSizeCap(data) as CoachGeneralContext,
      };
    }
  }
}
