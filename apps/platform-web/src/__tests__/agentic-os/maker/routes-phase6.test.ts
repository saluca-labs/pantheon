/**
 * Maker OS — Phase 6 route handler tests.
 *
 * Covers:
 *   - 401 unauthenticated on every new route.
 *   - GET /blockers — 200 with items array + generated_at, limit param.
 *   - GET /projects/[id]/dependencies — 200 with upstream + downstream lists.
 *   - POST /projects/[id]/dependencies — 201, 400 self-loop, 404 cross-
 *     ownership, 409 duplicate, 400 invalid body.
 *   - PATCH /projects/[id]/dependencies/[depId] — 200, 404 missing, audit.
 *   - DELETE /projects/[id]/dependencies/[depId] — 200, 404, audit.
 *   - Milestone POST/PATCH accept the new Phase 6 fields.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentMakerUser = vi.fn();

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getCurrentMakerUser: (...args: unknown[]) => getCurrentMakerUser(...args),
  getMakerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listProjectDependencies: vi.fn(),
  createProjectDependency: vi.fn(),
  updateProjectDependency: vi.fn(),
  deleteProjectDependency: vi.fn(),
  listTopBlockers: vi.fn(),
  listMilestones: vi.fn(),
  createMilestone: vi.fn(),
  getMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  recordAudit: vi.fn(),
};

vi.mock('@/lib/agentic-os/maker/repo', () => repoMocks);

beforeEach(() => {
  getCurrentMakerUser.mockReset();
  for (const m of Object.values(repoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authed() {
  getCurrentMakerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
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

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const OTHER_UUID = '00000000-0000-4000-8000-000000000002';

// ═════════ /blockers ═════════════════════════════════════════════════════════

describe('GET /blockers', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/blockers/route');
    const res = await GET(jsonReq('http://t/blockers', 'GET') as never);
    expect(res.status).toBe(401);
  });

  it('200 with items array + generated_at', async () => {
    authed();
    repoMocks.listTopBlockers.mockResolvedValue([{ id: 'm-1', kind: 'milestone' }]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/blockers/route');
    const res = await GET(jsonReq('http://t/blockers', 'GET') as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(typeof data.generated_at).toBe('string');
    expect(repoMocks.listTopBlockers).toHaveBeenCalledWith('u-1', { limit: 25 });
  });

  it('honors ?limit= within the 100 cap', async () => {
    authed();
    repoMocks.listTopBlockers.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/blockers/route');
    await GET(jsonReq('http://t/blockers?limit=50', 'GET') as never);
    expect(repoMocks.listTopBlockers).toHaveBeenCalledWith('u-1', { limit: 50 });
  });

  it('caps the limit at 100', async () => {
    authed();
    repoMocks.listTopBlockers.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/blockers/route');
    await GET(jsonReq('http://t/blockers?limit=500', 'GET') as never);
    expect(repoMocks.listTopBlockers).toHaveBeenCalledWith('u-1', { limit: 100 });
  });

  it('400 for invalid limit', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/blockers/route');
    const res = await GET(jsonReq('http://t/blockers?limit=-1', 'GET') as never);
    expect(res.status).toBe(400);
  });
});

// ═════════ /projects/[id]/dependencies (collection) ══════════════════════════

describe('GET /projects/[id]/dependencies', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await GET(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'GET') as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('200 with upstream + downstream lists', async () => {
    authed();
    repoMocks.listProjectDependencies.mockResolvedValue({
      upstream: [{ id: 'd-1' }],
      downstream: [{ id: 'd-2' }],
    });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await GET(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'GET') as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.upstream).toHaveLength(1);
    expect(data.downstream).toHaveLength(1);
  });

  it('404 when the repo throws not-found', async () => {
    authed();
    repoMocks.listProjectDependencies.mockRejectedValue(new Error('not found'));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await GET(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'GET') as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /projects/[id]/dependencies', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await POST(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'POST', {
        to_project_id: OTHER_UUID,
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid body', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await POST(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'POST', {
        to_project_id: 'not-a-uuid',
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('400 on self-loop (UI guard)', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await POST(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'POST', {
        to_project_id: VALID_UUID,
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/cannot depend on itself/);
  });

  it('404 when peer project is not owned by user', async () => {
    authed();
    repoMocks.createProjectDependency.mockRejectedValue(
      new Error('Peer project not found or not owned by user'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await POST(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'POST', {
        to_project_id: OTHER_UUID,
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('409 on duplicate edge', async () => {
    authed();
    repoMocks.createProjectDependency.mockRejectedValue(
      new Error(
        'duplicate key value violates unique constraint "agos_maker_project_dependencies_edge_unique"',
      ),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await POST(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'POST', {
        to_project_id: OTHER_UUID,
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(409);
  });

  it('201 on happy path, with audit', async () => {
    authed();
    repoMocks.createProjectDependency.mockResolvedValue({
      id: 'd-1',
      fromProjectId: VALID_UUID,
      toProjectId: OTHER_UUID,
      kind: 'blocks',
      status: 'open',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/route'
    );
    const res = await POST(
      jsonReq(`http://t/projects/${VALID_UUID}/dependencies`, 'POST', {
        to_project_id: OTHER_UUID,
        kind: 'blocks',
        notes: 'x',
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.dependency.created',
        actorId: 'u-1',
      }),
    );
  });
});

// ═════════ /projects/[id]/dependencies/[depId] ═══════════════════════════════

describe('PATCH /projects/[id]/dependencies/[depId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/d`, 'PATCH', { status: 'cleared' }) as never,
      paramsFor({ id: VALID_UUID, depId: 'd-1' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid body', async () => {
    authed();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/d`, 'PATCH', { status: 'bogus' }) as never,
      paramsFor({ id: VALID_UUID, depId: 'd-1' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('404 when the row does not exist', async () => {
    authed();
    repoMocks.updateProjectDependency.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/d`, 'PATCH', { status: 'cleared' }) as never,
      paramsFor({ id: VALID_UUID, depId: 'd-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('200 on success with audit', async () => {
    authed();
    repoMocks.updateProjectDependency.mockResolvedValue({
      id: 'd-1',
      fromProjectId: VALID_UUID,
      toProjectId: OTHER_UUID,
      kind: 'blocks',
      status: 'cleared',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/d`, 'PATCH', { status: 'cleared' }) as never,
      paramsFor({ id: VALID_UUID, depId: 'd-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.dependency.updated',
      }),
    );
  });
});

describe('DELETE /projects/[id]/dependencies/[depId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/d`, 'DELETE') as never,
      paramsFor({ id: VALID_UUID, depId: 'd-1' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('404 when nothing removed', async () => {
    authed();
    repoMocks.deleteProjectDependency.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/d`, 'DELETE') as never,
      paramsFor({ id: VALID_UUID, depId: 'd-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('200 with audit on success', async () => {
    authed();
    repoMocks.deleteProjectDependency.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/d`, 'DELETE') as never,
      paramsFor({ id: VALID_UUID, depId: 'd-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.dependency.deleted',
      }),
    );
  });
});

// ═════════ Phase 6 milestones routes ═════════════════════════════════════════

describe('POST /projects/[id]/milestones (Phase 6 fields)', () => {
  it('accepts status / priority / is_blocker / blocked_reason at create time', async () => {
    authed();
    repoMocks.createMilestone.mockResolvedValue({
      id: 'm-1',
      label: 'x',
      status: 'at_risk',
      priority: 'high',
      isBlocker: true,
      blockedReason: 'wait',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/route'
    );
    const res = await POST(
      jsonReq(`http://t/m`, 'POST', {
        label: 'x',
        status: 'at_risk',
        priority: 'high',
        isBlocker: true,
        blockedReason: 'wait',
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.createMilestone).toHaveBeenCalledWith(
      VALID_UUID,
      'u-1',
      expect.objectContaining({
        label: 'x',
        status: 'at_risk',
        priority: 'high',
        isBlocker: true,
        blockedReason: 'wait',
      }),
    );
  });

  it('400 on invalid status value', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/route'
    );
    const res = await POST(
      jsonReq(`http://t/m`, 'POST', {
        label: 'x',
        status: 'bogus',
      }) as never,
      paramsFor({ id: VALID_UUID }) as never,
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /projects/[id]/milestones/[milestoneId] (Phase 6 fields)', () => {
  it('accepts status / priority / is_blocker / blocked_reason on patch', async () => {
    authed();
    repoMocks.updateMilestone.mockResolvedValue({
      id: 'm-1',
      label: 'x',
      status: 'done',
      priority: 'medium',
      isBlocker: false,
      blockedReason: null,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/m`, 'PATCH', { status: 'done' }) as never,
      paramsFor({ id: VALID_UUID, milestoneId: 'm-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.updateMilestone).toHaveBeenCalledWith(
      'm-1',
      VALID_UUID,
      'u-1',
      expect.objectContaining({ status: 'done' }),
    );
  });

  it('400 on invalid priority value', async () => {
    authed();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/m`, 'PATCH', { priority: 'urgent' }) as never,
      paramsFor({ id: VALID_UUID, milestoneId: 'm-1' }) as never,
    );
    expect(res.status).toBe(400);
  });
});
