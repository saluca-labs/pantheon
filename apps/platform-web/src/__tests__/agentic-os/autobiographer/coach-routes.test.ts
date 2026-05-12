/**
 * Autobiographer OS Phase 7 — coach route tests.
 *
 * Covers:
 *   - Every coach route returns 401 unauthenticated.
 *   - Every mutating route returns 503 with coach_not_configured when
 *     ANTHROPIC_API_KEY is missing.
 *   - GET /sessions lists with mode + book_id + scope filters.
 *   - POST /sessions returns 201 on success, 400 on bad body, 404 on
 *     cross-book access.
 *   - GET/PATCH/DELETE /sessions/[id] respect cross-ownership.
 *   - PATCH /sessions/[id] does NOT accept a `mode` (immutability).
 *   - POST /sessions/[id]/messages streams a text/plain response,
 *     emits the U+001E trailer, persists the assistant turn, audits.
 *   - POST /sessions/[id]/messages with commit_to_chapter writes a
 *     chapter_revision row only when chapter_drafter mode + chapter_id
 *     supplied. The default (no flag) path writes ONLY the transcript.
 *   - POST /quick streams without persisting; verifies no session
 *     row is created.
 *
 * The streaming `ai` package is mocked at the module boundary; we
 * assert on wire format + side-effects, not real Anthropic round-trips.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];

const getCurrentAutobiographerUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: any[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
}));
vi.mock('@/lib/agentic-os/autobiographer/repo', () => repoMocks);

const bookRepoMocks = vi.hoisted(() => ({
  getBook: vi.fn(),
}));
vi.mock('@/lib/agentic-os/autobiographer/books-repo', () => bookRepoMocks);

const sessionsRepoMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  listSessions: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  appendMessages: vi.fn(),
  patchMetadata: vi.fn(),
  autoTitle: (s: string) => (s ? s.slice(0, 60) : 'New conversation'),
}));
vi.mock('@/lib/agentic-os/autobiographer/coach/sessions-repo', () => sessionsRepoMocks);

const contextMocks = vi.hoisted(() => ({
  buildCoachContext: vi.fn(),
}));
vi.mock('@/lib/agentic-os/autobiographer/coach/context', () => contextMocks);

const systemPromptMocks = vi.hoisted(() => ({
  buildSystemPrompt: vi.fn(() => 'SYSTEM_PROMPT'),
  SYSTEM_PROMPT_VERSION: 'v1',
}));
vi.mock('@/lib/agentic-os/autobiographer/coach/system-prompt', () => systemPromptMocks);

const anthropicMocks = vi.hoisted(() => ({
  isCoachConfigured: vi.fn(),
  getCoachModelId: vi.fn(() => 'claude-test-model'),
  getAnthropicProvider: vi.fn(() => (_id: string) => ({ stub: 'model' })),
  DEFAULT_COACH_MODEL: 'claude-sonnet-4-6',
}));
vi.mock('@/lib/agentic-os/autobiographer/coach/anthropic', () => anthropicMocks);

const revisionMocks = vi.hoisted(() => ({
  insertRevision: vi.fn(),
}));
vi.mock('@/lib/agentic-os/autobiographer/chapter-revisions-repo', () => revisionMocks);

const chapterMocks = vi.hoisted(() => ({
  getChapter: vi.fn(),
}));
vi.mock('@/lib/agentic-os/autobiographer/chapters-repo', () => chapterMocks);

vi.mock('ai', () => ({
  streamText: (_opts: any) => ({
    textStream: (async function* () {
      yield 'assistant ';
      yield 'reply ';
      yield '[cites: 11111111-1111-4111-8111-111111111111]';
    })(),
  }),
  convertToModelMessages: vi.fn(async (m: any) => m),
  stepCountIs: vi.fn(() => null),
}));

function authed() {
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

function paramsFor(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const OTHER_UUID = '00000000-0000-4000-8000-000000000002';
const CHAPTER_UUID = '00000000-0000-4000-8000-000000000003';

beforeEach(() => {
  getCurrentAutobiographerUser.mockReset();
  for (const k of [
    'createSession',
    'listSessions',
    'getSession',
    'updateSession',
    'deleteSession',
    'appendMessages',
    'patchMetadata',
  ]) {
    (sessionsRepoMocks as any)[k].mockReset();
  }
  repoMocks.recordAudit.mockReset();
  bookRepoMocks.getBook.mockReset();
  revisionMocks.insertRevision.mockReset();
  chapterMocks.getChapter.mockReset();
  contextMocks.buildCoachContext.mockReset();
  contextMocks.buildCoachContext.mockResolvedValue({
    context: { mode: 'general', data: {} },
    truncated: false,
  });
  systemPromptMocks.buildSystemPrompt.mockClear();
  anthropicMocks.isCoachConfigured.mockReset();
  anthropicMocks.isCoachConfigured.mockReturnValue(true);
});

afterEach(() => {
  if (ORIGINAL_KEY !== undefined) {
    process.env['ANTHROPIC_API_KEY'] = ORIGINAL_KEY;
  } else {
    delete process.env['ANTHROPIC_API_KEY'];
  }
});

// ═════════ GET /sessions ════════════════════════════════════════════════════

describe('GET /coach/sessions', () => {
  it('401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await GET(jsonReq('http://t/coach/sessions', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('200 with the sessions array', async () => {
    authed();
    sessionsRepoMocks.listSessions.mockResolvedValue([{ id: 's-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await GET(jsonReq('http://t/coach/sessions', 'GET') as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessions.length).toBe(1);
  });

  it('400 on invalid mode filter', async () => {
    authed();
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await GET(
      jsonReq('http://t/coach/sessions?mode=procurement_advisor', 'GET') as any,
    );
    expect(res.status).toBe(400);
  });

  it('passes mode + book_id filters to listSessions', async () => {
    authed();
    sessionsRepoMocks.listSessions.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    await GET(
      jsonReq(
        `http://t/coach/sessions?mode=interviewer&book_id=${VALID_UUID}`,
        'GET',
      ) as any,
    );
    expect(sessionsRepoMocks.listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        mode: 'interviewer',
        bookId: VALID_UUID,
      }),
    );
  });

  it('passes scope=workshop filter to listSessions', async () => {
    authed();
    sessionsRepoMocks.listSessions.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    await GET(
      jsonReq('http://t/coach/sessions?scope=workshop', 'GET') as any,
    );
    expect(sessionsRepoMocks.listSessions).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'workshop' }),
    );
  });
});

// ═════════ POST /sessions ═══════════════════════════════════════════════════

describe('POST /coach/sessions', () => {
  it('401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', { mode: 'general' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('503 coach_not_configured when ANTHROPIC_API_KEY missing', async () => {
    authed();
    anthropicMocks.isCoachConfigured.mockReturnValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', { mode: 'general' }) as any,
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('coach_not_configured');
  });

  it('400 on invalid mode', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', {
        mode: 'procurement_advisor',
      }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('404 when book_id supplied but book not owned', async () => {
    authed();
    bookRepoMocks.getBook.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', {
        mode: 'chapter_drafter',
        book_id: OTHER_UUID,
      }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('201 on success with audited session_created action', async () => {
    authed();
    bookRepoMocks.getBook.mockResolvedValue({ id: VALID_UUID });
    sessionsRepoMocks.createSession.mockResolvedValue({
      id: 's-1',
      bookId: VALID_UUID,
      mode: 'chapter_drafter',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', {
        mode: 'chapter_drafter',
        book_id: VALID_UUID,
        initial_message: 'Draft the opener',
      }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.coach.session_created',
        projectId: VALID_UUID,
      }),
    );
  });

  it('stamps system_prompt_version into metadata on create', async () => {
    authed();
    sessionsRepoMocks.createSession.mockResolvedValue({
      id: 's-1',
      bookId: null,
      mode: 'general',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/route'
    );
    await POST(
      jsonReq('http://t/coach/sessions', 'POST', { mode: 'general' }) as any,
    );
    expect(sessionsRepoMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ system_prompt_version: 'v1' }),
      }),
    );
  });
});

// ═════════ GET/PATCH/DELETE /sessions/[id] ═════════════════════════════════

describe('GET /coach/sessions/[id]', () => {
  it('401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('404 when session not found / not owned', async () => {
    authed();
    sessionsRepoMocks.getSession.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /coach/sessions/[id]', () => {
  it('400 when body missing title', async () => {
    authed();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {}) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('rejects mode in the body (mode is immutable post-create)', async () => {
    authed();
    sessionsRepoMocks.updateSession.mockResolvedValue({
      id: 's-1',
      bookId: null,
      title: 'Renamed',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/route'
    );
    // Including mode is silently ignored (schema doesn't include it); the
    // patch only carries `title`. Verify by introspecting the updateSession
    // call.
    await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        title: 'Renamed',
        mode: 'narrative_critic', // ignored
      }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(sessionsRepoMocks.updateSession).toHaveBeenCalledWith(
      's-1',
      'u-1',
      { title: 'Renamed' },
    );
  });

  it('audits as session_renamed on success', async () => {
    authed();
    sessionsRepoMocks.updateSession.mockResolvedValue({
      id: 's-1',
      bookId: VALID_UUID,
      title: 'New title',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'New title' }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.coach.session_renamed',
      }),
    );
  });
});

describe('DELETE /coach/sessions/[id]', () => {
  it('404 when session not found', async () => {
    authed();
    sessionsRepoMocks.getSession.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('audits as session_deleted on success', async () => {
    authed();
    sessionsRepoMocks.getSession.mockResolvedValue({
      id: 's-1',
      bookId: VALID_UUID,
    });
    sessionsRepoMocks.deleteSession.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.coach.session_deleted',
        projectId: VALID_UUID,
      }),
    );
  });
});

// ═════════ POST /sessions/[id]/messages ════════════════════════════════════

async function readResponseText(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe('POST /coach/sessions/[id]/messages', () => {
  beforeEach(() => {
    sessionsRepoMocks.getSession.mockResolvedValue({
      id: 's-1',
      userId: 'u-1',
      bookId: null,
      mode: 'general',
      title: 'A session',
      messages: [],
      metadata: {},
      createdAt: '',
      updatedAt: '',
    });
    sessionsRepoMocks.appendMessages.mockResolvedValue(null);
    sessionsRepoMocks.patchMetadata.mockResolvedValue(null);
  });

  it('503 when ANTHROPIC_API_KEY missing', async () => {
    authed();
    anthropicMocks.isCoachConfigured.mockReturnValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { message: 'hi' }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(503);
  });

  it('404 when session not found', async () => {
    authed();
    sessionsRepoMocks.getSession.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { message: 'hi' }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('streams text/plain with the U+001E trailer + sentinel JSON', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { message: 'hi' }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(res.headers.get('x-coach-session-id')).toBe('s-1');
    const body = await readResponseText(res);
    expect(body).toMatch(/assistant reply/);
    // U+001E sentinel
    expect(body).toContain(String.fromCharCode(0x1e));
    // JSON trailer carries the expected keys
    const trailer = body.split(String.fromCharCode(0x1e))[1];
    expect(trailer).toBeTruthy();
    const parsed = JSON.parse(trailer.trim());
    expect(parsed.session_id).toBe('s-1');
    expect(parsed.system_prompt_version).toBe('v1');
    expect(parsed.context_truncated).toBe(false);
  });

  it('does NOT write a chapter_revision when commit_to_chapter omitted', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { message: 'hi' }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    await readResponseText(res);
    expect(revisionMocks.insertRevision).not.toHaveBeenCalled();
  });

  it('only commits when session.mode = chapter_drafter AND chapter_id supplied AND flag true', async () => {
    authed();
    // Session is in 'general' mode — commit should NOT fire.
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        message: 'hi',
        commit_to_chapter: true,
        chapter_id: CHAPTER_UUID,
      }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    await readResponseText(res);
    expect(revisionMocks.insertRevision).not.toHaveBeenCalled();
  });

  it('commits to chapter when mode=chapter_drafter + flag + chapter_id', async () => {
    authed();
    sessionsRepoMocks.getSession.mockResolvedValue({
      id: 's-1',
      userId: 'u-1',
      bookId: VALID_UUID,
      mode: 'chapter_drafter',
      title: 'Draft session',
      messages: [],
      metadata: {},
      createdAt: '',
      updatedAt: '',
    });
    chapterMocks.getChapter.mockResolvedValue({
      id: CHAPTER_UUID,
      userId: 'u-1',
      bookId: VALID_UUID,
    });
    revisionMocks.insertRevision.mockResolvedValue({
      id: 'r-1',
      version: 7,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        message: 'draft it',
        commit_to_chapter: true,
        chapter_id: CHAPTER_UUID,
      }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    const body = await readResponseText(res);
    expect(revisionMocks.insertRevision).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        chapterId: CHAPTER_UUID,
        author: 'coach',
        coachSessionId: 's-1',
      }),
    );
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.coach.draft_committed',
      }),
    );
    const trailer = body.split(String.fromCharCode(0x1e))[1];
    const parsed = JSON.parse(trailer.trim());
    expect(parsed.committed_revision_id).toBe('r-1');
    // citations was parsed from the stream (1 marker emitted by mock)
    expect(parsed.citations.length).toBe(1);
  });

  it('returns 404 when commit_to_chapter targets a chapter not owned by caller', async () => {
    authed();
    sessionsRepoMocks.getSession.mockResolvedValue({
      id: 's-1',
      userId: 'u-1',
      bookId: VALID_UUID,
      mode: 'chapter_drafter',
      title: 'Draft session',
      messages: [],
      metadata: {},
      createdAt: '',
      updatedAt: '',
    });
    chapterMocks.getChapter.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        message: 'hi',
        commit_to_chapter: true,
        chapter_id: CHAPTER_UUID,
      }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('400 when commit_to_chapter targets a chapter from a different book', async () => {
    authed();
    sessionsRepoMocks.getSession.mockResolvedValue({
      id: 's-1',
      userId: 'u-1',
      bookId: VALID_UUID,
      mode: 'chapter_drafter',
      title: 'Draft session',
      messages: [],
      metadata: {},
      createdAt: '',
      updatedAt: '',
    });
    chapterMocks.getChapter.mockResolvedValue({
      id: CHAPTER_UUID,
      userId: 'u-1',
      bookId: OTHER_UUID, // different book
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        message: 'hi',
        commit_to_chapter: true,
        chapter_id: CHAPTER_UUID,
      }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('audits as message_sent on every stream', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { message: 'hi' }) as any,
      paramsFor({ sessionId: 's-1' }) as any,
    );
    await readResponseText(res);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.coach.message_sent',
      }),
    );
  });
});

// ═════════ POST /quick ═════════════════════════════════════════════════════

describe('POST /coach/quick', () => {
  it('401 unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { mode: 'general', message: 'hi' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('503 when ANTHROPIC_API_KEY missing', async () => {
    authed();
    anthropicMocks.isCoachConfigured.mockReturnValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { mode: 'general', message: 'hi' }) as any,
    );
    expect(res.status).toBe(503);
  });

  it('400 on invalid mode', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        mode: 'procurement_advisor',
        message: 'hi',
      }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('streams without creating a session row', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { mode: 'general', message: 'hi' }) as any,
    );
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(sessionsRepoMocks.createSession).not.toHaveBeenCalled();
    expect(repoMocks.recordAudit).not.toHaveBeenCalled();
    const body = await readResponseText(res);
    expect(body).toContain(String.fromCharCode(0x1e));
  });
});

// ═════════ Registry presence ═══════════════════════════════════════════════

describe('Autobiographer registry has the AI coach card', () => {
  it('includes the coach feature in the autobiographer module', async () => {
    const { AGENTIC_OS_MODULES } = await import('@/lib/agentic-os/registry');
    const mod = AGENTIC_OS_MODULES.find(
      (m: any) => m.slug === 'autobiographer',
    );
    expect(mod).toBeTruthy();
    const coach = mod!.features.find(
      (f: any) => f.href === '/dashboard/os/autobiographer/coach',
    );
    expect(coach).toBeTruthy();
    expect(coach!.label).toMatch(/AI coach/i);
  });
});
