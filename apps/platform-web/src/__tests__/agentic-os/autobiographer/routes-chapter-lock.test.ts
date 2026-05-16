/**
 * Autobiographer OS — chapter lock route handler tests.
 *
 * Covers the lock + unlock branches, the required-check computation,
 * the sensitive-content conditional, and the 400 shortfall body shape.
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
  listReviewChecksForChapter: vi.fn(),
  listReviewChecksForBook: vi.fn(),
  listReviewChecksForBookGrouped: vi.fn(),
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

function reqOf(url: string, method = 'POST'): Request {
  return new Request(url, { method });
}

describe('POST /chapters/[id]/lock — auth & cross-tenant', () => {
  it('401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 when chapter is foreign', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /chapters/[id]/lock — required-check computation', () => {
  it('400 base path — consent + attribution required, both missing', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'revised',
    });
    chaptersRepoMocks.chapterHasSensitiveContent.mockResolvedValue(false);
    reviewRepoMocks.listReviewChecksForChapter.mockResolvedValue([]);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('lock_blocked');
    expect(body.required).toEqual([
      'consent_collected',
      'attribution_verified',
    ]);
    expect(body.missing).toEqual([
      { kind: 'consent_collected', status: 'missing' },
      { kind: 'attribution_verified', status: 'missing' },
    ]);
    expect(body.hasSensitiveContent).toBe(false);
  });

  it('200 base path — both checks passed', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'revised',
    });
    chaptersRepoMocks.chapterHasSensitiveContent.mockResolvedValue(false);
    reviewRepoMocks.listReviewChecksForChapter.mockResolvedValue([
      { kind: 'consent_collected', status: 'passed' },
      { kind: 'attribution_verified', status: 'waived' },
    ]);
    chaptersRepoMocks.setChapterStatus.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'locked',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect(chaptersRepoMocks.setChapterStatus).toHaveBeenCalledWith(
      'c-1',
      'u-1',
      'locked',
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter.locked',
      }),
    );
  });

  it('400 sensitive path — sensitive_flagged is required and missing', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'revised',
    });
    chaptersRepoMocks.chapterHasSensitiveContent.mockResolvedValue(true);
    reviewRepoMocks.listReviewChecksForChapter.mockResolvedValue([
      { kind: 'consent_collected', status: 'passed' },
      { kind: 'attribution_verified', status: 'passed' },
    ]);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.required).toContain('sensitive_flagged');
    expect(body.missing).toEqual([
      { kind: 'sensitive_flagged', status: 'missing' },
    ]);
    expect(body.hasSensitiveContent).toBe(true);
  });

  it('400 — failed status counts as blocking', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'revised',
    });
    chaptersRepoMocks.chapterHasSensitiveContent.mockResolvedValue(false);
    reviewRepoMocks.listReviewChecksForChapter.mockResolvedValue([
      { kind: 'consent_collected', status: 'passed' },
      { kind: 'attribution_verified', status: 'failed' },
    ]);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.missing).toEqual([
      { kind: 'attribution_verified', status: 'failed' },
    ]);
  });

  it('200 sensitive path — sensitive_flagged passed → lock succeeds', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'revised',
    });
    chaptersRepoMocks.chapterHasSensitiveContent.mockResolvedValue(true);
    reviewRepoMocks.listReviewChecksForChapter.mockResolvedValue([
      { kind: 'consent_collected', status: 'passed' },
      { kind: 'attribution_verified', status: 'passed' },
      { kind: 'sensitive_flagged', status: 'passed' },
    ]);
    chaptersRepoMocks.setChapterStatus.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'locked',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /chapters/[id]/lock?unlock=true', () => {
  it('unlock path — flips chapter back to revised + audits', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'locked',
    });
    chaptersRepoMocks.setChapterStatus.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'revised',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    const res = await POST(reqOf('http://t/x?unlock=true') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect(chaptersRepoMocks.setChapterStatus).toHaveBeenCalledWith(
      'c-1',
      'u-1',
      'revised',
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter.unlocked',
      }),
    );
  });

  it('unlock path does NOT compute required checks', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'locked',
    });
    chaptersRepoMocks.setChapterStatus.mockResolvedValue({
      id: 'c-1',
      bookId: 'b-1',
      status: 'revised',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock/route'
    );
    await POST(reqOf('http://t/x?unlock=true') as never, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(chaptersRepoMocks.chapterHasSensitiveContent).not.toHaveBeenCalled();
    expect(reviewRepoMocks.listReviewChecksForChapter).not.toHaveBeenCalled();
  });
});
