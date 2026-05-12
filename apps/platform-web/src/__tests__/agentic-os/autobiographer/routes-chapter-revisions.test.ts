/**
 * Autobiographer OS — chapter-revisions route handler tests.
 *
 * Covers GET/POST on /chapters/[id]/revisions and GET/PATCH/DELETE on
 * /chapters/[id]/revisions/[revId]. The coach-author + coach_session_id
 * requirement is exercised here; cross-ownership 404 paths likewise.
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
  for (const m of Object.values(revRepoMocks)) (m as any).mockReset();
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

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// ─── GET /chapters/[id]/revisions ─────────────────────────────────────────

describe('GET /chapters/[id]/revisions', () => {
  it('returns 401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
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
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-foreign' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + revisions array', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.listRevisionsForChapter.mockResolvedValue([
      { id: 'r-1', version: 1 },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revisions).toHaveLength(1);
  });
});

// ─── POST /chapters/[id]/revisions ────────────────────────────────────────

describe('POST /chapters/[id]/revisions', () => {
  it('returns 404 on foreign chapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { author: 'user', bodyText: 'x' }) as any,
      { params: Promise.resolve({ id: 'c-foreign' }) },
    );
    expect(res.status).toBe(404);
  });

  it('rejects coach revision without coach_session_id', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        author: 'coach',
        bodyText: 'draft from coach',
      }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('accepts coach revision when coach_session_id supplied', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.insertRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 1,
      author: 'coach',
      wordCount: 3,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        author: 'coach',
        bodyText: 'draft from coach',
        coach_session_id: VALID_UUID,
      }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_revision.created',
        projectId: 'b-1',
      }),
    );
  });

  it('rejects invalid author enum', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { author: 'admin', bodyText: 'x' }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('user-author revision creates without coach_session_id', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.insertRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 2,
      author: 'user',
      wordCount: 5,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { author: 'user', bodyText: 'one two' }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(201);
  });
});

// ─── PATCH /chapters/[id]/revisions/[revId] ────────────────────────────────

describe('PATCH /chapters/[id]/revisions/[revId]', () => {
  it('returns 404 when chapter not owned', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { bodyText: 'edit' }) as any,
      { params: Promise.resolve({ id: 'c-x', revId: 'r-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when revision belongs to a different chapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.getRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-other',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { bodyText: 'edit' }) as any,
      { params: Promise.resolve({ id: 'c-1', revId: 'r-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('Phase 6 — accepts sensitiveKinds (camelCase), rejects unknown enum values', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.getRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 1,
    });
    revRepoMocks.updateRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 1,
      sensitiveKinds: ['death'],
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]/route'
    );
    // valid kind passes
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { sensitiveKinds: ['death'] }) as any,
      { params: Promise.resolve({ id: 'c-1', revId: 'r-1' }) },
    );
    expect(res.status).toBe(200);
    expect(revRepoMocks.updateRevision).toHaveBeenCalledWith(
      'r-1',
      'u-1',
      expect.objectContaining({ sensitiveKinds: ['death'] }),
    );
    // invalid enum fails
    const res2 = await PATCH(
      jsonReq('http://t/x', 'PATCH', { sensitiveKinds: ['BOGUS'] }) as any,
      { params: Promise.resolve({ id: 'c-1', revId: 'r-1' }) },
    );
    expect(res2.status).toBe(400);
  });

  it('Phase 6 — sensitiveKinds-only patch audits with dedicated action', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.getRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 1,
    });
    revRepoMocks.updateRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 1,
      sensitiveKinds: ['legal'],
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { sensitiveKinds: ['legal'] }) as any,
      { params: Promise.resolve({ id: 'c-1', revId: 'r-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_revision.sensitive_kinds_updated',
      }),
    );
  });

  it('updates and audits on happy path', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.getRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 1,
    });
    revRepoMocks.updateRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 1,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { bodyText: 'new prose' }) as any,
      { params: Promise.resolve({ id: 'c-1', revId: 'r-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_revision.updated',
      }),
    );
  });
});

// ─── DELETE /chapters/[id]/revisions/[revId] ───────────────────────────────

describe('DELETE /chapters/[id]/revisions/[revId]', () => {
  it('audits on successful delete', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.getRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-1',
      version: 2,
    });
    revRepoMocks.deleteRevision.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'c-1', revId: 'r-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.chapter_revision.deleted',
      }),
    );
  });

  it('returns 404 when revision belongs to a different chapter', async () => {
    authedUser();
    chaptersRepoMocks.getChapter.mockResolvedValue({ id: 'c-1', bookId: 'b-1' });
    revRepoMocks.getRevision.mockResolvedValue({
      id: 'r-1',
      chapterId: 'c-other',
    });
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'c-1', revId: 'r-1' }),
    });
    expect(res.status).toBe(404);
  });
});
