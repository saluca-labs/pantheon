/**
 * Maker OS coach — system prompt builder.
 *
 * Per-mode role framings on top of one set of shared hard rules and a
 * mode-shaped context block. The canonical prompt is versioned (bump
 * `SYSTEM_PROMPT_VERSION` whenever the template materially changes) so a
 * historical session can be replayed against the prompt it was authored
 * under.
 *
 * Coach safety policy is enforced by the prompt only — there's no
 * content classifier, no PII redaction, no token sniffing. The
 * `shop_safety` framing carries the explicit refusal pattern for
 * obviously-unsafe operations; the `general` mode inherits a softer
 * version of the same nudge. Matches the locked Phase 7 decision: no
 * domain-output filter (Filmmaker-style), the Maker domain isn't
 * credential-sensitive like Cyber and isn't compliance-bound like
 * Health.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import type { MakerCoachContext } from './context';
import type { CoachMode } from './modes';

export const SYSTEM_PROMPT_VERSION = 'v1';

const HARD_RULES = `Hard rules:

1. Never invent facts about the user's workshop or project. Only use the
   context block below — if the answer isn't in context, say "I don't
   have that on file yet" and tell the user which surface to check.
2. Never push the user past their declared skill level on a clearly
   unsafe operation. If they describe one (high-voltage work without
   isolation, a CNC operation with no fixturing plan, laser cutting an
   unknown material, no PPE for an obvious fume / particulate hazard) —
   point it out and refuse to walk them through it without proper PPE,
   ventilation, fixturing, or training. This applies in every mode, not
   only shop_safety.
3. Never give regulated professional advice. Electrical code,
   load-bearing structural calls, pressurized-vessel design,
   medical-device design, and anything that needs a licensed
   professional — defer to one. Inform the user, don't license them.

Output plain markdown. No "as an AI" boilerplate, no apologetic
preamble. Keep responses tight; concrete recommendations beat broad
overviews.`;

const MODE_FRAMING: Record<CoachMode, string> = {
  procurement_advisor: `You are the workshop procurement advisor. Voice:
sourcing-focused, cost-aware, supply-chain pragmatic. You read the
project's BOM, the supplier links attached to each catalog row, and
variant rollups, then:

- Prioritize what to order first (long lead times, blocking items,
  deficit lines).
- Flag rows with no supplier linked yet — the user can't actually buy
  those without action.
- Suggest sourcing alternatives when a line has variants or multiple
  supplier links (cheapest unit price ≠ best when lead-time / MOQ /
  in-stock matters).
- Estimate total parts cost in cents, and call out the biggest line
  items by share-of-total.
- Recommend bulk ordering for parts shared across multiple active
  projects when it lowers per-unit cost.

Stay sourcing-mode. Don't drift into build planning or shop safety
unless the user asks.`,

  build_planner: `You are the workshop build planner. Voice: sequencing-
focused, deadline-aware, dependency-literate. You read the project's
build steps, milestones (with priority + deadline + blocker flags), the
tools required by this build, and any cross-project dependency edges,
then:

- Suggest the next 3-5 steps in priority order, factoring in dependency
  status (steps that wait on a missing tool, a blocked milestone, or an
  upstream project should move down).
- Flag deadline conflicts: any milestone where status is at_risk /
  blocked / missed, or where due_at is in the past, gets called out
  with the reason.
- Identify missing tools — required project_tools whose tool_status is
  down / retired, or that the workshop doesn't own yet.
- Surface cross-project blockers: open upstream blocks-edges with the
  peer project's status.

When the user asks "what should I do next?", give a numbered list —
not paragraphs.`,

  shop_safety: `You are the workshop safety advisor. Voice: blunt,
hazard-first, training-conscious. You read the workshop's active tools
list (status filtered to non-retired), the overdue maintenance log, the
worn-out consumables list, and the project's required tools / current
step, then:

- Recommend PPE per step. Be specific: "ANSI Z87+ safety glasses, N95
  for MDF dust, hearing protection >85 dB tools".
- Flag tool-status warnings: any tool with status='down' that the user
  is planning to use, or with overdue maintenance, gets called out
  before they touch it.
- Call out worn consumables: any consumable with
  hours_remaining < 20% of max_hours should be replaced before the
  next operation that depends on it. Worn blades / bits don't fail
  gracefully.
- Surface fume / particulate / ventilation requirements for
  laser-cutting, soldering, sanding, MIG/TIG welding, polyurethane
  finishing, and other obvious-hazard operations.

When a user describes a clearly unsafe operation (HV work without
isolation, no fixturing on a CNC cut, laser cutting an unknown
plastic, no respiratory protection for an obvious fume hazard) —
point it out and refuse to walk them through it without proper PPE /
ventilation / training. Refuse with a concrete fix, not a lecture.`,

  general: `You are a workshop collaborator. Voice: knowledgeable peer,
not a teacher. You can move across procurement, build planning, and
shop safety as the user's question demands, but you stay grounded in
the project + workshop context. When intent is ambiguous, ask one
clarifying question; otherwise just answer.

Apply the shop-safety nudge from the hard rules: if the user describes
a clearly unsafe operation, call it out and refuse to walk them
through it without proper PPE / ventilation / training. Don't lecture
on safety unprompted; do call it out when relevant.`,
};

function renderProject(p: {
  id: string;
  name: string;
  status: string;
  description: string | null;
  target_completion_date: string | null;
  team_size: number | null;
  tags: string[];
  phase_progress_avg: number;
} | null): string {
  if (!p) {
    return '## Scope\n- Workshop-wide (no project selected)';
  }
  const lines: string[] = [];
  lines.push('## Project');
  lines.push(`- Name: ${p.name}`);
  lines.push(`- Status: ${p.status}`);
  if (p.description) {
    lines.push(`- Description: ${p.description}`);
  }
  if (p.target_completion_date) {
    lines.push(`- Target completion: ${p.target_completion_date}`);
  }
  if (p.team_size != null) {
    lines.push(`- Team size: ${p.team_size}`);
  }
  if (p.tags.length > 0) {
    lines.push(`- Tags: ${p.tags.join(', ')}`);
  }
  lines.push(`- Phase progress (avg of 7 phases): ${p.phase_progress_avg}%`);
  return lines.join('\n');
}

function renderProcurement(data: any): string {
  const lines: string[] = [];
  lines.push(renderProject(data.project));
  lines.push('');
  const t = data.totals ?? {};
  lines.push('## BOM totals');
  lines.push(`- Line count: ${t.line_count ?? 0}`);
  lines.push(`- Total estimated cost: ${t.total_est_cost_cents ?? 0} cents`);
  lines.push(`- Lines with deficit: ${t.deficit_line_count ?? 0}`);
  lines.push(`- Lines with no supplier linked: ${t.missing_supplier_line_count ?? 0}`);
  lines.push('');
  if (!Array.isArray(data.bom_lines) || data.bom_lines.length === 0) {
    lines.push('## BOM lines\n- (none yet)');
  } else {
    lines.push(`## BOM lines (${data.bom_lines.length})`);
    for (const e of data.bom_lines) {
      const supplierTag =
        e.supplier_link_count === 0
          ? ' [NO SUPPLIER]'
          : ` (${e.supplier_link_count} suppliers)`;
      lines.push(
        `- ${e.part_name} × ${e.quantity_needed} [priority=${e.priority}, deficit=${e.deficit}, est_cost_cents=${e.est_cost_cents ?? 'n/a'}, on_hand=${e.on_hand}, free=${e.free}]${supplierTag}`,
      );
      if (e.notes) {
        lines.push(`  - Notes: ${e.notes}`);
      }
    }
  }
  return lines.join('\n');
}

function renderBuildPlanner(data: any): string {
  const lines: string[] = [];
  lines.push(renderProject(data.project));
  lines.push('');
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    lines.push('## Build steps\n- (none yet)');
  } else {
    lines.push(`## Build steps (${data.steps.length})`);
    for (const s of data.steps) {
      const tick = s.completed ? '[x]' : '[ ]';
      lines.push(
        `- ${tick} #${s.ordinal} ${s.title}${s.est_minutes != null ? ` (~${s.est_minutes}m)` : ''}`,
      );
      if (s.blocker_text) {
        lines.push(`  - Blocker: ${s.blocker_text}`);
      }
    }
  }
  lines.push('');
  if (!Array.isArray(data.milestones) || data.milestones.length === 0) {
    lines.push('## Milestones\n- (none yet)');
  } else {
    lines.push(`## Milestones (${data.milestones.length})`);
    for (const m of data.milestones) {
      const blockerTag = m.is_blocker ? ' [BLOCKER]' : '';
      lines.push(
        `- "${m.label}" [status=${m.status}, priority=${m.priority}, due=${m.due_at ?? 'unset'}]${blockerTag}`,
      );
      if (m.blocked_reason) {
        lines.push(`  - Reason: ${m.blocked_reason}`);
      }
    }
  }
  lines.push('');
  if (!Array.isArray(data.tools) || data.tools.length === 0) {
    lines.push('## Tools required\n- (none linked yet)');
  } else {
    lines.push(`## Tools required (${data.tools.length})`);
    for (const t of data.tools) {
      const req = t.required ? '[required]' : '[nice-to-have]';
      lines.push(`- ${t.tool_name} (${t.tool_kind}, status=${t.tool_status}) ${req}`);
    }
  }
  lines.push('');
  if (!Array.isArray(data.dependencies) || data.dependencies.length === 0) {
    lines.push('## Cross-project dependencies\n- (none)');
  } else {
    lines.push(`## Cross-project dependencies (${data.dependencies.length})`);
    for (const d of data.dependencies) {
      lines.push(
        `- ${d.direction} ${d.kind} → ${d.other_project_id} [status=${d.status}]${d.notes ? ` "${d.notes}"` : ''}`,
      );
    }
  }
  return lines.join('\n');
}

function renderShopSafety(data: any): string {
  const lines: string[] = [];
  lines.push(renderProject(data.project));
  lines.push('');
  if (!Array.isArray(data.active_tools) || data.active_tools.length === 0) {
    lines.push('## Workshop tools\n- (none registered)');
  } else {
    lines.push(`## Workshop tools (${data.active_tools.length} active)`);
    for (const t of data.active_tools) {
      lines.push(`- ${t.name} (${t.kind}) [status=${t.status}]`);
      if (t.notes) {
        lines.push(`  - Notes: ${t.notes}`);
      }
    }
  }
  lines.push('');
  if (
    !Array.isArray(data.overdue_maintenance) ||
    data.overdue_maintenance.length === 0
  ) {
    lines.push('## Overdue maintenance\n- (none)');
  } else {
    lines.push(`## Overdue maintenance (${data.overdue_maintenance.length})`);
    for (const m of data.overdue_maintenance) {
      lines.push(
        `- ${m.tool_name} — ${m.event_kind} was due ${m.next_due_at} (${m.overdue_days}d overdue)`,
      );
    }
  }
  lines.push('');
  if (!Array.isArray(data.worn_consumables) || data.worn_consumables.length === 0) {
    lines.push('## Worn consumables\n- (none under 20% remaining)');
  } else {
    lines.push(`## Worn consumables (${data.worn_consumables.length})`);
    for (const c of data.worn_consumables) {
      const frac =
        c.fraction_remaining != null
          ? `${Math.round(c.fraction_remaining * 100)}%`
          : 'unknown';
      lines.push(
        `- ${c.tool_name} → ${c.name}${c.kind ? ` (${c.kind})` : ''}: ${c.hours_remaining}/${c.max_hours} hours (${frac} remaining)`,
      );
    }
  }
  if (Array.isArray(data.project_tools) && data.project_tools.length > 0) {
    lines.push('');
    lines.push(`## Tools used by this project (${data.project_tools.length})`);
    for (const t of data.project_tools) {
      const req = t.required ? '[required]' : '[nice-to-have]';
      lines.push(`- ${t.tool_name} (${t.tool_kind}, status=${t.tool_status}) ${req}`);
    }
  }
  return lines.join('\n');
}

function renderGeneral(data: any): string {
  const lines: string[] = [];
  lines.push(renderProject(data.project));
  lines.push('');
  const c = data.counts ?? {};
  const w = data.workshop_counts ?? {};
  if (data.project) {
    lines.push('## Project counts');
    lines.push(`- BOM lines: ${c.bom_line_count ?? 0}`);
    lines.push(`- Build steps: ${c.step_count ?? 0}`);
    lines.push(`- Open milestones: ${c.open_milestone_count ?? 0}`);
    lines.push(`- Overdue milestones: ${c.overdue_milestone_count ?? 0}`);
    lines.push(`- Tools required: ${c.tool_count ?? 0}`);
    lines.push(`- Hard blockers: ${c.blocker_count ?? 0}`);
    lines.push('');
  }
  lines.push('## Workshop counts');
  lines.push(`- Projects: ${w.project_count ?? 0}`);
  lines.push(`- Active tools (non-retired): ${w.active_tool_count ?? 0}`);
  return lines.join('\n');
}

function renderContext(ctx: MakerCoachContext): string {
  switch (ctx.mode) {
    case 'procurement_advisor':
      return renderProcurement(ctx.data);
    case 'build_planner':
      return renderBuildPlanner(ctx.data);
    case 'shop_safety':
      return renderShopSafety(ctx.data);
    case 'general':
      return renderGeneral(ctx.data);
  }
}

/**
 * Compose the system prompt from the role framing, the hard rules, and
 * the rendered context block. The context block is mode-shaped — see
 * `coach-context.ts` for the per-mode payloads.
 */
export function buildSystemPrompt(
  ctx: MakerCoachContext,
  mode: CoachMode,
): string {
  return [
    'You are the Pantheon Maker Coach inside Tiresias.',
    '',
    MODE_FRAMING[mode],
    '',
    HARD_RULES,
    '',
    renderContext(ctx),
  ].join('\n');
}
