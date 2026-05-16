/**
 * Autobiographer OS — arc-chapters route handler tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentAutobiographerUser = vi.fn();
vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: unknown[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const arcsRepoMocks = {
  getArc: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/arcs-repo', () => arcsRepoMocks);

const acRepoMocks = {
  listChaptersForArc: vi.fn(),
  attachChapterToArc: vi.fn(),
  reorderArcChapters: vi.fn(),
  unlinkChapterFromArc: vi.fn(),
  listChapterIdsForArc: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/arc-chapters-repo',
  () => acRepoMocks,
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
  for (const m of Object.values(arcsRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(acRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authedUser() {
  getCurrentAutobiographerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}
function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

const CHAPTER_UUID = '00000000-0000-0000-0000-000000000001';
const OTHER_CHAPTER = '00000000-0000-0000-0000-000000000002';

describe('GET /arcs/[id]/chapters', () => {
  it('404 when arc foreign', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'a-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + joined chapter list', async () => {
    authedUser();
    arcsRepoMocks.getArc.mockResolvedValue({ id: 'a-1' });
    acRepoMocks.listChaptersForArc.mockResolvedValue([
      { id: 'ac-1', chapterId: CHAPTER_UUID },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'a-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters).toHaveLength(1);
  });
});

describe('POST /arcs/[id]/chapters', () => {
  it('400 on missing chapter_id', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as never, {
      params: Promise.resolve({ id: 'a-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when repo throws not_found (cross-book chapter)', async () => {
    authedUser();
    const nf = new Error('nf') as Error & { code?: string; constraint?: string };
    nf.code = 'not_found';
    acRepoMocks.attachChapterToArc.mockRejectedValue(nf);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { chapter_id: CHAPTER_UUID }) as never,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('409 on duplicate', async () => {
    authedUser();
    const dup = new Error('dup') as Error & { code?: string; constraint?: string };
    dup.code = 'duplicate';
    acRepoMocks.attachChapterToArc.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { chapter_id: CHAPTER_UUID }) as never,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('201 + audits arc_chapter.attached', async () => {
    authedUser();
    acRepoMocks.attachChapterToArc.mockResolvedValue({
      id: 'ac-1',
      arcId: 'a-1',
      chapterId: CHAPTER_UUID,
      position: 2,
      createdAt: '2026-01-01',
    });
    arcsRepoMocks.getArc.mockResolvedValue({ id: 'a-1', bookId: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { chapter_id: CHAPTER_UUID }) as never,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.arc_chapter.attached',
        projectId: 'b-1',
      }),
    );
  });
});

describe('PATCH /arcs/[id]/chapters (reorder)', () => {
  it('400 when entries missing', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await PATCH(jsonReq('http://t/x', 'PATCH', {}) as never, {
      params: Promise.resolve({ id: 'a-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when repo throws not_found', async () => {
    authedUser();
    const nf = new Error('nf') as Error & { code?: string; constraint?: string };
    nf.code = 'not_found';
    acRepoMocks.reorderArcChapters.mockRejectedValue(nf);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        entries: [
          { chapter_id: CHAPTER_UUID, position: 0 },
          { chapter_id: OTHER_CHAPTER, position: 1 },
        ],
      }) as never,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('200 + audits arc_chapter.reordered', async () => {
    authedUser();
    acRepoMocks.reorderArcChapters.mockResolvedValue([]);
    arcsRepoMocks.getArc.mockResolvedValue({ id: 'a-1', bookId: 'b-1' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        entries: [
          { chapter_id: CHAPTER_UUID, position: 1 },
          { chapter_id: OTHER_CHAPTER, position: 0 },
        ],
      }) as never,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.arc_chapter.reordered',
      }),
    );
  });
});

describe('DELETE /arcs/[id]/chapters?chapter_id=', () => {
  it('400 when chapter_id query missing', async () => {
    authedUser();
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as never, {
      params: Promise.resolve({ id: 'a-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when removed=false', async () => {
    authedUser();
    acRepoMocks.unlinkChapterFromArc.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/x?chapter_id=${CHAPTER_UUID}`, 'DELETE') as never,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('200 + audits arc_chapter.unlinked', async () => {
    authedUser();
    acRepoMocks.unlinkChapterFromArc.mockResolvedValue(true);
    arcsRepoMocks.getArc.mockResolvedValue({ id: 'a-1', bookId: 'b-1' });
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/x?chapter_id=${CHAPTER_UUID}`, 'DELETE') as never,
      { params: Promise.resolve({ id: 'a-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.arc_chapter.unlinked',
        projectId: 'b-1',
      }),
    );
  });
});
