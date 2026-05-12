/**
 * Autobiographer OS — chapter route handler tests.
 *
 * Covers the 401/200/201/400/404/409 matrix across the new
 * book-scoped chapter routes: list/create on books/[id]/chapters and
 * get/patch/delete on chapters/[id], plus cross-ownership 404 and
 * the slug-uniqueness 409.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentAutobiographerUser = vi.fn();

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: any[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const booksRepoMocks = {
  getBook: vi.fn(),
  listBooks: vi.fn(),
  createBook: vi.fn(),
  updateBook: vi.fn(),
  softDeleteBook: vi.fn(),
  deleteBook: vi.fn(),
  getBookWithCounts: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => booksRepoMocks);

const chaptersRepoMocks = {
  listChaptersForBook: vi.fn(),
  listChaptersForUser: vi.fn(),
  getChapter: vi.fn(),
  userOwnsBook: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  reorderChapter: vi.fn(),
  deleteChapter: vi.fn(),
  getBookWordCount: vi.fn(),
  nextSlugForBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapters-repo', () => chaptersRepoMocks);

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
  for (const m of Object.values(booksRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(chaptersRepoMocks)) (m as any).mockReset();
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

// ─── GET /books/[id]/chapters ─────────────────────────────────────────────

describe('GET /books/[id]/chapters', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when book is foreign / missing', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'b-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + chapters when book owned', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', userId: 'u-1' });
    chaptersRepoMocks.listChaptersForBook.mockResolvedValue([
      { id: 'c-1', position: 0 },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toHaveLength(1);
  });
});

// ─── POST /books/[id]/chapters ────────────────────────────────────────────

describe('POST /books/[id]/chapters', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 on foreign book (no existence leak)', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', { title: 'X' }) as any, {
      params: Promise.resolve({ id: 'b-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { status: 'not-a-status' }) as any,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('creates and returns 201 + audit row', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    chaptersRepoMocks.createChapter.mockResolvedValue({
      id: 'c-new',
      bookId: 'b-1',
      position: 3,
      slug: 'new-one',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'New one' }) as any,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter.created',
        projectId: 'b-1',
      }),
    );
  });

  it('translates 23505 unique violation to 409', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    chaptersRepoMocks.createChapter.mockRejectedValue(
      Object.assign(new Error('uniq'), { code: '23505' }),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/chapters/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'Dup', slug: 'dup' }) as any,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(409);
  });
});

// ─── GET /chapters/[id] ───────────────────────────────────────────────────

describe('GET /chapters/[id]', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 on missing or foreign chapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with chapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', position: 0 });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapter.id).toBe('c-1');
  });
});

// ─── PATCH /chapters/[id] ─────────────────────────────────────────────────

describe('PATCH /chapters/[id]', () => {
  it('returns 404 when chapter missing', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'X' }) as any,
      { params: Promise.resolve({ id: 'c-x' }) },
    );
    expect(res.status).toBe(404);
  });

  it('rejects unknown field via Zod strict (Phase 6 seam)', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      position: 0,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { sensitive_kinds: ['x'] }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('routes position changes through reorderChapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter
      .mockResolvedValueOnce({ id: 'c-1', bookId: 'b-1', position: 0 }) // existing probe
      .mockResolvedValue({ id: 'c-1', bookId: 'b-1', position: 2 });
    chaptersRepoMocks.reorderChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      position: 2,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { position: 2 }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(200);
    expect(chaptersRepoMocks.reorderChapter).toHaveBeenCalledWith(
      'c-1',
      'u-1',
      2,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter.reordered',
      }),
    );
  });

  it('combines reorder + field update into one .updated audit when both supplied', async () => {
    authedUser();
    chaptersRepoMocks.getChapter
      .mockResolvedValueOnce({ id: 'c-1', bookId: 'b-1', position: 0 })
      .mockResolvedValue({ id: 'c-1', bookId: 'b-1', position: 2, title: 'New' });
    chaptersRepoMocks.reorderChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      position: 2,
    });
    chaptersRepoMocks.updateChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      position: 2,
      title: 'New',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', { position: 2, title: 'New' }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter.updated',
      }),
    );
  });

  it('translates 23505 to 409 on slug collision', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      position: 0,
    });
    chaptersRepoMocks.updateChapter.mockRejectedValue(
      Object.assign(new Error('uniq'), { code: '23505' }),
    );
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { slug: 'dup' }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(409);
  });
});

// ─── DELETE /chapters/[id] ────────────────────────────────────────────────

describe('DELETE /chapters/[id]', () => {
  it('returns 404 when missing', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'c-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('audits on successful delete', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
    });
    chaptersRepoMocks.deleteChapter.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter.deleted',
      }),
    );
  });
});
