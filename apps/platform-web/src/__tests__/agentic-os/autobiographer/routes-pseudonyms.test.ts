/**
 * Autobiographer OS — pseudonyms route handler tests.
 *
 * Covers `/books/[id]/pseudonyms` (GET, POST) and `/pseudonyms/[id]`
 * (PATCH, DELETE).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentAutobiographerUser = vi.fn();
vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: unknown[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const booksRepoMocks = {
  getBook: vi.fn(),
  listBooks: vi.fn(),
  getBookWithCounts: vi.fn(),
  createBook: vi.fn(),
  updateBook: vi.fn(),
  softDeleteBook: vi.fn(),
  deleteBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => booksRepoMocks);

const pseudonymsRepoMocks = {
  listPseudonymsForBook: vi.fn(),
  getPseudonym: vi.fn(),
  bookAndPersonBelongToUser: vi.fn(),
  createPseudonym: vi.fn(),
  updatePseudonym: vi.fn(),
  deletePseudonym: vi.fn(),
  markPseudonymsApplied: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/pseudonyms-repo',
  () => pseudonymsRepoMocks,
);

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
  for (const m of Object.values(pseudonymsRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
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

// ─── GET /books/[id]/pseudonyms ────────────────────────────────────────────

describe('GET /books/[id]/pseudonyms', () => {
  it('401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 when book is foreign', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + pseudonyms list', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', userId: 'u-1' });
    pseudonymsRepoMocks.listPseudonymsForBook.mockResolvedValue([{ id: 'p-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    expect(pseudonymsRepoMocks.listPseudonymsForBook).toHaveBeenCalledWith(
      'b-1',
      'u-1',
    );
  });
});

// ─── POST /books/[id]/pseudonyms ───────────────────────────────────────────

describe('POST /books/[id]/pseudonyms', () => {
  it('400 on missing fields', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', userId: 'u-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 on extra field (Zod strict)', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', userId: 'u-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        personId: '00000000-0000-0000-0000-000000000001',
        pseudonym: 'Mary',
        bogus: 'x',
      }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404 when book is foreign', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        personId: '00000000-0000-0000-0000-000000000001',
        pseudonym: 'Mary',
      }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('404 when person belongs to another user', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', userId: 'u-1' });
    pseudonymsRepoMocks.bookAndPersonBelongToUser.mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        personId: '00000000-0000-0000-0000-000000000001',
        pseudonym: 'Mary',
      }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('409 on duplicate (book_id, person_id)', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', userId: 'u-1' });
    pseudonymsRepoMocks.bookAndPersonBelongToUser.mockResolvedValue(true);
    const dup = new Error('duplicate') as Error & { code?: string; constraint?: string };
    dup.code = 'duplicate';
    pseudonymsRepoMocks.createPseudonym.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        personId: '00000000-0000-0000-0000-000000000001',
        pseudonym: 'Mary',
      }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('201 + audit on happy path', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', userId: 'u-1' });
    pseudonymsRepoMocks.bookAndPersonBelongToUser.mockResolvedValue(true);
    pseudonymsRepoMocks.createPseudonym.mockResolvedValue({
      id: 'p-1',
      bookId: 'b-1',
      personId: '00000000-0000-0000-0000-000000000001',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/pseudonyms/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        personId: '00000000-0000-0000-0000-000000000001',
        pseudonym: 'Mary',
        notes: 'hello',
      }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.pseudonym.created',
      }),
    );
  });
});

// ─── PATCH /pseudonyms/[id] ────────────────────────────────────────────────

describe('PATCH /pseudonyms/[id]', () => {
  it('404 when row not found (cross-tenant)', async () => {
    authedUser();
    pseudonymsRepoMocks.getPseudonym.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/pseudonyms/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { pseudonym: 'Mary' }) as never,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('400 on unknown field (strict)', async () => {
    authedUser();
    pseudonymsRepoMocks.getPseudonym.mockResolvedValue({
      id: 'p-1',
      bookId: 'b-1',
      personId: 'pe-1',
      applied: false,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/pseudonyms/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { bogus: 'x' }) as never,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('200 + applied-flip audit when only applied=true was set on a previously-false row', async () => {
    authedUser();
    pseudonymsRepoMocks.getPseudonym.mockResolvedValue({
      id: 'p-1',
      bookId: 'b-1',
      personId: 'pe-1',
      applied: false,
    });
    pseudonymsRepoMocks.updatePseudonym.mockResolvedValue({
      id: 'p-1',
      bookId: 'b-1',
      personId: 'pe-1',
      applied: true,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/pseudonyms/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { applied: true }) as never,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.pseudonym.applied',
      }),
    );
  });

  it('200 + generic .updated when multiple fields change', async () => {
    authedUser();
    pseudonymsRepoMocks.getPseudonym.mockResolvedValue({
      id: 'p-1',
      bookId: 'b-1',
      personId: 'pe-1',
      applied: false,
    });
    pseudonymsRepoMocks.updatePseudonym.mockResolvedValue({
      id: 'p-1',
      bookId: 'b-1',
      personId: 'pe-1',
      pseudonym: 'Maria',
      notes: 'why',
      applied: false,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/pseudonyms/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        pseudonym: 'Maria',
        notes: 'why',
      }) as never,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.pseudonym.updated',
      }),
    );
  });
});

// ─── DELETE /pseudonyms/[id] ───────────────────────────────────────────────

describe('DELETE /pseudonyms/[id]', () => {
  it('404 on cross-tenant id', async () => {
    authedUser();
    pseudonymsRepoMocks.getPseudonym.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/pseudonyms/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + audit on happy path', async () => {
    authedUser();
    pseudonymsRepoMocks.getPseudonym.mockResolvedValue({
      id: 'p-1',
      bookId: 'b-1',
      personId: 'pe-1',
      applied: true,
    });
    pseudonymsRepoMocks.deletePseudonym.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/pseudonyms/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.pseudonym.deleted',
      }),
    );
  });
});
