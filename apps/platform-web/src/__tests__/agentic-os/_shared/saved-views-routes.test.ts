/**
 * Shared SavedViews — route handler tests.
 *
 * Mocks the shared OS session helper + the saved-views repo so the
 * handlers are exercised in isolation. Pattern mirrors
 * `autobiographer/routes-arcs.test.ts`.
 *
 * @license MIT — Tiresias platform / Wave E shared primitives (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentOsUser = vi.fn();
vi.mock('@/lib/agentic-os/_shared/session', () => ({
  getCurrentOsUser: (...args: unknown[]) => getCurrentOsUser(...args),
  getOsPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listSavedViews: vi.fn(),
  getSavedView: vi.fn(),
  createSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
};
vi.mock('@/lib/agentic-os/_shared/saved-views-repo', () => repoMocks);

const recordAudit = vi.fn();
vi.mock('@/lib/agentic-os/health/repo', () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

beforeEach(() => {
  getCurrentOsUser.mockReset();
  recordAudit.mockReset();
  recordAudit.mockResolvedValue(undefined);
  for (const m of Object.values(repoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authedUser() {
  getCurrentOsUser.mockResolvedValue({
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

const COLLECTION = '@/app/api/tiresias/agentic-os/shared/saved-views/route';
const ITEM = '@/app/api/tiresias/agentic-os/shared/saved-views/[id]/route';

// ─── GET /shared/saved-views ────────────────────────────────────────────────

describe('GET /shared/saved-views', () => {
  it('401 when unauthed', async () => {
    getCurrentOsUser.mockResolvedValue(null);
    const { GET } = await import(COLLECTION);
    const res = await GET(
      jsonReq('http://t/x?entityKind=blockers', 'GET') as never,
    );
    expect(res.status).toBe(401);
  });

  it('400 when entityKind query param is missing', async () => {
    authedUser();
    const { GET } = await import(COLLECTION);
    const res = await GET(jsonReq('http://t/x', 'GET') as never);
    expect(res.status).toBe(400);
    expect(repoMocks.listSavedViews).not.toHaveBeenCalled();
  });

  it('200 + views, scoped by the caller + entityKind', async () => {
    authedUser();
    repoMocks.listSavedViews.mockResolvedValue([
      { id: 'sv-1', name: 'A', query: {} },
    ]);
    const { GET } = await import(COLLECTION);
    const res = await GET(
      jsonReq('http://t/x?entityKind=research%3Ahypotheses', 'GET') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.views).toHaveLength(1);
    expect(repoMocks.listSavedViews).toHaveBeenCalledWith(
      'u-1',
      'research:hypotheses',
    );
  });
});

// ─── POST /shared/saved-views ───────────────────────────────────────────────

describe('POST /shared/saved-views', () => {
  it('401 when unauthed', async () => {
    getCurrentOsUser.mockResolvedValue(null);
    const { POST } = await import(COLLECTION);
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        entityKind: 'blockers',
        name: 'X',
        query: {},
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('400 on missing required fields', async () => {
    authedUser();
    const { POST } = await import(COLLECTION);
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as never);
    expect(res.status).toBe(400);
    expect(repoMocks.createSavedView).not.toHaveBeenCalled();
  });

  it('400 on unknown field (strict body)', async () => {
    authedUser();
    const { POST } = await import(COLLECTION);
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        entityKind: 'blockers',
        name: 'X',
        query: {},
        bogus: 1,
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('201 + creates the view and audits shared.saved-view.created', async () => {
    authedUser();
    repoMocks.createSavedView.mockResolvedValue({
      id: 'sv-7',
      userId: 'u-1',
      entityKind: 'research:hypotheses',
      name: 'Open',
      query: { status: 'open' },
      createdAt: '2026-05-14T10:00:00.000Z',
      updatedAt: '2026-05-14T10:00:00.000Z',
    });
    const { POST } = await import(COLLECTION);
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        id: '11111111-2222-4333-8444-555555555555',
        entityKind: 'research:hypotheses',
        name: 'Open',
        query: { status: 'open' },
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.view.id).toBe('sv-7');
    expect(repoMocks.createSavedView).toHaveBeenCalledWith('u-1', {
      id: '11111111-2222-4333-8444-555555555555',
      entityKind: 'research:hypotheses',
      name: 'Open',
      query: { status: 'open' },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        action: 'shared.saved-view.created',
      }),
    );
  });

  it('accepts a body with no id (DB-side id assignment)', async () => {
    authedUser();
    repoMocks.createSavedView.mockResolvedValue({
      id: 'sv-db',
      userId: 'u-1',
      entityKind: 'blockers',
      name: 'X',
      query: {},
      createdAt: '2026-05-14T10:00:00.000Z',
      updatedAt: '2026-05-14T10:00:00.000Z',
    });
    const { POST } = await import(COLLECTION);
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        entityKind: 'blockers',
        name: 'X',
        query: {},
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.createSavedView).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ id: undefined }),
    );
  });
});

// ─── DELETE /shared/saved-views/[id] ────────────────────────────────────────

describe('DELETE /shared/saved-views/[id]', () => {
  it('401 when unauthed', async () => {
    getCurrentOsUser.mockResolvedValue(null);
    const { DELETE } = await import(ITEM);
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'sv-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 when the id does not belong to the caller', async () => {
    authedUser();
    repoMocks.deleteSavedView.mockResolvedValue(false);
    const { DELETE } = await import(ITEM);
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'sv-foreign' }),
    });
    expect(res.status).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('200 + ok and audits shared.saved-view.deleted on success', async () => {
    authedUser();
    repoMocks.deleteSavedView.mockResolvedValue(true);
    const { DELETE } = await import(ITEM);
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'sv-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(repoMocks.deleteSavedView).toHaveBeenCalledWith('sv-1', 'u-1');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        action: 'shared.saved-view.deleted',
      }),
    );
  });
});
