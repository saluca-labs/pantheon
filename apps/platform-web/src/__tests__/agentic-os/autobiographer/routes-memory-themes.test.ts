/**
 * Autobiographer OS — memory↔themes route handler tests.
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

const memRepoMocks = {
  listMemories: vi.fn(),
  getMemory: vi.fn(),
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  listMemoriesForBook: vi.fn(),
  getMemoriesByIds: vi.fn(),
};
const memThemesMocks = {
  listThemesForMemory: vi.fn(),
  listMemoriesForTheme: vi.fn(),
  listThemesForMemoryIds: vi.fn(),
  linkThemeToMemory: vi.fn(),
  unlinkThemeFromMemory: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/memories-repo',
  () => memRepoMocks,
);
vi.mock(
  '@/lib/agentic-os/autobiographer/memory-themes-repo',
  () => memThemesMocks,
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
  for (const m of Object.values(memRepoMocks)) (m as any).mockReset();
  for (const m of Object.values(memThemesMocks)) (m as any).mockReset();
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

describe('GET /memories/[id]/themes', () => {
  it('401 when unauthed', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 when memory is foreign / missing', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + themes', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue({ id: 'm-1' });
    memThemesMocks.listThemesForMemory.mockResolvedValue([{ id: 't-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.themes).toHaveLength(1);
  });
});

describe('POST /memories/[id]/themes', () => {
  it('400 on missing themeId', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when repo throws not_found', async () => {
    authedUser();
    const nf: any = new Error('nf');
    nf.code = 'not_found';
    memThemesMocks.linkThemeToMemory.mockRejectedValue(nf);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { themeId: THEME_UUID }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('409 on duplicate', async () => {
    authedUser();
    const dup: any = new Error('dup');
    dup.code = 'duplicate';
    memThemesMocks.linkThemeToMemory.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { themeId: THEME_UUID }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('201 + audits memory_theme.linked with projectId = memory.bookId', async () => {
    authedUser();
    memThemesMocks.linkThemeToMemory.mockResolvedValue({
      memoryId: 'm-1',
      themeId: THEME_UUID,
      createdAt: '2026-01-01',
    });
    memRepoMocks.getMemory.mockResolvedValue({ id: 'm-1', bookId: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { themeId: THEME_UUID }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory_theme.linked',
        projectId: 'b-1',
      }),
    );
  });
});

describe('DELETE /memories/[id]/themes/[themeId]', () => {
  it('404 when missing', async () => {
    authedUser();
    memThemesMocks.unlinkThemeFromMemory.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/[themeId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-1', themeId: THEME_UUID }),
    });
    expect(res.status).toBe(404);
  });

  it('404 when repo throws not_found', async () => {
    authedUser();
    const nf: any = new Error('nf');
    nf.code = 'not_found';
    memThemesMocks.unlinkThemeFromMemory.mockRejectedValue(nf);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/[themeId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-1', themeId: THEME_UUID }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + audits memory_theme.unlinked', async () => {
    authedUser();
    memThemesMocks.unlinkThemeFromMemory.mockResolvedValue(true);
    memRepoMocks.getMemory.mockResolvedValue({ id: 'm-1', bookId: 'b-1' });
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/themes/[themeId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-1', themeId: THEME_UUID }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory_theme.unlinked',
        projectId: 'b-1',
      }),
    );
  });
});
