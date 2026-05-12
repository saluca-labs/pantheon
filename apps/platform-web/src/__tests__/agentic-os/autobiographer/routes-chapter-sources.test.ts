/**
 * Autobiographer OS — chapter-sources route handler tests.
 *
 * Covers GET/POST/DELETE on /chapters/[id]/sources with the
 * cross-ownership 404 + duplicate-link 409 + audit row matrix.
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
};
vi.mock('@/lib/agentic-os/autobiographer/chapters-repo', () => chaptersRepoMocks);

const memoriesRepoMocks = {
  getMemory: vi.fn(),
  listMemories: vi.fn(),
  listMemoriesForBook: vi.fn(),
  getMemoriesByIds: vi.fn(),
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/memories-repo', () => memoriesRepoMocks);

const sourcesRepoMocks = {
  listSourcesForChapter: vi.fn(),
  getChapterSource: vi.fn(),
  linkChapterSource: vi.fn(),
  updateChapterSource: vi.fn(),
  unlinkChapterSource: vi.fn(),
  listProvenanceForBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/chapter-sources-repo', () => sourcesRepoMocks);

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
  for (const m of Object.values(chaptersRepoMocks)) (m as any).mockReset();
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

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

const M_UUID = '22222222-2222-2222-2222-222222222222';

// ─── GET ─────────────────────────────────────────────────────────────────

describe('GET /chapters/[id]/sources', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 on foreign chapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + sources', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    sourcesRepoMocks.listSourcesForChapter.mockResolvedValue([
      { id: 's-1', memoryId: 'm-1' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sources).toHaveLength(1);
  });
});

// ─── POST ────────────────────────────────────────────────────────────────

describe('POST /chapters/[id]/sources', () => {
  it('returns 404 when chapter is foreign', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { memory_id: M_UUID }) as any,
      { params: Promise.resolve({ id: 'c-x' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when memory_id is omitted', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', { weight: 0.5 }) as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 (no existence leak) when memory is foreign', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    memoriesRepoMocks.getMemory.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { memory_id: M_UUID }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('creates + audits on happy path', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    memoriesRepoMocks.getMemory.mockResolvedValue({ id: M_UUID, title: 'A' });
    sourcesRepoMocks.linkChapterSource.mockResolvedValue({
      id: 's-1',
      chapterId: 'c-1',
      memoryId: M_UUID,
      weight: 0.7,
      notes: null,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { memory_id: M_UUID, weight: 0.7 }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_source.linked',
        projectId: 'b-1',
      }),
    );
  });

  it('translates 23505 to 409 (duplicate link)', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    memoriesRepoMocks.getMemory.mockResolvedValue({ id: M_UUID, title: 'A' });
    sourcesRepoMocks.linkChapterSource.mockRejectedValue(
      Object.assign(new Error('uniq'), { code: '23505' }),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { memory_id: M_UUID }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(409);
  });
});

// ─── DELETE ──────────────────────────────────────────────────────────────

describe('DELETE /chapters/[id]/sources?memory_id=', () => {
  it('returns 400 without memory_id', async () => {
    authedUser();
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when caller does not own the chapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/x?memory_id=${M_UUID}`, 'DELETE') as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('audits on successful unlink', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    sourcesRepoMocks.unlinkChapterSource.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/x?memory_id=${M_UUID}`, 'DELETE') as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_source.unlinked',
      }),
    );
  });

  it('returns 404 when the link does not exist', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    sourcesRepoMocks.unlinkChapterSource.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/x?memory_id=${M_UUID}`, 'DELETE') as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(404);
  });
});
