/**
 * Autobiographer OS — PDF export redaction integration tests.
 *
 * Mocks `renderPdfToBuffer` so we can introspect the React element tree
 * the route hands to the renderer. Asserts:
 *
 *   - Chapter export pre-redacts the revision body text
 *   - Chapter export pre-redacts memory titles in the footnotes
 *   - Book export pre-redacts every chapter body
 *   - Book export pre-redacts the provenance appendix rows
 *   - applied=true is flipped on pseudonyms that fired
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

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

const revRepoMocks = {
  listRevisionsForChapter: vi.fn(),
  getRevision: vi.fn(),
  getRevisionByVersion: vi.fn(),
  getLatestRevisionForChapter: vi.fn(),
  insertRevision: vi.fn(),
  updateRevision: vi.fn(),
  deleteRevision: vi.fn(),
  countRevisionsForBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapter-revisions-repo', () => revRepoMocks);

const memoriesRepoMocks = {
  listMemories: vi.fn(),
  listMemoriesForBook: vi.fn(),
  getMemory: vi.fn(),
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  getMemoriesByIds: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/memories-repo', () => memoriesRepoMocks);

const chapterSourcesMocks = {
  listSourcesForChapter: vi.fn(),
  getChapterSource: vi.fn(),
  linkChapterSource: vi.fn(),
  updateChapterSource: vi.fn(),
  unlinkChapterSource: vi.fn(),
  listProvenanceForBook: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/chapter-sources-repo',
  () => chapterSourcesMocks,
);

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

const renderPdfToBufferMock = vi.fn();
vi.mock('@/lib/agentic-os/_shared/pdf/render', () => ({
  renderPdfToBuffer: (...args: unknown[]) => renderPdfToBufferMock(...args),
}));

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
  renderPdfToBufferMock.mockReset();
  renderPdfToBufferMock.mockResolvedValue(Buffer.from('%PDF-1.4 stub'));
  for (const m of Object.values(booksRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(chaptersRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(revRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(memoriesRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(chapterSourcesMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(pseudonymsRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authedUser() {
  getCurrentAutobiographerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function reqOf(url: string): Request {
  return new Request(url, { method: 'GET' });
}

// ─── Chapter export ────────────────────────────────────────────────────────

describe('GET /chapters/[id]/export.pdf — pseudonym redaction', () => {
  it('redacts revision body before passing to PDF template', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      title: 'Mom moves to Albuquerque',
      slug: 'mom-moves',
      position: 0,
      status: 'revised',
      summary: 'Mom got tired.',
    });
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'My memoir',
      subtitle: null,
      status: 'drafting',
    });
    revRepoMocks.getLatestRevisionForChapter.mockResolvedValue({
      id: 'r-1',
      version: 1,
      author: 'user',
      bodyText: 'Mom called. Mom waved goodbye.',
      wordCount: 5,
      citations: [{ paragraphIndex: 0, memoryIds: ['m-1'] }],
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([
      { id: 'm-1', title: 'Mom drove to the airport', whenInLife: '1998' },
    ]);
    pseudonymsRepoMocks.listPseudonymsForBook.mockResolvedValue([
      {
        id: 'p-mom',
        bookId: 'b-1',
        userId: 'u-1',
        personId: 'pe-mom',
        pseudonym: 'Mary',
        notes: null,
        applied: false,
        personCanonicalName: 'Mom',
        personAliases: [],
      },
    ]);

    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);

    // Inspect what was passed to the PDF template.
    expect(renderPdfToBufferMock).toHaveBeenCalledTimes(1);
    const element = renderPdfToBufferMock.mock.calls[0]![0];
    const props = element.props;
    expect(props.revision.bodyText).toBe('Mary called. Mary waved goodbye.');
    expect(props.chapter.title).toBe('Mary moves to Albuquerque');
    expect(props.chapter.summary).toBe('Mary got tired.');
    expect(props.memories[0].title).toBe('Mary drove to the airport');

    // Post-render: applied flag flipped on the pseudonym that fired.
    expect(pseudonymsRepoMocks.markPseudonymsApplied).toHaveBeenCalledWith(
      ['p-mom'],
      'u-1',
    );
  });

  it('does not flip applied when no pseudonym matches', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      title: 'A walk in the park',
      slug: 'walk',
      position: 0,
      status: 'revised',
      summary: null,
    });
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'My memoir',
      subtitle: null,
      status: 'drafting',
    });
    revRepoMocks.getLatestRevisionForChapter.mockResolvedValue({
      id: 'r-1',
      version: 1,
      author: 'user',
      bodyText: 'The sky was blue.',
      wordCount: 4,
      citations: [],
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([]);
    pseudonymsRepoMocks.listPseudonymsForBook.mockResolvedValue([
      {
        id: 'p-mom',
        bookId: 'b-1',
        userId: 'u-1',
        personId: 'pe-mom',
        pseudonym: 'Mary',
        notes: null,
        applied: false,
        personCanonicalName: 'Mom',
        personAliases: [],
      },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect(pseudonymsRepoMocks.markPseudonymsApplied).not.toHaveBeenCalled();
  });

  it('empty pseudonym map = identity', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      title: 'Mom moves',
      slug: 'mom-moves',
      position: 0,
      status: 'revised',
      summary: null,
    });
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'Memoir',
      subtitle: null,
      status: 'drafting',
    });
    revRepoMocks.getLatestRevisionForChapter.mockResolvedValue({
      id: 'r-1',
      version: 1,
      author: 'user',
      bodyText: 'Mom called.',
      wordCount: 2,
      citations: [],
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([]);
    pseudonymsRepoMocks.listPseudonymsForBook.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf/route'
    );
    const res = await GET(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    const element = renderPdfToBufferMock.mock.calls[0]![0];
    expect(element.props.revision.bodyText).toBe('Mom called.');
    expect(pseudonymsRepoMocks.markPseudonymsApplied).not.toHaveBeenCalled();
  });
});

// ─── Book export ───────────────────────────────────────────────────────────

describe('GET /books/[id]/export.pdf — pseudonym redaction', () => {
  it('redacts every chapter body, memory title, and provenance row', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'Mom and me',
      subtitle: null,
      description: 'Mom is the protagonist.',
      status: 'drafting',
      targetCompletionDate: null,
      targetAudience: null,
    });
    chaptersRepoMocks.listChaptersForBook.mockResolvedValue([
      {
        id: 'c-1',
        title: 'Mom moves',
        slug: 'mom',
        position: 0,
        status: 'revised',
        summary: null,
      },
      {
        id: 'c-2',
        title: 'Without Mom',
        slug: 'without',
        position: 1,
        status: 'revised',
        summary: null,
      },
    ]);
    revRepoMocks.getLatestRevisionForChapter
      .mockResolvedValueOnce({
        version: 1,
        author: 'user',
        bodyText: 'Mom called.',
        wordCount: 2,
        citations: [{ paragraphIndex: 0, memoryIds: ['m-1'] }],
      })
      .mockResolvedValueOnce({
        version: 1,
        author: 'user',
        bodyText: 'No Mom today.',
        wordCount: 3,
        citations: [],
      });
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([
      { id: 'm-1', title: 'Mom drove away', whenInLife: '1998' },
    ]);
    chapterSourcesMocks.listProvenanceForBook.mockResolvedValue([
      {
        memoryId: 'm-1',
        memoryTitle: 'Mom drove away',
        memoryWhenInLife: '1998',
        chapterReferences: [
          {
            chapterId: 'c-1',
            chapterTitle: 'Mom moves',
            chapterSlug: 'mom',
            position: 0,
          },
        ],
      },
    ]);
    pseudonymsRepoMocks.listPseudonymsForBook.mockResolvedValue([
      {
        id: 'p-mom',
        bookId: 'b-1',
        userId: 'u-1',
        personId: 'pe-mom',
        pseudonym: 'Mary',
        notes: null,
        applied: false,
        personCanonicalName: 'Mom',
        personAliases: [],
      },
    ]);

    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf/route'
    );
    const res = await GET(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    expect(renderPdfToBufferMock).toHaveBeenCalledTimes(1);
    const element = renderPdfToBufferMock.mock.calls[0]![0];
    const props = element.props;
    // book metadata redacted
    expect(props.book.title).toBe('Mary and me');
    expect(props.book.description).toBe('Mary is the protagonist.');
    // chapter titles + body redacted
    expect(props.chapters[0].title).toBe('Mary moves');
    expect(props.chapters[1].title).toBe('Without Mary');
    expect(props.chapters[0].latest.bodyText).toBe('Mary called.');
    expect(props.chapters[1].latest.bodyText).toBe('No Mary today.');
    // memory + provenance redacted
    expect(props.memories[0].title).toBe('Mary drove away');
    expect(props.provenance[0].memoryTitle).toBe('Mary drove away');
    expect(props.provenance[0].chapterReferences[0].chapterTitle).toBe(
      'Mary moves',
    );

    // applied flip
    expect(pseudonymsRepoMocks.markPseudonymsApplied).toHaveBeenCalledWith(
      ['p-mom'],
      'u-1',
    );
  });
});
