/**
 * Creator OS — export route preflight-gating tests.
 *
 * We don't actually invoke pandoc here — instead we mock the repos so
 * the route returns either 422 (blockers) or proceeds. Since the
 * happy path shells out to pandoc, this suite focuses on the *control
 * flow* before that subprocess call: auth, body validation, target
 * lookup, and preflight gate.
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

const booksRepo = {
  getBook: vi.fn(),
  listChapters: vi.fn(),
};
vi.mock('@/lib/agentic-os/creator/books-repo', () => booksRepo);

const targetsRepo = {
  getTarget: vi.fn(),
};
vi.mock('@/lib/agentic-os/creator/publishing-targets-repo', () => targetsRepo);

vi.mock('@/lib/agentic-os/creator/tiptap-to-md', () => ({
  tiptapJsonToMarkdown: () => 'mock markdown body\n',
}));

vi.mock('@/lib/agentic-os/_shared/blob-store', () => ({
  respondWithPdf: vi.fn(async () => new Response('mocked', { status: 200 })),
  isBlobStoreOffloadEnabled: false,
  getBlobStore: () => null,
}));

beforeEach(() => {
  getCurrentCreatorUser.mockReset();
  booksRepo.getBook.mockReset();
  booksRepo.listChapters.mockReset();
  targetsRepo.getTarget.mockReset();
});

function authedUser() {
  getCurrentCreatorUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function jsonReq(body: unknown): Request {
  return new Request('http://test/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ bookId: 'b-1' });

function bookFixture() {
  return {
    id: 'b-1',
    userId: 'u-1',
    title: 'A Book',
    description: null,
    coverImageUrl: null,
    status: 'writing',
    subtitle: null,
    authorDisplayName: 'A. Author',
    copyrightYear: 2026,
    language: 'en-US',
    dedication: null,
    aboutAuthor: null,
    seriesName: null,
    seriesPosition: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

function chapterFixture() {
  return {
    id: 'c-1',
    bookId: 'b-1',
    title: 'Chapter 1',
    content: {},
    order: 0,
    wordCount: 1000,
    status: 'draft',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

function targetFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    bookId: 'b-1',
    platform: 'kdp_paperback',
    format: 'paperback',
    trimSize: '6x9',
    isbn: null,
    bisacCodes: [],
    priceUsd: null,
    status: 'draft',
    notes: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /books/[bookId]/export', () => {
  it('401 when unauthenticated', async () => {
    getCurrentCreatorUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/export/route'
    );
    const res = await POST(jsonReq({ format: 'pdf' }) as never, {
      params,
    } as never);
    expect(res.status).toBe(401);
  });

  it('404 when the book does not exist', async () => {
    authedUser();
    booksRepo.getBook.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/export/route'
    );
    const res = await POST(jsonReq({ format: 'pdf' }) as never, {
      params,
    } as never);
    expect(res.status).toBe(404);
  });

  it('400 on invalid body shape', async () => {
    authedUser();
    booksRepo.getBook.mockResolvedValue(bookFixture());
    booksRepo.listChapters.mockResolvedValue([chapterFixture()]);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/export/route'
    );
    const res = await POST(jsonReq({ nonsense: true }) as never, {
      params,
    } as never);
    expect(res.status).toBe(400);
  });

  it('404 when target does not exist (targeted mode)', async () => {
    authedUser();
    booksRepo.getBook.mockResolvedValue(bookFixture());
    booksRepo.listChapters.mockResolvedValue([chapterFixture()]);
    targetsRepo.getTarget.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/export/route'
    );
    const res = await POST(
      jsonReq({
        targetId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        mode: 'draft',
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(404);
  });

  it('422 with blockers when publish_ready is missing ISBN', async () => {
    authedUser();
    booksRepo.getBook.mockResolvedValue(bookFixture());
    booksRepo.listChapters.mockResolvedValue([chapterFixture()]);
    targetsRepo.getTarget.mockResolvedValue(targetFixture({ isbn: null }));
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/export/route'
    );
    const res = await POST(
      jsonReq({
        targetId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        mode: 'publish_ready',
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.blockers.find((b: { code: string }) => b.code === 'ISBN_MISSING')).toBeDefined();
  });

  it('422 with blockers when draft mode has zero chapters', async () => {
    authedUser();
    booksRepo.getBook.mockResolvedValue(bookFixture());
    booksRepo.listChapters.mockResolvedValue([]); // no chapters
    targetsRepo.getTarget.mockResolvedValue(targetFixture());
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/creator/books/[bookId]/export/route'
    );
    const res = await POST(
      jsonReq({
        targetId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        mode: 'draft',
      }) as never,
      { params } as never,
    );
    expect(res.status).toBe(422);
  });
});
