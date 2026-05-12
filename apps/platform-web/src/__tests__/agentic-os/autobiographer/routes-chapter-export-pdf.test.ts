/**
 * Autobiographer OS — chapter / book PDF export route handler tests.
 *
 * Smoke-tests the happy path (Content-Type + filename + non-empty
 * body), the "no revisions yet" 400, the cross-tenant 404, and the
 * audit row shape.
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
};
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => booksRepoMocks);

const chaptersRepoMocks = {
  getChapter: vi.fn(),
  listChaptersForBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapters-repo', () => chaptersRepoMocks);

const revRepoMocks = {
  getLatestRevisionForChapter: vi.fn(),
  getRevisionByVersion: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapter-revisions-repo', () => revRepoMocks);

const memoriesRepoMocks = {
  getMemoriesByIds: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/memories-repo', () => memoriesRepoMocks);

const sourcesRepoMocks = {
  listProvenanceForBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapter-sources-repo', () => sourcesRepoMocks);

// Phase 6 — PDF export routes now load pseudonyms before render.
// Default both mocks to an empty list so legacy assertions keep passing.
const pseudonymsRepoMocks = {
  listPseudonymsForBook: vi.fn(),
  markPseudonymsApplied: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/pseudonyms-repo',
  () => pseudonymsRepoMocks,
);

const renderPdfToBuffer = vi.fn();
vi.mock('@/lib/agentic-os/_shared/pdf/render', () => ({
  renderPdfToBuffer: (...args: any[]) => renderPdfToBuffer(...args),
}));

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
  renderPdfToBuffer.mockReset();
  for (const m of Object.values(booksRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(chaptersRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(revRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(memoriesRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(sourcesRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(pseudonymsRepoMocks)) (m as any).mockReset();
  // Default to empty pseudonym map so Phase 4/5 tests still produce
  // identity output through the Phase 6 redaction layer.
  pseudonymsRepoMocks.listPseudonymsForBook.mockResolvedValue([]);
  pseudonymsRepoMocks.markPseudonymsApplied.mockResolvedValue(0);
});

function authedUser() {
  getCurrentAutobiographerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function req(url: string): Request {
  return new Request(url);
}

// ─── chapter PDF export ──────────────────────────────────────────────────

describe('GET /chapters/[id]/export.pdf', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when chapter is foreign', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'c-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when the chapter has no revisions', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      title: 'X',
      slug: 'x',
      position: 0,
      status: 'outline',
      summary: null,
    });
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'My Book',
      subtitle: null,
    });
    revRepoMocks.getLatestRevisionForChapter.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 + PDF body + filename + audit on happy path', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      title: 'Hello World',
      slug: 'hello-world',
      position: 0,
      status: 'drafting',
      summary: null,
    });
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'My Book',
      subtitle: null,
    });
    revRepoMocks.getLatestRevisionForChapter.mockResolvedValue({
      id: 'r-1',
      version: 1,
      author: 'user',
      bodyText: 'Paragraph one.\n\nParagraph two.',
      wordCount: 4,
      citations: [],
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([]);
    const fakePdf = Buffer.from('%PDF-1.4\n...stub-bytes...');
    renderPdfToBuffer.mockResolvedValue(fakePdf);

    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toMatch(/my-book-ch01-hello-world-\d{4}-\d{2}-\d{2}\.pdf/);
    const arr = new Uint8Array(await res.arrayBuffer());
    expect(arr.length).toBeGreaterThan(0);
    expect(String.fromCharCode(...arr.slice(0, 4))).toBe('%PDF');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter.exported_pdf',
        projectId: 'b-1',
      }),
    );
  });

  it('honors ?revision=N when present', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      title: 'X',
      slug: 'x',
      position: 0,
      status: 'drafting',
      summary: null,
    });
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', title: 'B', subtitle: null });
    revRepoMocks.getRevisionByVersion.mockResolvedValue({
      id: 'r-2',
      version: 2,
      author: 'coach',
      bodyText: 'x',
      wordCount: 1,
      citations: [],
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([]);
    renderPdfToBuffer.mockResolvedValue(Buffer.from('%PDF-stub'));

    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x?revision=2') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect(revRepoMocks.getRevisionByVersion).toHaveBeenCalledWith('c-1', 2, 'u-1');
  });

  it('returns 404 when ?revision=N is missing', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      title: 'X',
      slug: 'x',
      position: 0,
      status: 'drafting',
      summary: null,
    });
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', title: 'B', subtitle: null });
    revRepoMocks.getRevisionByVersion.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x?revision=99') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── book PDF export ─────────────────────────────────────────────────────

describe('GET /books/[id]/export.pdf', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 on foreign book', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'b-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns the title-page-only PDF when book has zero chapters', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'Empty book',
      subtitle: null,
      description: null,
      status: 'drafting',
      targetCompletionDate: null,
      targetAudience: null,
    });
    chaptersRepoMocks.listChaptersForBook.mockResolvedValue([]);
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([]);
    sourcesRepoMocks.listProvenanceForBook.mockResolvedValue([]);
    renderPdfToBuffer.mockResolvedValue(Buffer.from('%PDF-empty'));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.book.exported_pdf',
        projectId: 'b-1',
        payload: expect.objectContaining({ chapters: 0 }),
      }),
    );
  });

  it('happy path with chapters audits cited memory count', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'A Memoir',
      subtitle: null,
      description: null,
      status: 'drafting',
      targetCompletionDate: null,
      targetAudience: null,
    });
    chaptersRepoMocks.listChaptersForBook.mockResolvedValue([
      {
        id: 'c-1',
        title: 'One',
        slug: 'one',
        position: 0,
        status: 'drafting',
        summary: null,
      },
    ]);
    revRepoMocks.getLatestRevisionForChapter.mockResolvedValue({
      id: 'r-1',
      version: 1,
      author: 'user',
      bodyText: 'one two',
      wordCount: 2,
      citations: [{ paragraphIndex: 0, memoryIds: ['m-1'] }],
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([
      { id: 'm-1', title: 'A memory', whenInLife: '1985' },
    ]);
    sourcesRepoMocks.listProvenanceForBook.mockResolvedValue([
      {
        memoryId: 'm-1',
        memoryTitle: 'A memory',
        memoryWhenInLife: '1985',
        chapterReferences: [
          {
            chapterId: 'c-1',
            chapterTitle: 'One',
            chapterSlug: 'one',
            position: 0,
          },
        ],
      },
    ]);
    renderPdfToBuffer.mockResolvedValue(Buffer.from('%PDF-stub'));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf/route'
    );
    const res = await GET(req('http://t/x') as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition') ?? '').toMatch(/a-memoir-\d{4}-\d{2}-\d{2}\.pdf/);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.book.exported_pdf',
        payload: expect.objectContaining({
          chapters: 1,
          citedMemories: 1,
        }),
      }),
    );
  });
});
