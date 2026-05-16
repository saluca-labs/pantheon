/**
 * Autobiographer OS — review-checks route handler tests.
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

const chaptersRepoMocks = {
  getChapter: vi.fn(),
  listChaptersForBook: vi.fn(),
  listChaptersForUser: vi.fn(),
  userOwnsBook: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  reorderChapter: vi.fn(),
  deleteChapter: vi.fn(),
  getBookWordCount: vi.fn(),
  nextSlugForBook: vi.fn(),
  chapterHasSensitiveContent: vi.fn(),
  setChapterStatus: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapters-repo', () => chaptersRepoMocks);

const reviewRepoMocks = {
  listReviewChecksForBookGrouped: vi.fn(),
  listReviewChecksForChapter: vi.fn(),
  listReviewChecksForBook: vi.fn(),
  getReviewCheck: vi.fn(),
  createReviewCheck: vi.fn(),
  updateReviewCheck: vi.fn(),
  deleteReviewCheck: vi.fn(),
  bookBelongsToUser: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/review-checks-repo',
  () => reviewRepoMocks,
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
  for (const m of Object.values(chaptersRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(reviewRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
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

// ─── GET /books/[id]/review-checks ─────────────────────────────────────────

describe('GET /books/[id]/review-checks', () => {
  it('401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/review-checks/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant book', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/review-checks/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + grouped body', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    reviewRepoMocks.listReviewChecksForBookGrouped.mockResolvedValue({
      book: [],
      byChapterId: {},
    });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/review-checks/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── POST /books/[id]/review-checks ────────────────────────────────────────

describe('POST /books/[id]/review-checks', () => {
  it('400 invalid body', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/review-checks/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 chapter from another book → reject', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-other',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/review-checks/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        chapterId: '00000000-0000-0000-0000-000000000001',
        kind: 'consent_collected',
      }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('409 on duplicate (chapter_id, kind)', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      bookId: 'b-1',
    });
    const dup = new Error('duplicate') as Error & { code?: string; constraint?: string };
    dup.code = 'duplicate';
    reviewRepoMocks.createReviewCheck.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/review-checks/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        chapterId: '00000000-0000-0000-0000-000000000001',
        kind: 'consent_collected',
      }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('201 + audit on happy path (book-level)', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    reviewRepoMocks.createReviewCheck.mockResolvedValue({
      id: 'rc-1',
      bookId: 'b-1',
      chapterId: null,
      kind: 'legal_reviewed',
      status: 'pending',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/review-checks/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { kind: 'legal_reviewed' }) as never,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.review_check.created',
      }),
    );
  });
});

// ─── PATCH /review-checks/[id] ─────────────────────────────────────────────

describe('PATCH /review-checks/[id]', () => {
  it('404 cross-tenant', async () => {
    authedUser();
    reviewRepoMocks.getReviewCheck.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/review-checks/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'passed' }) as never,
      { params: Promise.resolve({ id: 'rc-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('400 on bogus status', async () => {
    authedUser();
    reviewRepoMocks.getReviewCheck.mockResolvedValue({
      id: 'rc-1',
      bookId: 'b-1',
      chapterId: 'c-1',
      kind: 'consent_collected',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/review-checks/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'BOGUS' }) as never,
      { params: Promise.resolve({ id: 'rc-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('200 + audit on happy path', async () => {
    authedUser();
    reviewRepoMocks.getReviewCheck.mockResolvedValue({
      id: 'rc-1',
      bookId: 'b-1',
      chapterId: 'c-1',
      kind: 'consent_collected',
    });
    reviewRepoMocks.updateReviewCheck.mockResolvedValue({
      id: 'rc-1',
      bookId: 'b-1',
      chapterId: 'c-1',
      kind: 'consent_collected',
      status: 'passed',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/review-checks/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { status: 'passed' }) as never,
      { params: Promise.resolve({ id: 'rc-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.review_check.updated',
      }),
    );
  });
});

// ─── DELETE /review-checks/[id] ────────────────────────────────────────────

describe('DELETE /review-checks/[id]', () => {
  it('200 + audit', async () => {
    authedUser();
    reviewRepoMocks.getReviewCheck.mockResolvedValue({
      id: 'rc-1',
      bookId: 'b-1',
      chapterId: null,
      kind: 'legal_reviewed',
    });
    reviewRepoMocks.deleteReviewCheck.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/review-checks/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'rc-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.review_check.deleted',
      }),
    );
  });
});
