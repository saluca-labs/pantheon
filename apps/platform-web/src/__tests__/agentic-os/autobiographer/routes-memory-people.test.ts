/**
 * Autobiographer OS — memory↔people route handler tests.
 *
 * Covers 401, 200/201, 400 on bad body, 404 on cross-ownership, 409 on
 * duplicate link, and audit invocation across POST link / PATCH role /
 * DELETE.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const getCurrentAutobiographerUser = vi.fn();

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: any[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const memRepoMocks = {
  listMemories: vi.fn(),
  getMemory: vi.fn(),
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  listMemoriesForBook: vi.fn(),
};

const memPeopleRepoMocks = {
  listPeopleForMemory: vi.fn(),
  listMemoriesForPerson: vi.fn(),
  listBooksForPerson: vi.fn(),
  linkPersonToMemory: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
};

vi.mock(
  '@/lib/agentic-os/autobiographer/memories-repo',
  () => memRepoMocks,
);
vi.mock(
  '@/lib/agentic-os/autobiographer/memory-people-repo',
  () => memPeopleRepoMocks,
);

const recordAudit = vi.fn();
vi.mock('@/lib/agentic-os/autobiographer/repo', () => ({
  recordAudit: (...args: any[]) => recordAudit(...args),
  listChapters: vi.fn(),
  getChapter: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  listEvents: vi.fn(),
  createEvent: vi.fn(),
}));

beforeEach(() => {
  getCurrentAutobiographerUser.mockReset();
  recordAudit.mockReset();
  for (const m of Object.values(memRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(memPeopleRepoMocks)) (m as any).mockReset();
});

function authedUser() {
  getCurrentAutobiographerUser.mockResolvedValue({
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

const PERSON_UUID = '00000000-0000-0000-0000-000000000001';

// ─── GET /memories/[id]/people ───────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/memories/[id]/people', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when memory is missing or foreign (no existence leak)', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + people list', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue({ id: 'm-1', userId: 'u-1' });
    memPeopleRepoMocks.listPeopleForMemory.mockResolvedValue([
      { person: { id: 'p-1', canonicalName: 'Maria' }, role: 'protagonist' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.people).toHaveLength(1);
  });
});

// ─── POST /memories/[id]/people ──────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/memories/[id]/people', () => {
  it('returns 400 on invalid body (personId missing)', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when repo throws not_found (memory or person foreign)', async () => {
    authedUser();
    const nf: any = new Error('not_found');
    nf.code = 'not_found';
    memPeopleRepoMocks.linkPersonToMemory.mockRejectedValue(nf);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { personId: PERSON_UUID }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when repo throws duplicate (link already exists)', async () => {
    authedUser();
    const dup: any = new Error('duplicate');
    dup.code = 'duplicate';
    memPeopleRepoMocks.linkPersonToMemory.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { personId: PERSON_UUID }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('returns 201 + audits memory_person.linked with projectId from memory.bookId', async () => {
    authedUser();
    memPeopleRepoMocks.linkPersonToMemory.mockResolvedValue({
      memoryId: 'm-1',
      personId: PERSON_UUID,
      role: 'protagonist',
      notes: null,
    });
    memRepoMocks.getMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      userId: 'u-1',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        personId: PERSON_UUID,
        role: 'protagonist',
      }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory_person.linked',
        projectId: 'b-1',
        payload: expect.objectContaining({
          memoryId: 'm-1',
          personId: PERSON_UUID,
          role: 'protagonist',
        }),
      }),
    );
  });

  it('passes projectId = null when memory has no bookId (workshop-global)', async () => {
    authedUser();
    memPeopleRepoMocks.linkPersonToMemory.mockResolvedValue({
      memoryId: 'm-1',
      personId: PERSON_UUID,
      role: null,
      notes: null,
    });
    memRepoMocks.getMemory.mockResolvedValue({
      id: 'm-1',
      bookId: null,
      userId: 'u-1',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/route'
    );
    await POST(
      jsonReq('http://t/x', 'POST', { personId: PERSON_UUID }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null }),
    );
  });
});

// ─── PATCH /memories/[id]/people/[personId] ──────────────────────────────────

describe('PATCH /api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]', () => {
  it('returns 404 when repo throws not_found', async () => {
    authedUser();
    const nf: any = new Error('not_found');
    nf.code = 'not_found';
    memPeopleRepoMocks.updateLink.mockRejectedValue(nf);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { role: 'witness' }) as any,
      { params: Promise.resolve({ id: 'm-1', personId: 'p-other' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 + audits memory_person.updated', async () => {
    authedUser();
    memPeopleRepoMocks.updateLink.mockResolvedValue({
      memoryId: 'm-1',
      personId: 'p-1',
      role: 'witness',
      notes: null,
    });
    memRepoMocks.getMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      userId: 'u-1',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { role: 'witness' }) as any,
      { params: Promise.resolve({ id: 'm-1', personId: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory_person.updated',
        projectId: 'b-1',
        payload: expect.objectContaining({
          memoryId: 'm-1',
          personId: 'p-1',
        }),
      }),
    );
  });

  it('returns 404 when updateLink returns null (link not found)', async () => {
    authedUser();
    memPeopleRepoMocks.updateLink.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { role: 'witness' }) as any,
      { params: Promise.resolve({ id: 'm-1', personId: 'p-1' }) },
    );
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /memories/[id]/people/[personId] ─────────────────────────────────

describe('DELETE /api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]', () => {
  it('returns 404 when repo throws not_found', async () => {
    authedUser();
    const nf: any = new Error('not_found');
    nf.code = 'not_found';
    memPeopleRepoMocks.deleteLink.mockRejectedValue(nf);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-1', personId: 'p-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when nothing was removed (link missing)', async () => {
    authedUser();
    memPeopleRepoMocks.deleteLink.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-1', personId: 'p-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + audits memory_person.unlinked on success', async () => {
    authedUser();
    memPeopleRepoMocks.deleteLink.mockResolvedValue(true);
    memRepoMocks.getMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      userId: 'u-1',
    });
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-1', personId: 'p-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory_person.unlinked',
        projectId: 'b-1',
      }),
    );
  });
});
