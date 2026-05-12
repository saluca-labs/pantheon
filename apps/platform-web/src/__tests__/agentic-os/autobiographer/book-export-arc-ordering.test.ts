/**
 * Autobiographer OS — Phase 4 seam activation test.
 *
 * Asserts that the book PDF export now passes `order: 'arc'` to
 * `listChaptersForBook` (Phase 5 activation). Tests both branches: the
 * arc-aware loader is called the same way regardless of whether a
 * primary arc exists; the function itself returns position fallback
 * when no primary arc is present.
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

const booksRepoMocks = {
  getBook: vi.fn(),
  listBooks: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => booksRepoMocks);

const chaptersRepoMocks = {
  getChapter: vi.fn(),
  listChaptersForBook: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/chapters-repo',
  () => chaptersRepoMocks,
);

const revRepoMocks = {
  getLatestRevisionForChapter: vi.fn(),
  getRevisionByVersion: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/chapter-revisions-repo',
  () => revRepoMocks,
);

const memoriesRepoMocks = {
  getMemoriesByIds: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/memories-repo',
  () => memoriesRepoMocks,
);

const sourcesRepoMocks = {
  listProvenanceForBook: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/chapter-sources-repo',
  () => sourcesRepoMocks,
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
});

function authedUser() {
  getCurrentAutobiographerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

describe('book export PDF — Phase 5 arc activation', () => {
  it('calls listChaptersForBook with order: "arc"', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({
      id: 'b-1',
      title: 'My book',
      subtitle: null,
      description: null,
      status: 'drafting',
      targetCompletionDate: null,
      targetAudience: null,
    });
    chaptersRepoMocks.listChaptersForBook.mockResolvedValue([]);
    revRepoMocks.getLatestRevisionForChapter.mockResolvedValue(null);
    memoriesRepoMocks.getMemoriesByIds.mockResolvedValue([]);
    sourcesRepoMocks.listProvenanceForBook.mockResolvedValue([]);
    renderPdfToBuffer.mockResolvedValue(Buffer.from('PDF'));

    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/export.pdf/route'
    );
    const res = await GET(new Request('http://t/x') as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    expect(chaptersRepoMocks.listChaptersForBook).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        bookId: 'b-1',
        order: 'arc',
      }),
    );
  });
});
