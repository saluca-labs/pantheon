/**
 * Creator OS — publishing-targets route handler tests.
 *
 * Covers auth gating, body validation (platform/format enums, ISBN
 * checksum, BISAC format), happy-path CRUD, and the 404 contract when
 * the parent book belongs to another user.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const getCurrentCreatorUser = vi.fn();

vi.mock('@/lib/agentic-os/creator/session', () => ({
  getCurrentCreatorUser: (...args: unknown[]) => getCurrentCreatorUser(...args),
  getCreatorPool: () => ({ query: vi.fn() }),
}));

const targetsRepoMocks = {
  listTargets: vi.fn(),
  getTarget: vi.fn(),
  createTarget: vi.fn(),
  updateTarget: vi.fn(),
  deleteTarget: vi.fn(),
};

vi.mock('@/lib/agentic-os/creator/publishing-targets-repo', () => targetsRepoMocks);

beforeEach(() => {
  getCurrentCreatorUser.mockReset();
  for (const m of Object.values(targetsRepoMocks)) {
    (m as unknown as { mockReset: () => void }).mockReset();
  }
});

function authedUser() {
  getCurrentCreatorUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function jsonReq(method: string, body?: unknown): Request {
  return new Request('http://test/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

const params = Promise.resolve({ bookId: 'b-1' });
const targetParams = Promise.resolve({ bookId: 'b-1', targetId: 't-1' });

// ─── GET /publishing-targets ────────────────────────────────────────────────

describe('GET /publishing-targets', () => {
  it('401 when unauthenticated', async () => {
    getCurrentCreatorUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await GET(jsonReq('GET') as never, { params } as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 + { targets }', async () => {
    authedUser();
    targetsRepoMocks.listTargets.mockResolvedValue([
      { id: 't-1', platform: 'kdp_paperback' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await GET(jsonReq('GET') as never, { params } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.targets).toHaveLength(1);
    expect(targetsRepoMocks.listTargets).toHaveBeenCalledWith('b-1', 'u-1');
  });
});

// ─── POST /publishing-targets ───────────────────────────────────────────────

describe('POST /publishing-targets', () => {
  it('400 on missing platform', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await POST(
      jsonReq('POST', { format: 'paperback' }) as never,
      { params } as never,
    );
    expect(res.status).toBe(400);
  });

  it('400 on invalid ISBN-13 checksum', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await POST(
      jsonReq('POST', {
        platform: 'kdp_paperback',
        format: 'paperback',
        isbn: '978-0-13-468599-2', // bad checksum
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(400);
  });

  it('accepts empty-string ISBN (deferred until publish-ready)', async () => {
    authedUser();
    targetsRepoMocks.createTarget.mockResolvedValue({
      id: 't-1',
      bookId: 'b-1',
      platform: 'kdp_paperback',
      format: 'paperback',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await POST(
      jsonReq('POST', {
        platform: 'kdp_paperback',
        format: 'paperback',
        isbn: '',
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(201);
  });

  it('400 on malformed BISAC code', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await POST(
      jsonReq('POST', {
        platform: 'kdp_paperback',
        format: 'paperback',
        bisacCodes: ['NOT-VALID'],
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(400);
  });

  it('404 when createTarget returns null (book not owned)', async () => {
    authedUser();
    targetsRepoMocks.createTarget.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await POST(
      jsonReq('POST', {
        platform: 'kdp_paperback',
        format: 'paperback',
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(404);
  });

  it('201 + target body on happy path', async () => {
    authedUser();
    targetsRepoMocks.createTarget.mockResolvedValue({
      id: 't-1',
      bookId: 'b-1',
      platform: 'kdp_paperback',
      format: 'paperback',
      trimSize: '6x9',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/route'
    );
    const res = await POST(
      jsonReq('POST', {
        platform: 'kdp_paperback',
        format: 'paperback',
        trimSize: '6x9',
        bisacCodes: ['COM051000'],
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(201);
    expect(targetsRepoMocks.createTarget).toHaveBeenCalledWith(
      'b-1',
      'u-1',
      expect.objectContaining({
        platform: 'kdp_paperback',
        format: 'paperback',
        trimSize: '6x9',
        bisacCodes: ['COM051000'],
      }),
    );
  });
});

// ─── PATCH /publishing-targets/[targetId] ────────────────────────────────────

describe('PATCH /publishing-targets/[targetId]', () => {
  it('401 when unauthenticated', async () => {
    getCurrentCreatorUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/[targetId]/route'
    );
    const res = await PATCH(jsonReq('PATCH', {}) as never, {
      params: targetParams,
    } as never);
    expect(res.status).toBe(401);
  });

  it('404 when target not found', async () => {
    authedUser();
    targetsRepoMocks.updateTarget.mockResolvedValue({ kind: 'not_found' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/[targetId]/route'
    );
    const res = await PATCH(jsonReq('PATCH', { status: 'ready' }) as never, {
      params: targetParams,
    } as never);
    expect(res.status).toBe(404);
  });

  it('200 + updated target on happy path', async () => {
    authedUser();
    targetsRepoMocks.updateTarget.mockResolvedValue({
      kind: 'ok',
      target: { id: 't-1', status: 'ready' },
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/[targetId]/route'
    );
    const res = await PATCH(jsonReq('PATCH', { status: 'ready' }) as never, {
      params: targetParams,
    } as never);
    expect(res.status).toBe(200);
    expect(targetsRepoMocks.updateTarget).toHaveBeenCalledWith(
      't-1',
      'b-1',
      'u-1',
      { status: 'ready' },
    );
  });

  it('400 on invalid status enum', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/[targetId]/route'
    );
    const res = await PATCH(
      jsonReq('PATCH', { status: 'invalid' }) as never,
      { params: targetParams } as never,
    );
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /publishing-targets/[targetId] ───────────────────────────────────

describe('DELETE /publishing-targets/[targetId]', () => {
  it('404 when nothing was deleted', async () => {
    authedUser();
    targetsRepoMocks.deleteTarget.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/[targetId]/route'
    );
    const res = await DELETE(jsonReq('DELETE') as never, {
      params: targetParams,
    } as never);
    expect(res.status).toBe(404);
  });

  it('200 + { ok: true } on success', async () => {
    authedUser();
    targetsRepoMocks.deleteTarget.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/publishing-targets/[targetId]/route'
    );
    const res = await DELETE(jsonReq('DELETE') as never, {
      params: targetParams,
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
