/**
 * Maker OS — Phase 4 repo CRUD tests.
 *
 * Mocks the pg Pool and asserts the SQL shape + ownership wiring for the new
 * tool / consumable / maintenance / project-tools repos.
 *
 * Covers:
 *   - listTools filter wiring (status/kind/tag).
 *   - createTool kind+status validation.
 *   - assertToolOwnership gates child operations (consumables, maintenance).
 *   - listToolsForProject joins agos_maker_tools + agos_maker_project_tools.
 *   - attachToolToProject requires BOTH project ownership AND tool ownership.
 *   - detachToolFromProject + updateProjectToolLink.
 *   - listProjectsUsingTool returns the inverse view.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
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
  listTools,
  getTool,
  createTool,
  updateTool,
  deleteTool,
  listConsumables,
  createConsumable,
  updateConsumable,
  deleteConsumable,
  listMaintenanceEvents,
  createMaintenanceEvent,
  deleteMaintenanceEvent,
  listToolsForProject,
  attachToolToProject,
  detachToolFromProject,
  updateProjectToolLink,
  listProjectsUsingTool,
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
    phase_progress: {},
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function toolRow(over: Record<string, any> = {}): any {
  return {
    id: 't-1',
    user_id: 'u-1',
    name: 'Shapeoko',
    kind: 'cnc',
    manufacturer: 'Carbide 3D',
    model: 'Pro XL',
    serial: null,
    location: 'Garage',
    status: 'active',
    purchased_at: null,
    image_url: null,
    datasheet_url: null,
    manual_url: null,
    notes: null,
    tags: ['cnc', 'router'],
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function consumableRow(over: Record<string, any> = {}): any {
  return {
    id: 'c-1',
    tool_id: 't-1',
    name: '1/4 endmill',
    kind: 'endmill',
    hours_remaining: 8,
    max_hours: 20,
    last_replaced_at: null,
    notes: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function maintenanceRow(over: Record<string, any> = {}): any {
  return {
    id: 'm-1',
    tool_id: 't-1',
    event_kind: 'cleaned',
    performed_at: new Date('2026-05-11T00:00:00Z'),
    cost_cents: 1500,
    currency: 'USD',
    vendor: null,
    notes: null,
    next_due_at: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function projectToolRow(over: Record<string, any> = {}): any {
  return {
    id: 'pt-1',
    project_id: 'p-1',
    tool_id: 't-1',
    required: true,
    notes: null,
    created_at: new Date('2026-05-11T00:00:00Z'),
    tool_name: 'Shapeoko',
    tool_kind: 'cnc',
    tool_status: 'active',
    ...over,
  };
}

// ─── Tools ────────────────────────────────────────────────────────────────

describe('listTools', () => {
  it('returns all rows for a user when no filters', async () => {
    pushResult({ rows: [toolRow(), toolRow({ id: 't-2', name: 'Drill' })] });
    const tools = await listTools({ userId: 'u-1' });
    expect(tools).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_tools/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0]!.params).toEqual(['u-1']);
  });

  it('applies status, kind, and tag filters', async () => {
    pushResult({ rows: [] });
    await listTools({ userId: 'u-1', status: 'active', kind: 'cnc', tag: 'router' });
    const sql = calls[0]!.sql;
    expect(sql).toMatch(/status = \$2/);
    expect(sql).toMatch(/kind = \$3/);
    expect(sql).toMatch(/= ANY\(tags\)/);
    expect(calls[0]!.params).toEqual(['u-1', 'active', 'cnc', 'router']);
  });

  it('rejects an invalid status filter at the application layer', async () => {
    await expect(
      listTools({ userId: 'u-1', status: 'broken' as any }),
    ).rejects.toThrow(/Invalid status/);
  });

  it('rejects an invalid kind filter at the application layer', async () => {
    await expect(
      listTools({ userId: 'u-1', kind: 'drone' as any }),
    ).rejects.toThrow(/Invalid kind/);
  });
});

describe('getTool', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const tool = await getTool('t-1', 'u-1');
    expect(tool).toBeNull();
  });

  it('returns mapped tool when owned', async () => {
    pushResult({ rows: [toolRow()] });
    const tool = await getTool('t-1', 'u-1');
    expect(tool?.id).toBe('t-1');
    expect(tool?.kind).toBe('cnc');
    expect(tool?.tags).toEqual(['cnc', 'router']);
  });
});

describe('createTool', () => {
  it('rejects invalid kind before any SQL', async () => {
    await expect(
      createTool('u-1', { name: 'X', kind: 'drone' as any }),
    ).rejects.toThrow(/Invalid kind/);
    expect(calls).toHaveLength(0);
  });

  it('rejects invalid status before any SQL', async () => {
    await expect(
      createTool('u-1', { name: 'X', kind: 'cnc', status: 'broken' as any }),
    ).rejects.toThrow(/Invalid status/);
    expect(calls).toHaveLength(0);
  });

  it('inserts then re-reads the row', async () => {
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [toolRow()] }); // SELECT
    const tool = await createTool('u-1', { name: 'Shapeoko', kind: 'cnc' });
    expect(tool.id).toBeTruthy();
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_maker_tools/);
    expect(calls[1]!.sql).toMatch(/SELECT [\s\S]+FROM agos_maker_tools/);
  });
});

describe('updateTool', () => {
  it('issues a COALESCE UPDATE and re-reads', async () => {
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [toolRow({ status: 'down' })] });
    const tool = await updateTool('t-1', 'u-1', { status: 'down' });
    expect(tool?.status).toBe('down');
    expect(calls[0]!.sql).toMatch(/UPDATE agos_maker_tools/);
    expect(calls[0]!.sql).toMatch(/status\s+= COALESCE/);
  });

  it('rejects invalid status patch', async () => {
    await expect(
      updateTool('t-1', 'u-1', { status: 'broken' as any }),
    ).rejects.toThrow(/Invalid status/);
  });
});

describe('deleteTool', () => {
  it('returns true when a row was deleted', async () => {
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteTool('t-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_maker_tools/);
  });

  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteTool('t-x', 'u-1')).toBe(false);
  });
});

// ─── Consumables ──────────────────────────────────────────────────────────

describe('listConsumables', () => {
  it('asserts tool ownership first', async () => {
    pushResult({ rows: [], rowCount: 0 }); // ownership fails
    await expect(listConsumables('t-1', 'u-1')).rejects.toThrow(/not owned/);
  });

  it('queries by tool_id ordered by name when owned', async () => {
    pushResult({ rows: [toolRow()] }); // ownership
    pushResult({ rows: [consumableRow()] }); // SELECT
    const items = await listConsumables('t-1', 'u-1');
    expect(items).toHaveLength(1);
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_tool_consumables/);
    expect(calls[1]!.sql).toMatch(/ORDER BY name ASC/);
  });
});

describe('createConsumable', () => {
  it('refuses when tool not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      createConsumable('t-1', 'u-1', { name: 'Bit' }),
    ).rejects.toThrow(/not owned/);
  });

  it('inserts then re-reads on success', async () => {
    pushResult({ rows: [toolRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [toolRow()] }); // ownership re-read
    pushResult({ rows: [consumableRow()] }); // SELECT
    const c = await createConsumable('t-1', 'u-1', {
      name: '1/4 endmill',
      kind: 'endmill',
      maxHours: 20,
      hoursRemaining: 20,
    });
    expect(c.id).toBeTruthy();
    expect(calls[1]!.sql).toMatch(/INSERT INTO agos_maker_tool_consumables/);
  });
});

describe('updateConsumable', () => {
  it('issues a COALESCE UPDATE bound by tool_id', async () => {
    pushResult({ rows: [toolRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [toolRow()] }); // ownership re-read
    pushResult({ rows: [consumableRow({ hours_remaining: 20 })] }); // SELECT
    const c = await updateConsumable('c-1', 't-1', 'u-1', {
      hoursRemaining: 20,
    });
    expect(c?.hoursRemaining).toBe(20);
    const update = calls.find((c) => /UPDATE agos_maker_tool_consumables/.test(c.sql));
    expect(update).toBeTruthy();
    expect(update!.sql).toMatch(/WHERE id = \$1 AND tool_id = \$2/);
  });
});

describe('deleteConsumable', () => {
  it('refuses when tool not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      deleteConsumable('c-1', 't-1', 'u-1'),
    ).rejects.toThrow(/not owned/);
  });

  it('returns true on successful delete', async () => {
    pushResult({ rows: [toolRow()] });
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteConsumable('c-1', 't-1', 'u-1')).toBe(true);
  });
});

// ─── Maintenance events ───────────────────────────────────────────────────

describe('listMaintenanceEvents', () => {
  it('queries by tool_id ordered by performed_at DESC', async () => {
    pushResult({ rows: [toolRow()] });
    pushResult({ rows: [maintenanceRow()] });
    const events = await listMaintenanceEvents('t-1', 'u-1');
    expect(events).toHaveLength(1);
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_tool_maintenance/);
    expect(calls[1]!.sql).toMatch(/ORDER BY performed_at DESC/);
  });
});

describe('createMaintenanceEvent', () => {
  it('rejects invalid event_kind before any SQL', async () => {
    await expect(
      createMaintenanceEvent('t-1', 'u-1', {
        eventKind: 'upgraded' as any,
      }),
    ).rejects.toThrow(/Invalid event_kind/);
    expect(calls).toHaveLength(0);
  });

  it('inserts with COALESCE(performed_at, now()) default', async () => {
    pushResult({ rows: [toolRow()] }); // ownership
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [toolRow()] }); // ownership re-read
    pushResult({ rows: [maintenanceRow()] }); // SELECT
    const ev = await createMaintenanceEvent('t-1', 'u-1', {
      eventKind: 'cleaned',
      costCents: 1500,
    });
    expect(ev.id).toBeTruthy();
    expect(calls[1]!.sql).toMatch(/COALESCE\(\$4, now\(\)\)/);
  });
});

describe('deleteMaintenanceEvent', () => {
  it('returns true on success', async () => {
    pushResult({ rows: [toolRow()] });
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteMaintenanceEvent('m-1', 't-1', 'u-1')).toBe(true);
  });
});

// ─── Project-tools join ───────────────────────────────────────────────────

describe('listToolsForProject', () => {
  it('asserts project ownership then joins tools', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [projectToolRow()] });
    const links = await listToolsForProject('p-1', 'u-1');
    expect(links).toHaveLength(1);
    expect(links[0]!.toolName).toBe('Shapeoko');
    expect(links[0]!.toolKind).toBe('cnc');
    expect(calls[1]!.sql).toMatch(/JOIN agos_maker_tools t/);
    expect(calls[1]!.sql).toMatch(/pt\.project_id = \$1/);
    expect(calls[1]!.sql).toMatch(/t\.user_id = \$2/);
  });

  it('throws when project not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(listToolsForProject('p-1', 'u-1')).rejects.toThrow(/not owned/);
  });
});

describe('attachToolToProject', () => {
  it('requires BOTH project ownership AND tool ownership', async () => {
    // Project owned, tool NOT owned -> expect throw before any insert.
    pushResult({ rows: [projectRow()] }); // assertProjectOwnership
    pushResult({ rows: [], rowCount: 0 }); // assertToolOwnership fails
    await expect(
      attachToolToProject('p-1', 't-x', 'u-1'),
    ).rejects.toThrow(/Tool not found/);
    // No insert call recorded.
    expect(calls.find((c) => /INSERT INTO agos_maker_project_tools/.test(c.sql))).toBeUndefined();
  });

  it('inserts then re-reads when both owned', async () => {
    pushResult({ rows: [projectRow()] }); // assertProjectOwnership
    pushResult({ rows: [toolRow()] }); // assertToolOwnership
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [projectRow()] }); // assertProjectOwnership for listToolsForProject re-read
    pushResult({ rows: [projectToolRow()] }); // SELECT
    const link = await attachToolToProject('p-1', 't-1', 'u-1', { required: true });
    expect(link.toolId).toBe('t-1');
    expect(link.required).toBe(true);
    const insert = calls.find((c) => /INSERT INTO agos_maker_project_tools/.test(c.sql));
    expect(insert).toBeTruthy();
    expect(insert!.params).toEqual(
      expect.arrayContaining(['p-1', 't-1', true, null]),
    );
  });

  it('defaults required to true when not supplied', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [toolRow()] });
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [projectToolRow()] });
    await attachToolToProject('p-1', 't-1', 'u-1');
    const insert = calls.find((c) => /INSERT INTO agos_maker_project_tools/.test(c.sql));
    expect(insert!.params[3]).toBe(true);
  });
});

describe('updateProjectToolLink', () => {
  it('issues UPDATE then re-reads the joined row', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [toolRow()] });
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [projectRow()] }); // ownership re-read
    pushResult({ rows: [projectToolRow({ required: false })] }); // SELECT
    const link = await updateProjectToolLink('p-1', 't-1', 'u-1', { required: false });
    expect(link?.required).toBe(false);
    const update = calls.find((c) => /UPDATE agos_maker_project_tools/.test(c.sql));
    expect(update).toBeTruthy();
    expect(update!.sql).toMatch(/WHERE project_id = \$1 AND tool_id = \$2/);
  });
});

describe('detachToolFromProject', () => {
  it('refuses when project not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      detachToolFromProject('p-1', 't-1', 'u-1'),
    ).rejects.toThrow(/not owned/);
  });

  it('refuses when tool not owned', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      detachToolFromProject('p-1', 't-1', 'u-1'),
    ).rejects.toThrow(/Tool not found/);
  });

  it('returns true on successful delete', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [toolRow()] });
    pushResult({ rowCount: 1, rows: [] });
    expect(await detachToolFromProject('p-1', 't-1', 'u-1')).toBe(true);
  });
});

describe('listProjectsUsingTool', () => {
  it('joins agos_maker_projects + agos_maker_project_tools, scoped by user', async () => {
    pushResult({ rows: [toolRow()] }); // tool ownership
    pushResult({
      rows: [
        {
          project_id: 'p-1',
          project_name: 'CNC v2',
          project_status: 'in_progress',
          required: true,
        },
      ],
    });
    const out = await listProjectsUsingTool('t-1', 'u-1');
    expect(out).toHaveLength(1);
    expect(out[0]!.projectName).toBe('CNC v2');
    expect(out[0]!.required).toBe(true);
    expect(calls[1]!.sql).toMatch(/JOIN agos_maker_projects p ON p\.id = pt\.project_id/);
    expect(calls[1]!.sql).toMatch(/p\.user_id = \$2/);
  });
});
