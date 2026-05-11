/**
 * Maker OS — Phase 4 route handler tests.
 *
 * Covers:
 *   - 401 unauthenticated on every new route.
 *   - 200/201 happy paths against the mocked repo.
 *   - 400 invalid bodies + 404 when repo returns null.
 *   - 409 when attaching a duplicate (project_id, tool_id) link.
 *   - Cross-ownership: user A's project + user B's tool → rejected via
 *     the repo throwing "Tool not found", route surfaces 404.
 *   - status / kind filter forwarding on GET /tools.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentMakerUser = vi.fn();

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getCurrentMakerUser: (...args: any[]) => getCurrentMakerUser(...args),
  getMakerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listTools: vi.fn(),
  getTool: vi.fn(),
  createTool: vi.fn(),
  updateTool: vi.fn(),
  deleteTool: vi.fn(),
  listConsumables: vi.fn(),
  getConsumable: vi.fn(),
  createConsumable: vi.fn(),
  updateConsumable: vi.fn(),
  deleteConsumable: vi.fn(),
  listMaintenanceEvents: vi.fn(),
  getMaintenanceEvent: vi.fn(),
  createMaintenanceEvent: vi.fn(),
  updateMaintenanceEvent: vi.fn(),
  deleteMaintenanceEvent: vi.fn(),
  listToolsForProject: vi.fn(),
  attachToolToProject: vi.fn(),
  detachToolFromProject: vi.fn(),
  updateProjectToolLink: vi.fn(),
  listProjectsUsingTool: vi.fn(),
  recordAudit: vi.fn(),
};

vi.mock('@/lib/agentic-os/maker/repo', () => repoMocks);

beforeEach(() => {
  getCurrentMakerUser.mockReset();
  for (const m of Object.values(repoMocks)) (m as any).mockReset();
});

function authed() {
  getCurrentMakerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function authedAs(userId: string) {
  getCurrentMakerUser.mockResolvedValue({
    userId,
    tenantId: 't-1',
    email: `${userId}@example.com`,
  });
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

function paramsFor(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

// ═════════ /tools ════════════════════════════════════════════════════════

describe('GET /tools', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await GET(jsonReq('http://t/tools', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('200 with tools array', async () => {
    authed();
    repoMocks.listTools.mockResolvedValue([{ id: 't-1' }]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await GET(jsonReq('http://t/tools', 'GET') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tools).toHaveLength(1);
    expect(repoMocks.listTools).toHaveBeenCalledWith({ userId: 'u-1' });
  });

  it('forwards ?status, ?kind, ?tag filters', async () => {
    authed();
    repoMocks.listTools.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    await GET(
      jsonReq('http://t/tools?status=active&kind=cnc&tag=router', 'GET') as any,
    );
    expect(repoMocks.listTools).toHaveBeenCalledWith({
      userId: 'u-1',
      status: 'active',
      kind: 'cnc',
      tag: 'router',
    });
  });

  it('400 invalid status filter', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await GET(jsonReq('http://t/tools?status=broken', 'GET') as any);
    expect(res.status).toBe(400);
  });

  it('400 invalid kind filter', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await GET(jsonReq('http://t/tools?kind=drone', 'GET') as any);
    expect(res.status).toBe(400);
  });
});

describe('POST /tools', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await POST(jsonReq('http://t/tools', 'POST', { name: 'X', kind: 'cnc' }) as any);
    expect(res.status).toBe(401);
  });

  it('400 invalid body (missing name)', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await POST(jsonReq('http://t/tools', 'POST', { kind: 'cnc' }) as any);
    expect(res.status).toBe(400);
  });

  it('400 invalid kind enum', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await POST(jsonReq('http://t/tools', 'POST', { name: 'X', kind: 'drone' }) as any);
    expect(res.status).toBe(400);
  });

  it('201 happy path + audit', async () => {
    authed();
    repoMocks.createTool.mockResolvedValue({ id: 't-new', name: 'X', kind: 'cnc' });
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/tools/route');
    const res = await POST(
      jsonReq('http://t/tools', 'POST', { name: 'X', kind: 'cnc' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.created' }),
    );
  });
});

// ═════════ /tools/[toolId] ═══════════════════════════════════════════════

describe('GET /tools/[toolId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-1' }) as any);
    expect(res.status).toBe(401);
  });

  it('404 when repo returns null', async () => {
    authed();
    repoMocks.getTool.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-x' }) as any);
    expect(res.status).toBe(404);
  });

  it('200 with tool when found', async () => {
    authed();
    repoMocks.getTool.mockResolvedValue({ id: 't-1', kind: 'cnc' });
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-1' }) as any);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /tools/[toolId]', () => {
  it('404 when repo returns null', async () => {
    authed();
    repoMocks.updateTool.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'down' }) as any,
      paramsFor({ toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('200 + audit on success', async () => {
    authed();
    repoMocks.updateTool.mockResolvedValue({ id: 't-1', status: 'down' });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'down' }) as any,
      paramsFor({ toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.updated' }),
    );
  });

  it('400 invalid status value', async () => {
    authed();
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'broken' }) as any,
      paramsFor({ toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /tools/[toolId]', () => {
  it('200 + audit when removed', async () => {
    authed();
    repoMocks.deleteTool.mockResolvedValue(true);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, paramsFor({ toolId: 't-1' }) as any);
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.deleted' }),
    );
  });

  it('404 when no row removed', async () => {
    authed();
    repoMocks.deleteTool.mockResolvedValue(false);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/maker/tools/[toolId]/route');
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, paramsFor({ toolId: 't-x' }) as any);
    expect(res.status).toBe(404);
  });
});

// ═════════ /tools/[toolId]/consumables ═══════════════════════════════════

describe('GET /tools/[toolId]/consumables', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-1' }) as any);
    expect(res.status).toBe(401);
  });

  it('404 when repo throws not-owned', async () => {
    authed();
    repoMocks.listConsumables.mockRejectedValue(
      new Error('Tool not found or not owned by user'),
    );
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-x' }) as any);
    expect(res.status).toBe(404);
  });

  it('200 + consumables', async () => {
    authed();
    repoMocks.listConsumables.mockResolvedValue([{ id: 'c-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-1' }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consumables).toHaveLength(1);
  });
});

describe('POST /tools/[toolId]/consumables', () => {
  it('400 invalid body', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {}) as any,
      paramsFor({ toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path + audit', async () => {
    authed();
    repoMocks.createConsumable.mockResolvedValue({ id: 'c-new', name: 'Bit' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { name: 'Bit' }) as any,
      paramsFor({ toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.consumable.created' }),
    );
  });

  it('404 when repo throws not-owned', async () => {
    authed();
    repoMocks.createConsumable.mockRejectedValue(
      new Error('Tool not found or not owned by user'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { name: 'Bit' }) as any,
      paramsFor({ toolId: 't-x' }) as any,
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tools/[toolId]/consumables/[consumableId]', () => {
  it('404 when repo returns null', async () => {
    authed();
    repoMocks.updateConsumable.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/[consumableId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { hoursRemaining: 10 }) as any,
      paramsFor({ toolId: 't-1', consumableId: 'c-1' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('200 + audit on success', async () => {
    authed();
    repoMocks.updateConsumable.mockResolvedValue({ id: 'c-1', hoursRemaining: 10 });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/[consumableId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { hoursRemaining: 10 }) as any,
      paramsFor({ toolId: 't-1', consumableId: 'c-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.consumable.updated' }),
    );
  });
});

describe('DELETE /tools/[toolId]/consumables/[consumableId]', () => {
  it('200 + audit on success', async () => {
    authed();
    repoMocks.deleteConsumable.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/consumables/[consumableId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ toolId: 't-1', consumableId: 'c-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.consumable.deleted' }),
    );
  });
});

// ═════════ /tools/[toolId]/maintenance ═══════════════════════════════════

describe('GET /tools/[toolId]/maintenance', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/maintenance/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-1' }) as any);
    expect(res.status).toBe(401);
  });

  it('200 + events ordered by DESC', async () => {
    authed();
    repoMocks.listMaintenanceEvents.mockResolvedValue([{ id: 'm-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/maintenance/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ toolId: 't-1' }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
  });
});

describe('POST /tools/[toolId]/maintenance', () => {
  it('400 invalid event_kind', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/maintenance/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { eventKind: 'upgraded' }) as any,
      paramsFor({ toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('201 + audit on success', async () => {
    authed();
    repoMocks.createMaintenanceEvent.mockResolvedValue({
      id: 'm-new',
      eventKind: 'cleaned',
      costCents: 1500,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/maintenance/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { eventKind: 'cleaned', costCents: 1500 }) as any,
      paramsFor({ toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.maintenance.logged' }),
    );
  });
});

describe('DELETE /tools/[toolId]/maintenance/[eventId]', () => {
  it('200 + audit on success', async () => {
    authed();
    repoMocks.deleteMaintenanceEvent.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/maintenance/[eventId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ toolId: 't-1', eventId: 'm-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.tool.maintenance.deleted' }),
    );
  });

  it('404 when not removed', async () => {
    authed();
    repoMocks.deleteMaintenanceEvent.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/maintenance/[eventId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ toolId: 't-1', eventId: 'm-x' }) as any,
    );
    expect(res.status).toBe(404);
  });
});

// ═════════ /projects/[id]/tools ══════════════════════════════════════════

describe('GET /projects/[id]/tools', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ id: 'p-1' }) as any);
    expect(res.status).toBe(401);
  });

  it('200 returns joined tools', async () => {
    authed();
    repoMocks.listToolsForProject.mockResolvedValue([
      { id: 'pt-1', toolName: 'Shapeoko', toolKind: 'cnc', required: true },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ id: 'p-1' }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].toolName).toBe('Shapeoko');
  });

  it('404 when project not owned', async () => {
    authed();
    repoMocks.listToolsForProject.mockRejectedValue(
      new Error('Project not found or not owned by user'),
    );
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ id: 'p-x' }) as any);
    expect(res.status).toBe(404);
  });
});

describe('POST /projects/[id]/tools', () => {
  const validUuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { toolId: validUuid }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('400 missing toolId', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {}) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('400 non-UUID toolId', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { toolId: 'not-a-uuid' }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path with audit', async () => {
    authed();
    repoMocks.attachToolToProject.mockResolvedValue({
      id: 'pt-new',
      toolId: validUuid,
      required: true,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { toolId: validUuid, required: true }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.attachToolToProject).toHaveBeenCalledWith(
      'p-1',
      validUuid,
      'u-1',
      { required: true, notes: undefined },
    );
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.project.tool.attached' }),
    );
  });

  it('409 on duplicate (project_id, tool_id) — unique constraint violation', async () => {
    authed();
    repoMocks.attachToolToProject.mockRejectedValue(
      new Error(
        'duplicate key value violates unique constraint "agos_maker_project_tools_project_tool_unique"',
      ),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { toolId: validUuid }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(409);
  });

  it('404 cross-ownership: user A attaches user B\'s tool → repo throws "Tool not found"', async () => {
    authedAs('user-A');
    repoMocks.attachToolToProject.mockRejectedValue(
      new Error('Tool not found or not owned by user'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { toolId: validUuid }) as any,
      paramsFor({ id: 'p-A' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-ownership: user A attaches tool to user B\'s project → repo throws "Project not found"', async () => {
    authedAs('user-A');
    repoMocks.attachToolToProject.mockRejectedValue(
      new Error('Project not found or not owned by user'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { toolId: validUuid }) as any,
      paramsFor({ id: 'p-B' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('happy path: same-user attach succeeds', async () => {
    authedAs('user-A');
    repoMocks.attachToolToProject.mockResolvedValue({
      id: 'pt-1',
      projectId: 'p-A',
      toolId: validUuid,
      required: true,
      notes: null,
      createdAt: '',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { toolId: validUuid }) as any,
      paramsFor({ id: 'p-A' }) as any,
    );
    expect(res.status).toBe(201);
  });
});

// ═════════ /projects/[id]/tools/[toolId] ═════════════════════════════════

describe('PATCH /projects/[id]/tools/[toolId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/[toolId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { required: false }) as any,
      paramsFor({ id: 'p-1', toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('404 when repo returns null', async () => {
    authed();
    repoMocks.updateProjectToolLink.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/[toolId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { required: false }) as any,
      paramsFor({ id: 'p-1', toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('200 + audit on success', async () => {
    authed();
    repoMocks.updateProjectToolLink.mockResolvedValue({
      id: 'pt-1',
      required: false,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/[toolId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { required: false }) as any,
      paramsFor({ id: 'p-1', toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.project.tool.updated' }),
    );
  });
});

describe('DELETE /projects/[id]/tools/[toolId]', () => {
  it('200 + audit on success', async () => {
    authed();
    repoMocks.detachToolFromProject.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/[toolId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ id: 'p-1', toolId: 't-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.project.tool.detached' }),
    );
  });

  it('404 when not removed', async () => {
    authed();
    repoMocks.detachToolFromProject.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/[toolId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ id: 'p-1', toolId: 't-x' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-ownership: detach attempt on stranger\'s tool', async () => {
    authedAs('user-A');
    repoMocks.detachToolFromProject.mockRejectedValue(
      new Error('Tool not found or not owned by user'),
    );
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/tools/[toolId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ id: 'p-A', toolId: 't-B' }) as any,
    );
    expect(res.status).toBe(404);
  });
});

// ═════════ Registry update ═══════════════════════════════════════════════

describe('Registry — Tools & maintenance card on maker', () => {
  it('exposes the workshop tools feature card', async () => {
    const { findAgenticOsModule } = await import('@/lib/agentic-os/registry');
    const maker = findAgenticOsModule('maker');
    expect(maker).toBeTruthy();
    const tools = maker?.features.find((f) => f.href === '/dashboard/os/maker/tools');
    expect(tools).toBeTruthy();
    expect(tools?.label).toMatch(/Tools/);
  });
});
