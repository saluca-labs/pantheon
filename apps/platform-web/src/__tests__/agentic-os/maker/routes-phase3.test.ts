/**
 * Maker OS — Phase 3 route handler tests.
 *
 * Covers:
 *   - 401 unauthenticated on every new project-scoped route + the hub
 *     recent-activity route.
 *   - 200/201 happy paths against the mocked repo.
 *   - 400 invalid bodies (POST missing required, PATCH bad shapes).
 *   - 404 when repo returns null (not owned / not found).
 *   - completeStep undo flag is read from ?undo=true query param.
 *   - reorder route forwards the body order to the repo.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentMakerUser = vi.fn();

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getCurrentMakerUser: (...args: any[]) => getCurrentMakerUser(...args),
  getMakerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listBuildSteps: vi.fn(),
  getBuildStep: vi.fn(),
  createBuildStep: vi.fn(),
  updateBuildStep: vi.fn(),
  deleteBuildStep: vi.fn(),
  completeStep: vi.fn(),
  reorderBuildSteps: vi.fn(),
  listLogEntries: vi.fn(),
  getLogEntry: vi.fn(),
  createLogEntry: vi.fn(),
  updateLogEntry: vi.fn(),
  deleteLogEntry: vi.fn(),
  listRecentLogEntries: vi.fn(),
  listMilestones: vi.fn(),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  toggleMilestoneComplete: vi.fn(),
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

// ═════════ /steps ════════════════════════════════════════════════════════

describe('GET /projects/[id]/steps', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, paramsFor({ id: 'p-1' }) as any);
    expect(res.status).toBe(401);
  });

  it('200 + steps when authenticated', async () => {
    authed();
    repoMocks.listBuildSteps.mockResolvedValue([{ id: 's-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps).toHaveLength(1);
    expect(repoMocks.listBuildSteps).toHaveBeenCalledWith('p-1', 'u-1');
  });

  it('404 when repo throws "Project not found"', async () => {
    authed();
    repoMocks.listBuildSteps.mockRejectedValue(new Error('Project not found or not owned by user'));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as any,
      paramsFor({ id: 'p-x' }) as any,
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /projects/[id]/steps', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'X' }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('400 invalid body (missing title)', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {}) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path', async () => {
    authed();
    repoMocks.createBuildStep.mockResolvedValue({
      id: 's-new',
      ordinal: 4,
      title: 'Polish',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'Polish', estMinutes: 30 }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.step.created' }),
    );
  });
});

describe('PATCH /projects/[id]/steps/[stepId]/complete', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/[stepId]/complete/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x?undo=false', 'PATCH') as any,
      paramsFor({ id: 'p-1', stepId: 's-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('passes undo=true when query flag set', async () => {
    authed();
    repoMocks.completeStep.mockResolvedValue({ id: 's-1', completedAt: null });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/[stepId]/complete/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x?undo=true', 'PATCH') as any,
      paramsFor({ id: 'p-1', stepId: 's-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.completeStep).toHaveBeenCalledWith('s-1', 'p-1', 'u-1', {
      undo: true,
    });
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.step.uncompleted' }),
    );
  });

  it('passes undo=false by default', async () => {
    authed();
    repoMocks.completeStep.mockResolvedValue({ id: 's-1', completedAt: new Date().toISOString() });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/[stepId]/complete/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH') as any,
      paramsFor({ id: 'p-1', stepId: 's-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.completeStep).toHaveBeenCalledWith('s-1', 'p-1', 'u-1', {
      undo: false,
    });
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.step.completed' }),
    );
  });

  it('404 when repo returns null', async () => {
    authed();
    repoMocks.completeStep.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/[stepId]/complete/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH') as any,
      paramsFor({ id: 'p-1', stepId: 's-x' }) as any,
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /projects/[id]/steps/reorder', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/reorder/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { order: [] }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('400 on missing body', async () => {
    authed();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/reorder/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { wrong: true }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('200 forwards order ids', async () => {
    authed();
    repoMocks.reorderBuildSteps.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/steps/reorder/route'
    );
    const stepIds = [
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    ];
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        order: stepIds.map((id, i) => ({ stepId: id, ordinal: i + 1 })),
      }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.reorderBuildSteps).toHaveBeenCalledWith('p-1', 'u-1', stepIds);
  });
});

// ═════════ /log ══════════════════════════════════════════════════════════

describe('GET /projects/[id]/log', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('passes stepId, limit, before to repo', async () => {
    authed();
    repoMocks.listLogEntries.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/route'
    );
    await GET(
      jsonReq('http://t/x?stepId=s-1&limit=10&before=2026-05-11T00:00:00Z', 'GET') as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(repoMocks.listLogEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p-1',
        userId: 'u-1',
        stepId: 's-1',
        limit: 10,
        before: '2026-05-11T00:00:00Z',
      }),
    );
  });
});

describe('POST /projects/[id]/log', () => {
  it('400 missing body', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {}) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('400 invalid attached_url kind', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        body: 'note',
        attachedUrls: [{ url: 'https://x.com', kind: 'audio' }],
      }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path with valid attachments', async () => {
    authed();
    repoMocks.createLogEntry.mockResolvedValue({
      id: 'e-1',
      stepId: null,
      attachedUrls: [{ url: 'https://x/1.jpg', kind: 'photo' }],
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        body: 'note',
        attachedUrls: [{ url: 'https://x/1.jpg', kind: 'photo' }],
      }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.log_entry.created' }),
    );
  });
});

describe('PATCH /projects/[id]/log/[entryId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { body: 'x' }) as any,
      paramsFor({ id: 'p-1', entryId: 'e-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('404 when repo returns null', async () => {
    authed();
    repoMocks.updateLogEntry.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { body: 'x' }) as any,
      paramsFor({ id: 'p-1', entryId: 'e-x' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('200 happy patch', async () => {
    authed();
    repoMocks.updateLogEntry.mockResolvedValue({ id: 'e-1', body: 'new' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/log/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { body: 'new' }) as any,
      paramsFor({ id: 'p-1', entryId: 'e-1' }) as any,
    );
    expect(res.status).toBe(200);
  });
});

// ═════════ /milestones ═══════════════════════════════════════════════════

describe('POST /projects/[id]/milestones', () => {
  it('400 missing label', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {}) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('400 invalid due_at shape', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { label: 'OK', dueAt: '2026/12/31' }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path', async () => {
    authed();
    repoMocks.createMilestone.mockResolvedValue({ id: 'm-1', label: 'Hello' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { label: 'Hello' }) as any,
      paramsFor({ id: 'p-1' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.milestone.created' }),
    );
  });
});

describe('PATCH /projects/[id]/milestones/[milestoneId]/complete', () => {
  it('200 toggles via repo + records appropriate audit action', async () => {
    authed();
    repoMocks.toggleMilestoneComplete.mockResolvedValue({
      id: 'm-1',
      completedAt: new Date().toISOString(),
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/complete/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH') as any,
      paramsFor({ id: 'p-1', milestoneId: 'm-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.milestone.completed' }),
    );
  });

  it('emits uncompleted audit when toggle clears completion', async () => {
    authed();
    repoMocks.toggleMilestoneComplete.mockResolvedValue({
      id: 'm-1',
      completedAt: null,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/complete/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH') as any,
      paramsFor({ id: 'p-1', milestoneId: 'm-1' }) as any,
    );
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.milestone.uncompleted' }),
    );
  });

  it('404 when repo returns null', async () => {
    authed();
    repoMocks.toggleMilestoneComplete.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/complete/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH') as any,
      paramsFor({ id: 'p-1', milestoneId: 'm-x' }) as any,
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /projects/[id]/milestones/[milestoneId]', () => {
  it('returns 404 when nothing removed', async () => {
    authed();
    repoMocks.deleteMilestone.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ id: 'p-1', milestoneId: 'm-x' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and audits on success', async () => {
    authed();
    repoMocks.deleteMilestone.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ id: 'p-1', milestoneId: 'm-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.milestone.deleted' }),
    );
  });
});

// ═════════ /recent-activity (hub) ════════════════════════════════════════

describe('GET /recent-activity', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/recent-activity/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('returns ordered entries from repo (default limit 5)', async () => {
    authed();
    repoMocks.listRecentLogEntries.mockResolvedValue([
      { id: 'e-1', projectName: 'A' },
      { id: 'e-2', projectName: 'B' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/recent-activity/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(repoMocks.listRecentLogEntries).toHaveBeenCalledWith('u-1', 5);
  });

  it('respects ?limit query param', async () => {
    authed();
    repoMocks.listRecentLogEntries.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/recent-activity/route'
    );
    await GET(jsonReq('http://t/x?limit=15', 'GET') as any);
    expect(repoMocks.listRecentLogEntries).toHaveBeenCalledWith('u-1', 15);
  });

  it('falls back to 5 when limit is invalid', async () => {
    authed();
    repoMocks.listRecentLogEntries.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/recent-activity/route'
    );
    await GET(jsonReq('http://t/x?limit=abc', 'GET') as any);
    expect(repoMocks.listRecentLogEntries).toHaveBeenCalledWith('u-1', 5);
  });
});
