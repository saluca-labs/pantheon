/**
 * Autobiographer OS — arcs route handler tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentAutobiographerUser = vi.fn();
vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: any[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const bookRepoMocks = {
  getBook: vi.fn(),
  listBooks: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => bookRepoMocks);

const arcsRepoMocks = {
  listArcsForBook: vi.fn(),
  createArc: vi.fn(),
  getArc: vi.fn(),
  updateArc: vi.fn(),
  deleteArc: vi.fn(),
  setArcPrimary: vi.fn(),
  getPrimaryArcForBook: vi.fn(),
  userOwnsBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/arcs-repo', () => arcsRepoMocks);

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
  for (const m of Object.values(bookRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(arcsRepoMocks)) (m as any).mockReset();
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

describe('GET /books/[bookId]/arcs', () => {
  it('401 when unauthed', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ bookId: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 when book is foreign', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ bookId: 'b-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + arcs', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    arcsRepoMocks.listArcsForBook.mockResolvedValue([{ id: 'a-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ bookId: 'b-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.arcs).toHaveLength(1);
  });
});

describe('POST /books/[bookId]/arcs', () => {
  it('400 on invalid body', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any, {
      params: Promise.resolve({ bookId: 'b-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 on unknown field (strict)', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        title: 't',
        bogus: 1,
      }) as any,
      { params: Promise.resolve({ bookId: 'b-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('201 + audits arc.created with projectId = bookId', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    arcsRepoMocks.createArc.mockResolvedValue({
      id: 'a-1',
      kind: 'chronological',
      isPrimary: false,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'Chronological' }) as any,
      { params: Promise.resolve({ bookId: 'b-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.arc.created',
        projectId: 'b-1',
      }),
    );
  });
});

describe('GET / PATCH / DELETE /arcs/[id]', () => {
  it('GET 404 when arc foreign', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'a-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH 200 + audits arc.updated', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValueOnce({
      id: 'a-1',
      bookId: 'b-1',
      isPrimary: false,
    });
    arcsRepoMocks.updateArc.mockResolvedValue({
      id: 'a-1',
      bookId: 'b-1',
      isPrimary: false,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'New' }) as any,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'autobiographer.arc.updated' }),
    );
  });

  it('PATCH emits arc.made_primary when isPrimary transitions false→true', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValueOnce({
      id: 'a-1',
      bookId: 'b-1',
      isPrimary: false,
    });
    arcsRepoMocks.updateArc.mockResolvedValue({
      id: 'a-1',
      bookId: 'b-1',
      isPrimary: true,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', { isPrimary: true }) as any,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    const actions = (recordAudit.mock.calls as any[][]).map(
      (c) => c[0].action,
    );
    expect(actions).toContain('autobiographer.arc.made_primary');
  });

  it('PATCH does NOT emit arc.made_primary when already primary', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValueOnce({
      id: 'a-1',
      bookId: 'b-1',
      isPrimary: true,
    });
    arcsRepoMocks.updateArc.mockResolvedValue({
      id: 'a-1',
      bookId: 'b-1',
      isPrimary: true,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', { isPrimary: true }) as any,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    const actions = (recordAudit.mock.calls as any[][]).map(
      (c) => c[0].action,
    );
    expect(actions).not.toContain('autobiographer.arc.made_primary');
  });

  it('DELETE 200 + audits arc.deleted', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValueOnce({ id: 'a-1', bookId: 'b-1' });
    arcsRepoMocks.deleteArc.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'a-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'autobiographer.arc.deleted' }),
    );
  });

  it('DELETE 404 when arc foreign', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValueOnce(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'a-x' }),
    });
    expect(res.status).toBe(404);
  });
});
