/**
 * Autobiographer OS — timeline route handler tests.
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

const bookRepoMocks = {
  getBook: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => bookRepoMocks);

const tlMocks = {
  listTimeline: vi.fn(),
  listArcMembershipsForMemoryIds: vi.fn(),
  listAvailableDecades: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/timeline', () => tlMocks);

beforeEach(() => {
  getCurrentAutobiographerUser.mockReset();
  for (const m of Object.values(bookRepoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
  for (const m of Object.values(tlMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authedUser() {
  getCurrentAutobiographerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function jsonReq(url: string, method: string): NextRequest {
  return new NextRequest(url, { method });
}

describe('GET /books/[bookId]/timeline', () => {
  it('401 when unauthed', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/timeline/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 when scope=book and book is foreign', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/timeline/route'
    );
    const res = await GET(jsonReq('http://t/x?scope=book', 'GET') as never, {
      params: Promise.resolve({ id: 'b-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + memories with scope=workshop skips book probe', async () => {
    authedUser();
    tlMocks.listTimeline.mockResolvedValue([{ id: 'm-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/timeline/route'
    );
    const res = await GET(jsonReq('http://t/x?scope=workshop', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
    expect(bookRepoMocks.getBook).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.scope).toBe('workshop');
    expect(body.memories).toHaveLength(1);
  });

  it('passes filter params through to listTimeline', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    tlMocks.listTimeline.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/timeline/route'
    );
    const url =
      'http://t/x?scope=book&theme_id=t1&theme_id=t2&decade=1990&content_tag=music&emotion_tag=joy&person_id=p1&sensitive=false&limit=50';
    await GET(jsonReq(url, 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(tlMocks.listTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        scope: 'book',
        bookId: 'b-1',
        themeIds: ['t1', 't2'],
        contentTag: 'music',
        emotionTag: 'joy',
        decade: 1990,
        personId: 'p1',
        isSensitive: false,
        limit: 50,
      }),
    );
  });

  it('ignores malformed decade param', async () => {
    authedUser();
    bookRepoMocks.getBook.mockResolvedValue({ id: 'b-1' });
    tlMocks.listTimeline.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/timeline/route'
    );
    await GET(jsonReq('http://t/x?scope=book&decade=bogus', 'GET') as never, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(tlMocks.listTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ decade: undefined }),
    );
  });
});
