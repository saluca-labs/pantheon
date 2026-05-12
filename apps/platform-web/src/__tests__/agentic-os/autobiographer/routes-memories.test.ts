/**
 * Autobiographer OS — memories route handler tests.
 *
 * Covers 401, 200/201, 400 on invalid body, 404 on missing memory, and the
 * cross-ownership "book_not_found" mapping that turns the repo's typed
 * error into a 404. Also covers the per-book convenience wrapper.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

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
};

const booksRepoMocks = {
  getBook: vi.fn(),
  listBooks: vi.fn(),
  getBookWithCounts: vi.fn(),
  createBook: vi.fn(),
  updateBook: vi.fn(),
  softDeleteBook: vi.fn(),
  deleteBook: vi.fn(),
};

vi.mock(
  '@/lib/agentic-os/autobiographer/memories-repo',
  () => memRepoMocks,
);
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => booksRepoMocks);

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
  for (const m of Object.values(booksRepoMocks)) (m as any).mockReset();
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

// ─── GET /memories ───────────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/memories', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('returns 200 + memories list', async () => {
    authedUser();
    memRepoMocks.listMemories.mockResolvedValue([
      { id: 'm-1', title: 'First move' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memories).toHaveLength(1);
  });

  it('passes ?book_id=<uuid>', async () => {
    authedUser();
    memRepoMocks.listMemories.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    await GET(jsonReq('http://t/x?book_id=b-1', 'GET') as any);
    expect(memRepoMocks.listMemories).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: 'b-1' }),
    );
  });

  it('passes ?book_id=null as workshop-global filter (book_id IS NULL)', async () => {
    authedUser();
    memRepoMocks.listMemories.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    await GET(jsonReq('http://t/x?book_id=null', 'GET') as any);
    expect(memRepoMocks.listMemories).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: null }),
    );
  });

  it('passes tag + era filters', async () => {
    authedUser();
    memRepoMocks.listMemories.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    await GET(
      jsonReq(
        'http://t/x?content_tag=family&emotion_tag=grief&era_after=1990-01-01&era_before=2000-01-01&is_sensitive=true',
        'GET',
      ) as any,
    );
    expect(memRepoMocks.listMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        contentTag: 'family',
        emotionTag: 'grief',
        eraAfter: '1990-01-01',
        eraBefore: '2000-01-01',
        isSensitive: true,
      }),
    );
  });
});

// ─── POST /memories ──────────────────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/memories', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        title: 'T',
        bodyMarkdown: 'B',
      }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when bodyMarkdown is missing', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { title: 'T' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('returns 201 on success and audits memory.created', async () => {
    authedUser();
    memRepoMocks.createMemory.mockResolvedValue({
      id: 'm-1',
      bookId: null,
      title: 'T',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        title: 'T',
        bodyMarkdown: 'B',
      }) as any,
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory.created',
        projectId: null,
      }),
    );
  });

  it('returns 404 when repo throws book_not_found', async () => {
    authedUser();
    const err: any = new Error('book_not_found');
    err.code = 'book_not_found';
    memRepoMocks.createMemory.mockRejectedValue(err);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        title: 'T',
        bodyMarkdown: 'B',
        bookId: '00000000-0000-0000-0000-000000000001',
      }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('passes projectId = bookId on audit when book is set', async () => {
    authedUser();
    memRepoMocks.createMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      title: 'T',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/route'
    );
    await POST(
      jsonReq('http://t/x', 'POST', {
        title: 'T',
        bodyMarkdown: 'B',
        bookId: '00000000-0000-0000-0000-000000000001',
      }) as any,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'b-1' }),
    );
  });
});

// ─── GET /memories/[id] ──────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/memories/[id]', () => {
  it('returns 404 when not found / cross-ownership fails', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with the memory when found', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue({ id: 'm-1', title: 'T' });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── PATCH /memories/[id] ────────────────────────────────────────────────────

describe('PATCH /api/tiresias/agentic-os/autobiographer/memories/[id]', () => {
  it('returns 404 when repo throws book_not_found', async () => {
    authedUser();
    const err: any = new Error('book_not_found');
    err.code = 'book_not_found';
    memRepoMocks.updateMemory.mockRejectedValue(err);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        bookId: '00000000-0000-0000-0000-000000000002',
      }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('audits memory.updated on success', async () => {
    authedUser();
    memRepoMocks.updateMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      title: 'Renamed',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'Renamed' }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory.updated',
        projectId: 'b-1',
      }),
    );
  });

  // ─── Phase 6 — sensitive_kinds patch ───────────────────────────────────

  it('Phase 6 — accepts sensitiveKinds and passes through to repo', async () => {
    authedUser();
    memRepoMocks.updateMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      sensitiveKinds: ['death', 'legal'],
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        sensitiveKinds: ['death', 'legal'],
      }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(200);
    expect(memRepoMocks.updateMemory).toHaveBeenCalledWith(
      'm-1',
      'u-1',
      expect.objectContaining({ sensitiveKinds: ['death', 'legal'] }),
    );
  });

  it('Phase 6 — rejects unknown sensitiveKinds enum values', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { sensitiveKinds: ['BOGUS'] }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('Phase 6 — sensitiveKinds-only patch fires the dedicated audit action', async () => {
    authedUser();
    memRepoMocks.updateMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      sensitiveKinds: ['mental_health'],
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        sensitiveKinds: ['mental_health'],
      }) as any,
      { params: Promise.resolve({ id: 'm-1' }) },
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory.sensitive_kinds_updated',
      }),
    );
  });
});

// ─── DELETE /memories/[id] ───────────────────────────────────────────────────

describe('DELETE /api/tiresias/agentic-os/autobiographer/memories/[id]', () => {
  it('returns 404 when the memory does not exist', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('issues a hard delete and audits with the prior bookId on the audit row', async () => {
    authedUser();
    memRepoMocks.getMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
      title: 'T',
    });
    memRepoMocks.deleteMemory.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/memories/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'm-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory.deleted',
        projectId: 'b-1',
      }),
    );
  });
});

// ─── /books/[id]/memories convenience wrappers ──────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/books/[id]/memories', () => {
  it('returns 404 when the book is not owned by caller', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/memories/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'b-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + scoped list', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', title: 'X' });
    memRepoMocks.listMemoriesForBook.mockResolvedValue([
      { id: 'm-1', bookId: 'b-1' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/memories/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/tiresias/agentic-os/autobiographer/books/[id]/memories', () => {
  it('returns 404 when book ownership check fails BEFORE body validation', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/memories/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {}) as any,
      { params: Promise.resolve({ id: 'b-other' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid body when book ownership is good', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', title: 'X' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/memories/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any, {
      params: Promise.resolve({ id: 'b-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 201 with the bookId pre-set and audits memory.created', async () => {
    authedUser();
    booksRepoMocks.getBook.mockResolvedValue({ id: 'b-1', title: 'X' });
    memRepoMocks.createMemory.mockResolvedValue({
      id: 'm-1',
      bookId: 'b-1',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/books/[id]/memories/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        title: 'T',
        bodyMarkdown: 'B',
      }) as any,
      { params: Promise.resolve({ id: 'b-1' }) },
    );
    expect(res.status).toBe(201);
    expect(memRepoMocks.createMemory).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ bookId: 'b-1' }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.memory.created',
        projectId: 'b-1',
      }),
    );
  });
});
