/**
 * Autobiographer OS — chapter↔themes route handler tests.
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

const chRepoMocks = {
  getChapter: vi.fn(),
  listChaptersForBook: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  deleteChapter: vi.fn(),
  reorderChapter: vi.fn(),
};
const chThemesMocks = {
  listThemesForChapter: vi.fn(),
  linkThemeToChapter: vi.fn(),
  unlinkThemeFromChapter: vi.fn(),
  listChaptersForTheme: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapters-repo', () => chRepoMocks);
vi.mock(
  '@/lib/agentic-os/autobiographer/chapter-themes-repo',
  () => chThemesMocks,
);

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
  for (const m of Object.values(chRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(chThemesMocks)) (m as any).mockReset();
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

const THEME_UUID = '00000000-0000-0000-0000-000000000001';

describe('GET / POST /chapters/[id]/themes', () => {
  it('GET 404 when chapter is foreign', async () => {
    authedUser();
    chRepoMocks.getChapter.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/themes/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST 404 when repo throws not_found', async () => {
    authedUser();
    const nf: any = new Error('nf');
    nf.code = 'not_found';
    chThemesMocks.linkThemeToChapter.mockRejectedValue(nf);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { themeId: THEME_UUID }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('POST 409 on duplicate', async () => {
    authedUser();
    const dup: any = new Error('dup');
    dup.code = 'duplicate';
    chThemesMocks.linkThemeToChapter.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { themeId: THEME_UUID }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('POST 201 + audits with chapter.bookId as projectId', async () => {
    authedUser();
    chThemesMocks.linkThemeToChapter.mockResolvedValue({
      chapterId: 'c-1',
      themeId: THEME_UUID,
      createdAt: '2026-01-01',
    });
    chRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { themeId: THEME_UUID }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_theme.linked',
        projectId: 'b-1',
      }),
    );
  });
});

describe('DELETE /chapters/[id]/themes/[themeId]', () => {
  it('404 when missing', async () => {
    authedUser();
    chThemesMocks.unlinkThemeFromChapter.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/themes/[themeId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'c-1', themeId: THEME_UUID }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + audits chapter_theme.unlinked', async () => {
    authedUser();
    chThemesMocks.unlinkThemeFromChapter.mockResolvedValue(true);
    chRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/themes/[themeId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'c-1', themeId: THEME_UUID }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_theme.unlinked',
        projectId: 'b-1',
      }),
    );
  });
});
