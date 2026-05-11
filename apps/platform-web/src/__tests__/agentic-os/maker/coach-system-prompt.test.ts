/**
 * Maker OS Phase 7 — coach system prompt builder tests.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/maker/coach/system-prompt';
import type { MakerCoachContext } from '@/lib/agentic-os/maker/coach/context';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/maker/coach/modes';

const PROJECT_SUMMARY = {
  id: 'p-1',
  name: 'CNC build',
  status: 'fabrication',
  description: 'A CNC mill rebuild',
  target_completion_date: '2026-06-15',
  team_size: 1,
  tags: ['cnc'],
  phase_progress_avg: 50,
};

const PROCUREMENT_CTX: MakerCoachContext = {
  mode: 'procurement_advisor',
  data: {
    project: PROJECT_SUMMARY,
    bom_lines: [
      {
        bom_line_id: 'bom-1',
        part_name: 'ER20 collet',
        quantity_needed: 5,
        priority: 'high',
        notes: 'must-have',
        on_hand: 2,
        free: 1,
        deficit: 4,
        est_cost_cents: 5000,
        currency: 'USD',
        supplier_link_count: 1,
        cheapest_supplier_id: 'link-1',
        suppliers: [
          { supplier_id: 's-1', unit_price_cents: 1000, currency: 'USD', lead_time_days: 7 },
        ],
        variant_count: 0,
      },
      {
        bom_line_id: 'bom-2',
        part_name: 'spindle bearing',
        quantity_needed: 2,
        priority: 'normal',
        notes: null,
        on_hand: 0,
        free: 0,
        deficit: 2,
        est_cost_cents: null,
        currency: 'USD',
        supplier_link_count: 0,
        cheapest_supplier_id: null,
        suppliers: [],
        variant_count: 0,
      },
    ],
    totals: {
      line_count: 2,
      total_est_cost_cents: 5000,
      deficit_line_count: 2,
      missing_supplier_line_count: 1,
    },
  },
};

const BUILD_PLANNER_CTX: MakerCoachContext = {
  mode: 'build_planner',
  data: {
    project: PROJECT_SUMMARY,
    steps: [
      { id: 's-1', title: 'Source bearings', completed: false, ordinal: 1, blocker_text: null, est_minutes: 30 },
      { id: 's-2', title: 'Tune drives', completed: true, ordinal: 2, blocker_text: null, est_minutes: 90 },
    ],
    milestones: [
      {
        id: 'm-1',
        label: 'Bearings on bench',
        status: 'at_risk',
        priority: 'high',
        is_blocker: true,
        due_at: '2026-05-15',
        blocked_reason: 'lead time',
      },
    ],
    tools: [
      { tool_id: 't-1', tool_name: 'Tormach 770', tool_kind: 'cnc', tool_status: 'active', required: true },
    ],
    dependencies: [
      { id: 'd-1', direction: 'upstream', kind: 'blocks', status: 'open', other_project_id: 'p-2', notes: null },
    ],
  },
};

const SHOP_SAFETY_CTX: MakerCoachContext = {
  mode: 'shop_safety',
  data: {
    project: PROJECT_SUMMARY,
    active_tools: [
      { id: 't-1', name: 'Laser', kind: 'laser', status: 'active', notes: null },
    ],
    overdue_maintenance: [
      {
        tool_id: 't-1',
        tool_name: 'Laser',
        event_kind: 'serviced',
        performed_at: '2026-04-01',
        next_due_at: '2026-04-30',
        overdue_days: 11,
      },
    ],
    worn_consumables: [
      {
        tool_id: 't-1',
        tool_name: 'Laser',
        name: 'CO2 tube',
        kind: 'tube',
        hours_remaining: 10,
        max_hours: 1000,
        fraction_remaining: 0.01,
      },
    ],
    project_tools: [],
  },
};

const GENERAL_CTX: MakerCoachContext = {
  mode: 'general',
  data: {
    project: PROJECT_SUMMARY,
    counts: {
      bom_line_count: 12,
      step_count: 4,
      open_milestone_count: 2,
      overdue_milestone_count: 1,
      tool_count: 3,
      blocker_count: 1,
    },
    workshop_counts: { project_count: 5, active_tool_count: 8 },
  },
};

describe('SYSTEM_PROMPT_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT_VERSION).toBe('string');
    expect(SYSTEM_PROMPT_VERSION.length).toBeGreaterThan(0);
  });

  it('starts with "v"', () => {
    expect(SYSTEM_PROMPT_VERSION).toMatch(/^v/);
  });
});

describe('buildSystemPrompt — shared structure', () => {
  for (const mode of COACH_MODE_VALUES) {
    it(`prompt for ${mode} declares the role`, () => {
      const ctx =
        mode === 'procurement_advisor'
          ? PROCUREMENT_CTX
          : mode === 'build_planner'
            ? BUILD_PLANNER_CTX
            : mode === 'shop_safety'
              ? SHOP_SAFETY_CTX
              : GENERAL_CTX;
      const prompt = buildSystemPrompt(ctx, mode);
      expect(prompt).toMatch(/Pantheon Maker Coach/i);
      expect(prompt).toMatch(/Hard rules/);
    });
  }

  for (const mode of COACH_MODE_VALUES) {
    it(`prompt for ${mode} carries the never-invent rule`, () => {
      const ctx =
        mode === 'procurement_advisor'
          ? PROCUREMENT_CTX
          : mode === 'build_planner'
            ? BUILD_PLANNER_CTX
            : mode === 'shop_safety'
              ? SHOP_SAFETY_CTX
              : GENERAL_CTX;
      const prompt = buildSystemPrompt(ctx, mode);
      expect(prompt).toMatch(/Never invent facts/i);
    });
  }

  for (const mode of COACH_MODE_VALUES) {
    it(`prompt for ${mode} carries the unsafe-operation refusal rule`, () => {
      const ctx =
        mode === 'procurement_advisor'
          ? PROCUREMENT_CTX
          : mode === 'build_planner'
            ? BUILD_PLANNER_CTX
            : mode === 'shop_safety'
              ? SHOP_SAFETY_CTX
              : GENERAL_CTX;
      const prompt = buildSystemPrompt(ctx, mode);
      // The rule should call out unsafe operations + PPE.
      expect(prompt.toLowerCase()).toMatch(/ppe/);
    });
  }

  for (const mode of COACH_MODE_VALUES) {
    it(`prompt for ${mode} carries the regulated-advice deferral rule`, () => {
      const ctx =
        mode === 'procurement_advisor'
          ? PROCUREMENT_CTX
          : mode === 'build_planner'
            ? BUILD_PLANNER_CTX
            : mode === 'shop_safety'
              ? SHOP_SAFETY_CTX
              : GENERAL_CTX;
      const prompt = buildSystemPrompt(ctx, mode);
      expect(prompt.toLowerCase()).toMatch(/licensed[\s\S]*?professional/);
    });
  }
});

describe('buildSystemPrompt — procurement_advisor', () => {
  const prompt = buildSystemPrompt(PROCUREMENT_CTX, 'procurement_advisor');

  it('frames as a procurement advisor', () => {
    expect(prompt.toLowerCase()).toMatch(/procurement/);
  });

  it('lists every BOM row in the context block', () => {
    expect(prompt).toContain('ER20 collet');
    expect(prompt).toContain('spindle bearing');
  });

  it('tags rows with no supplier as [NO SUPPLIER]', () => {
    expect(prompt).toMatch(/spindle bearing[\s\S]*\[NO SUPPLIER\]/);
  });

  it('includes BOM totals', () => {
    expect(prompt).toContain('Total estimated cost: 5000 cents');
    expect(prompt).toContain('Lines with deficit: 2');
    expect(prompt).toContain('Lines with no supplier linked: 1');
  });
});

describe('buildSystemPrompt — build_planner', () => {
  const prompt = buildSystemPrompt(BUILD_PLANNER_CTX, 'build_planner');

  it('frames as a build planner', () => {
    expect(prompt.toLowerCase()).toMatch(/build planner/);
  });

  it('renders completed steps with [x] and pending with [ ]', () => {
    expect(prompt).toContain('[ ] #1 Source bearings');
    expect(prompt).toContain('[x] #2 Tune drives');
  });

  it('flags blocker milestones with [BLOCKER] tag', () => {
    expect(prompt).toMatch(/"Bearings on bench"[^\n]*\[BLOCKER\]/);
  });

  it('renders the milestone blocked_reason', () => {
    expect(prompt).toContain('Reason: lead time');
  });

  it('renders the project required tool', () => {
    expect(prompt).toMatch(/Tormach 770.*\[required\]/);
  });

  it('renders the upstream dependency', () => {
    expect(prompt).toMatch(/upstream blocks → p-2/);
  });
});

describe('buildSystemPrompt — shop_safety', () => {
  const prompt = buildSystemPrompt(SHOP_SAFETY_CTX, 'shop_safety');

  it('frames as a safety advisor', () => {
    expect(prompt.toLowerCase()).toMatch(/safety advisor/);
  });

  it('renders the active tools list', () => {
    expect(prompt).toContain('Laser (laser)');
  });

  it('renders the overdue maintenance with the overdue-days count', () => {
    expect(prompt).toMatch(/Laser — serviced was due 2026-04-30 \(11d overdue\)/);
  });

  it('renders the worn consumable with a percent-remaining', () => {
    expect(prompt).toMatch(/CO2 tube[^\n]*1% remaining/);
  });

  it('refuses to walk through unsafe operations without PPE / ventilation', () => {
    // The refusal phrasing should reference unsafe + PPE / ventilation /
    // training.
    expect(prompt.toLowerCase()).toMatch(/unsafe operation/);
    expect(prompt.toLowerCase()).toMatch(/refuse/);
  });
});

describe('buildSystemPrompt — general', () => {
  const prompt = buildSystemPrompt(GENERAL_CTX, 'general');

  it('frames as a workshop collaborator', () => {
    expect(prompt.toLowerCase()).toMatch(/workshop collaborator/);
  });

  it('includes the project counts block', () => {
    expect(prompt).toContain('BOM lines: 12');
    expect(prompt).toContain('Overdue milestones: 1');
    expect(prompt).toContain('Hard blockers: 1');
  });

  it('includes workshop counts', () => {
    expect(prompt).toContain('Projects: 5');
    expect(prompt).toContain('Active tools (non-retired): 8');
  });
});

describe('buildSystemPrompt — workshop-scoped general', () => {
  it('renders without a project block when project is null', () => {
    const ctx: MakerCoachContext = {
      mode: 'general',
      data: {
        project: null,
        counts: {
          bom_line_count: 0,
          step_count: 0,
          open_milestone_count: 0,
          overdue_milestone_count: 0,
          tool_count: 0,
          blocker_count: 0,
        },
        workshop_counts: { project_count: 3, active_tool_count: 4 },
      },
    };
    const prompt = buildSystemPrompt(ctx, 'general');
    expect(prompt).toContain('Workshop-wide (no project selected)');
    expect(prompt).toContain('Projects: 3');
  });
});
