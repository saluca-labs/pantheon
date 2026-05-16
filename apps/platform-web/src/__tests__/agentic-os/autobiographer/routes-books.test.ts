/**
 * Autobiographer OS — books route handler tests.
 *
 * Covers 401, 200/201 happy paths, 404 on cross-ownership, 400 on bad
 * body, soft vs hard delete, and audit invocation. Repos + session are
 * mocked at module level.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const getCurrentAutobiographerUser = vi.fn();

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: unknown[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const booksRepoMocks = {
  listBooks: vi.fn(),
  getBook: vi.fn(),
  getBookWithCounts: vi.fn(),
  createBook: vi.fn(),
  updateBook: vi.fn(),
  softDeleteBook: vi.fn(),
  deleteBook: vi.fn(),
};

vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => booksRepoMocks);

const recordAudit = vi.fn();
vi.mock('@/lib/agentic-os/autobiographer/repo', () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
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
  for (const m of Object.values(booksRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
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

// ─── GET /books ──────────────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/books', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 + { books } when authenticated', async () => {
    authedUser();
    booksRepoMocks.listBooks.mockResolvedValue([{ id: 'b-1', title: 'X' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.books).toHaveLength(1);
  });

  it('passes status filter from ?status=', async () => {
    authedUser();
    booksRepoMocks.listBooks.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/route'
    );
    await GET(jsonReq('http://t/x?status=drafting', 'GET') as never);
    expect(booksRepoMocks.listBooks).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'drafting' }),
    );
  });

  it('returns 400 on invalid ?status=', async () => {
    authedUser();
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/route'
    );
    const res = await GET(jsonReq('http://t/x?status=invalid', 'GET') as never);
    expect(res.status).toBe(400);
  });
});

// ─── POST /books ─────────────────────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/books', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'T' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 201 on success and records an audit', async () => {
    authedUser();
    booksRepoMocks.createBook.mockResolvedValue({
      id: 'b-1',
      title: 'My Story',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'My Story' }) as never,
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        action: 'autobiographer.book.created',
        projectId: 'b-1',
      }),
    );
  });
});

// ─── GET /books/[id] ─────────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/books/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the book does not belong to caller', async () => {
    authedUser();
    booksRepoMocks.getBookWithCounts.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with the joined memory count', async () => {
    authedUser();
    booksRepoMocks.getBookWithCounts.mockResolvedValue({
      id: 'b-1',
      memoryCount: 3,
    });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.book.memoryCount).toBe(3);
  });
});

// ─── PATCH /books/[id] ───────────────────────────────────────────────────────

describe('PATCH /api/tiresias/agentic-os/autobiographer/books/[id]', () => {
  it('returns 400 on invalid status', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'nope' }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing matches', async () => {
    authedUser();
    booksRepoMocks.updateBook.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'X' }) as never,
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and audits autobiographer.book.updated', async () => {
    authedUser();
    booksRepoMocks.updateBook.mockResolvedValue({
      id: 'b-1',
      title: 'Renamed',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'Renamed' }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.book.updated',
        projectId: 'b-1',
      }),
    );
  });
});

// ─── DELETE /books/[id] ──────────────────────────────────────────────────────

describe('DELETE /api/tiresias/agentic-os/autobiographer/books/[id]', () => {
  it('soft-deletes by default and audits .archived', async () => {
    authedUser();
    booksRepoMocks.softDeleteBook.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('soft');
    expect(booksRepoMocks.softDeleteBook).toHaveBeenCalled();
    expect(booksRepoMocks.deleteBook).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'autobiographer.book.archived' }),
    );
  });

  it('hard-deletes on ?hard=true and audits .deleted', async () => {
    authedUser();
    booksRepoMocks.deleteBook.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x?hard=true', 'DELETE') as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('hard');
    expect(booksRepoMocks.deleteBook).toHaveBeenCalled();
    expect(booksRepoMocks.softDeleteBook).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'autobiographer.book.deleted' }),
    );
  });

  it('returns 404 when nothing was removed', async () => {
    authedUser();
    booksRepoMocks.softDeleteBook.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });
});
