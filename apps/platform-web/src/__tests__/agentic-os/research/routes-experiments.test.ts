/**
 * Research OS — route handler tests for the Phase 1 experiment hub.
 *
 * Covers:
 *   - 401 when unauthenticated on every experiment route.
 *   - 200/201 happy paths against a mocked repo.
 *   - 404 when the experiment does not belong to the user (cross-ownership).
 *   - 400 on invalid bodies / unknown status filter / bad pagination.
 *   - Audit rows for every mutation (created / updated / archived /
 *     status_changed / deleted / restored).
 *   - Soft-archive default vs hard-delete via ?hard=true.
 *
 * Repo + session mocked at module level so the handlers exercise their own
 * validation + status code logic without touching Postgres.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentResearchUser = vi.fn();

vi.mock('@/lib/agentic-os/research/session', () => ({
  getCurrentResearchUser: (...args: unknown[]) => getCurrentResearchUser(...args),
  getResearchPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listExperimentsForUser: vi.fn(),
  getExperiment: vi.fn(),
  createExperiment: vi.fn(),
  updateExperiment: vi.fn(),
  archiveExperiment: vi.fn(),
  restoreExperiment: vi.fn(),
  deleteExperiment: vi.fn(),
  recordAudit: vi.fn(),
};

vi.mock('@/lib/agentic-os/research/repo', () => repoMocks);

beforeEach(() => {
  getCurrentResearchUser.mockReset();
  for (const m of Object.values(repoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authedUser() {
  getCurrentResearchUser.mockResolvedValue({
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

const URL_BASE = 'http://t/api/tiresias/agentic-os/research/experiments';

// ─── /experiments (list, create) ──────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/research/experiments', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await GET(new Request(URL_BASE) as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 + { experiments }', async () => {
    authedUser();
    repoMocks.listExperimentsForUser.mockResolvedValue([{ id: 'e-1', name: 'A' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await GET(new Request(URL_BASE) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.experiments).toHaveLength(1);
    expect(repoMocks.listExperimentsForUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({}),
    );
  });

  it('forwards ?status=', async () => {
    authedUser();
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    await GET(new Request(`${URL_BASE}?status=running`) as never);
    expect(repoMocks.listExperimentsForUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ status: 'running' }),
    );
  });

  it('returns 400 on an unknown status filter', async () => {
    authedUser();
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await GET(new Request(`${URL_BASE}?status=shipping`) as never);
    expect(res.status).toBe(400);
  });

  it('forwards ?tag=', async () => {
    authedUser();
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    await GET(new Request(`${URL_BASE}?tag=biology`) as never);
    expect(repoMocks.listExperimentsForUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ tag: 'biology' }),
    );
  });

  it('forwards ?archived=true', async () => {
    authedUser();
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    await GET(new Request(`${URL_BASE}?archived=true`) as never);
    expect(repoMocks.listExperimentsForUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ archived: true }),
    );
  });

  it('forwards ?archived=false', async () => {
    authedUser();
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    await GET(new Request(`${URL_BASE}?archived=false`) as never);
    expect(repoMocks.listExperimentsForUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ archived: false }),
    );
  });

  it('forwards limit + offset', async () => {
    authedUser();
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    await GET(new Request(`${URL_BASE}?limit=20&offset=40`) as never);
    expect(repoMocks.listExperimentsForUser).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ limit: 20, offset: 40 }),
    );
  });

  it('returns 400 on out-of-range limit (>200)', async () => {
    authedUser();
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await GET(new Request(`${URL_BASE}?limit=9999`) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 on negative offset', async () => {
    authedUser();
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await GET(new Request(`${URL_BASE}?offset=-5`) as never);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tiresias/agentic-os/research/experiments', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(jsonReq(URL_BASE, 'POST', { name: 'X' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (missing name)', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(jsonReq(URL_BASE, 'POST', {}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 on an invalid status enum', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(
      jsonReq(URL_BASE, 'POST', { name: 'X', status: 'shipping' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on bad targetCompletionDate format', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(
      jsonReq(URL_BASE, 'POST', { name: 'X', targetCompletionDate: '05/11/2026' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on bad coverImageUrl (not a URL)', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(
      jsonReq(URL_BASE, 'POST', { name: 'X', coverImageUrl: 'not a url' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 201 + audits a research.experiment.created row', async () => {
    authedUser();
    repoMocks.createExperiment.mockResolvedValue({ id: 'e-1', name: 'Foo' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(jsonReq(URL_BASE, 'POST', { name: 'Foo' }) as never);
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        action: 'research.experiment.created',
        projectId: 'e-1',
      }),
    );
  });

  it('accepts a NULL hypothesisId', async () => {
    authedUser();
    repoMocks.createExperiment.mockResolvedValue({ id: 'e-1', name: 'Foo' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(
      jsonReq(URL_BASE, 'POST', { name: 'Foo', hypothesisId: null }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.createExperiment).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ hypothesisId: null }),
    );
  });

  it('omits hypothesisId entirely', async () => {
    authedUser();
    repoMocks.createExperiment.mockResolvedValue({ id: 'e-1', name: 'Foo' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(jsonReq(URL_BASE, 'POST', { name: 'Foo' }) as never);
    expect(res.status).toBe(201);
  });

  it('rejects a malformed hypothesisId (not a UUID)', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/route'
    );
    const res = await POST(
      jsonReq(URL_BASE, 'POST', { name: 'X', hypothesisId: 'not-a-uuid' }) as never,
    );
    expect(res.status).toBe(400);
  });
});

// ─── /experiments/[id] ────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/research/experiments/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the experiment is not found (cross-ownership)', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'someone-elses' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + { experiment } when found', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', name: 'A', status: 'planning' });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.experiment.id).toBe('e-1');
  });
});

describe('PATCH /api/tiresias/agentic-os/research/experiments/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await PATCH(jsonReq(`${URL_BASE}/e-1`, 'PATCH', { name: 'Foo' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 before update when row not owned by caller', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await PATCH(jsonReq(`${URL_BASE}/e-1`, 'PATCH', { name: 'Foo' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(404);
    expect(repoMocks.updateExperiment).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid status', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', status: 'planning' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await PATCH(
      jsonReq(`${URL_BASE}/e-1`, 'PATCH', { status: 'shipping' }) as never,
      { params: Promise.resolve({ id: 'e-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 + audits research.experiment.updated', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', status: 'planning' });
    repoMocks.updateExperiment.mockResolvedValue({ id: 'e-1', name: 'Renamed', status: 'planning' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await PATCH(jsonReq(`${URL_BASE}/e-1`, 'PATCH', { name: 'Renamed' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.updated',
        projectId: 'e-1',
      }),
    );
  });

  it('audits research.experiment.status_changed when status changes', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', status: 'planning' });
    repoMocks.updateExperiment.mockResolvedValue({ id: 'e-1', status: 'running' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    await PATCH(jsonReq(`${URL_BASE}/e-1`, 'PATCH', { status: 'running' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.status_changed',
        payload: expect.objectContaining({ from: 'planning', to: 'running' }),
      }),
    );
  });

  it('does NOT audit status_changed when status is unchanged', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', status: 'planning' });
    repoMocks.updateExperiment.mockResolvedValue({ id: 'e-1', status: 'planning' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    await PATCH(jsonReq(`${URL_BASE}/e-1`, 'PATCH', { name: 'Foo' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    const actions = repoMocks.recordAudit.mock.calls.map((c: unknown[]) => (c[0] as { action: string }).action);
    expect(actions).not.toContain('research.experiment.status_changed');
  });
});

describe('DELETE /api/tiresias/agentic-os/research/experiments/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await DELETE(new Request(`${URL_BASE}/e-1`, { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the experiment is not found', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await DELETE(new Request(`${URL_BASE}/missing`, { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('soft-archives by default and audits research.experiment.archived', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', status: 'planning' });
    repoMocks.archiveExperiment.mockResolvedValue({
      id: 'e-1',
      status: 'archived',
      archivedAt: '2026-05-11T00:00:00Z',
    });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await DELETE(new Request(`${URL_BASE}/e-1`, { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(200);
    expect(repoMocks.deleteExperiment).not.toHaveBeenCalled();
    expect(repoMocks.archiveExperiment).toHaveBeenCalledWith('e-1', 'u-1');
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.experiment.archived' }),
    );
  });

  it('hard-deletes when ?hard=true and audits research.experiment.deleted', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', status: 'planning' });
    repoMocks.deleteExperiment.mockResolvedValue(true);
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/route'
    );
    const res = await DELETE(
      new Request(`${URL_BASE}/e-1?hard=true`, { method: 'DELETE' }) as never,
      { params: Promise.resolve({ id: 'e-1' }) },
    );
    expect(res.status).toBe(200);
    expect(repoMocks.archiveExperiment).not.toHaveBeenCalled();
    expect(repoMocks.deleteExperiment).toHaveBeenCalledWith('e-1', 'u-1');
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.deleted',
        payload: expect.objectContaining({ hard: true }),
      }),
    );
  });
});

// ─── /experiments/[id]/restore ────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/research/experiments/[id]/restore', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/restore/route'
    );
    const res = await POST(new Request(`${URL_BASE}/e-1/restore`, { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the experiment does not exist (cross-ownership)', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/restore/route'
    );
    const res = await POST(new Request(`${URL_BASE}/e-1/restore`, { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + audits research.experiment.restored on success', async () => {
    authedUser();
    repoMocks.getExperiment.mockResolvedValue({ id: 'e-1', status: 'archived' });
    repoMocks.restoreExperiment.mockResolvedValue({
      id: 'e-1',
      status: 'planning',
      archivedAt: null,
    });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/restore/route'
    );
    const res = await POST(new Request(`${URL_BASE}/e-1/restore`, { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'e-1' }),
    });
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.experiment.restored' }),
    );
  });
});
