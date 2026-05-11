/**
 * Maker OS — route handler tests.
 *
 * Covers:
 *   - 401 when unauthenticated on every project route.
 *   - 200/201 happy paths against a mocked repo.
 *   - 404 when the project does not belong to the user.
 *   - 400 on invalid body for POST/PATCH/phase-progress.
 *   - 308 redirect from the legacy /builds proxy.
 *
 * The repo + session are mocked at module level so the handler exercises its
 * own validation + status code logic without touching Postgres.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const getCurrentMakerUser = vi.fn();

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getCurrentMakerUser: (...args: any[]) => getCurrentMakerUser(...args),
  getMakerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  updatePhaseProgress: vi.fn(),
  recordAudit: vi.fn(),
};

vi.mock('@/lib/agentic-os/maker/repo', () => repoMocks);

beforeEach(() => {
  getCurrentMakerUser.mockReset();
  for (const m of Object.values(repoMocks)) (m as any).mockReset();
});

function authedUser() {
  getCurrentMakerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

// ─── /projects (list, create) ────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/maker/projects', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/route'
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 + { projects } when authenticated', async () => {
    authedUser();
    repoMocks.listProjects.mockResolvedValue([
      { id: 'p-1', name: 'Foo' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/route'
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(repoMocks.listProjects).toHaveBeenCalledWith('u-1');
  });
});

describe('POST /api/tiresias/agentic-os/maker/projects', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', { name: 'X' }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (missing name)', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(400);
  });

  it('returns 201 + records an audit row on success', async () => {
    authedUser();
    repoMocks.createProject.mockResolvedValue({ id: 'p-1', name: 'Foo' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', { name: 'Foo' }) as any);
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        action: 'maker.project.created',
        projectId: 'p-1',
      }),
    );
  });
});

// ─── /projects/[id] ──────────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/maker/projects/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the project is not found', async () => {
    authedUser();
    repoMocks.getProject.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + { project } when found', async () => {
    authedUser();
    repoMocks.getProject.mockResolvedValue({ id: 'p-1', name: 'Foo' });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).project.id).toBe('p-1');
  });
});

describe('PATCH /api/tiresias/agentic-os/maker/projects/[id]', () => {
  it('returns 400 on an invalid status value', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'planning' }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the project is not found', async () => {
    authedUser();
    repoMocks.updateProject.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { name: 'Foo' }) as any,
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 + project on success', async () => {
    authedUser();
    repoMocks.updateProject.mockResolvedValue({ id: 'p-1', name: 'Renamed' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { name: 'Renamed' }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.project.updated' }),
    );
  });
});

describe('DELETE /api/tiresias/agentic-os/maker/projects/[id]', () => {
  it('returns 404 when the project does not exist', async () => {
    authedUser();
    repoMocks.deleteProject.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + audits on success', async () => {
    authedUser();
    repoMocks.deleteProject.mockResolvedValue(true);
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/route'
    );
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.project.deleted' }),
    );
  });
});

// ─── /projects/[id]/phase-progress ───────────────────────────────────────────

describe('PATCH /api/tiresias/agentic-os/maker/projects/[id]/phase-progress', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/phase-progress/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { concept: 10 }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on out-of-range value', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/phase-progress/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { concept: 200 }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on unknown phase key', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/phase-progress/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { planning: 50 }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the project is not found', async () => {
    authedUser();
    repoMocks.updatePhaseProgress.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/phase-progress/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { concept: 10 }) as any,
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 on success and only forwards present keys', async () => {
    authedUser();
    repoMocks.updatePhaseProgress.mockResolvedValue({
      id: 'p-1',
      phaseProgress: { concept: 30 },
    });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/phase-progress/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { concept: 30 }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);

    // The repo call must NOT have received `done: 0` etc — only the keys
    // present on the request body.
    const [, , patch] = repoMocks.updatePhaseProgress.mock.calls[0];
    expect(patch).toEqual({ concept: 30 });
  });
});

// Phase 2 deletes the legacy /builds 308 proxy routes — Maker is replacing
// per-project parts with the catalog + BOM design, so the old surface goes
// away entirely. The 308 tests that used to live here have been removed; the
// new BOM + catalog + supplier route tests live in catalog-routes.test.ts,
// bom-routes.test.ts, and supplier-routes.test.ts.
