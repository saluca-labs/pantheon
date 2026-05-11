/**
 * Maker OS Phase 7 — coach route tests.
 *
 * Covers:
 *   - Every coach route returns 401 unauthenticated.
 *   - Every mutating route returns 503 with coach_not_configured when
 *     ANTHROPIC_API_KEY is missing.
 *   - GET /sessions lists with mode + project_id + scope filters.
 *   - POST /sessions returns 201 on success, 400 on bad body, 404 on
 *     cross-project access.
 *   - GET/PATCH/DELETE /sessions/[id] respect cross-ownership (404 when
 *     not owned, repo enforces it via WHERE id AND user_id).
 *   - POST /sessions/[id]/messages returns 503 when key missing,
 *     streams a text/plain response when configured, 404 on missing
 *     session.
 *   - POST /quick returns 503 when key missing, 400 on bad body.
 *
 * The streaming wire format is mocked at the `ai` package boundary; we
 * assert on the headers + the trailer sentinel + the audit/persistence
 * side effects, not on real Anthropic round-trips.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];

const getCurrentMakerUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getCurrentMakerUser: (...args: any[]) => getCurrentMakerUser(...args),
  getMakerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  getProject: vi.fn(),
}));
vi.mock('@/lib/agentic-os/maker/repo', () => repoMocks);

const coachRepoMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  listSessions: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  appendMessages: vi.fn(),
  autoTitle: (s: string) => (s ? s.slice(0, 60) : 'New conversation'),
}));
vi.mock('@/lib/agentic-os/maker/coach/repo', () => coachRepoMocks);

const contextMocks = vi.hoisted(() => ({
  buildCoachContext: vi.fn(),
}));
vi.mock('@/lib/agentic-os/maker/coach/context', () => contextMocks);

const systemPromptMocks = vi.hoisted(() => ({
  buildSystemPrompt: vi.fn(() => 'SYSTEM_PROMPT'),
  SYSTEM_PROMPT_VERSION: 'v1',
}));
vi.mock('@/lib/agentic-os/maker/coach/system-prompt', () => systemPromptMocks);

const anthropicMocks = vi.hoisted(() => ({
  isCoachConfigured: vi.fn(),
  getCoachModelId: vi.fn(() => 'claude-test-model'),
  getAnthropicProvider: vi.fn(() => (_id: string) => ({ stub: 'model' })),
  DEFAULT_COACH_MODEL: 'claude-sonnet-4-6',
}));
vi.mock('@/lib/agentic-os/maker/coach/anthropic', () => anthropicMocks);

// Mock the streaming `ai` package — produce a fake text stream we can
// drain synchronously in tests.
vi.mock('ai', () => ({
  streamText: (_opts: any) => ({
    textStream: (async function* () {
      yield 'assistant ';
      yield 'reply';
    })(),
  }),
  convertToModelMessages: vi.fn(async (m: any) => m),
  stepCountIs: vi.fn(() => null),
}));

function authed() {
  getCurrentMakerUser.mockResolvedValue({
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

beforeEach(() => {
  getCurrentMakerUser.mockReset();
  for (const m of Object.values(repoMocks)) (m as any).mockReset();
  for (const k of ['createSession', 'listSessions', 'getSession', 'updateSession', 'deleteSession', 'appendMessages']) {
    (coachRepoMocks as any)[k].mockReset();
  }
  contextMocks.buildCoachContext.mockReset();
  contextMocks.buildCoachContext.mockResolvedValue({ mode: 'general', data: {} });
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
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await GET(jsonReq('http://t/coach/sessions', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('200 with the sessions array', async () => {
    authed();
    coachRepoMocks.listSessions.mockResolvedValue([{ id: 's-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await GET(jsonReq('http://t/coach/sessions', 'GET') as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
  });

  it('passes mode + project_id + scope query params to the repo', async () => {
    authed();
    coachRepoMocks.listSessions.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    await GET(
      jsonReq(
        `http://t/coach/sessions?mode=shop_safety&project_id=${VALID_UUID}&scope=workshop&limit=10&offset=5`,
        'GET',
      ) as any,
    );
    expect(coachRepoMocks.listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        mode: 'shop_safety',
        projectId: VALID_UUID,
        scope: 'workshop',
        limit: 10,
        offset: 5,
      }),
    );
  });

  it('400 for invalid mode filter', async () => {
    authed();
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await GET(
      jsonReq('http://t/coach/sessions?mode=bogus', 'GET') as any,
    );
    expect(res.status).toBe(400);
  });
});

// ═════════ POST /sessions ═══════════════════════════════════════════════════

describe('POST /coach/sessions', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', { mode: 'general' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('503 with coach_not_configured when ANTHROPIC_API_KEY is missing', async () => {
    authed();
    anthropicMocks.isCoachConfigured.mockReturnValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', { mode: 'general' }) as any,
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('coach_not_configured');
    expect(data.message).toMatch(/not yet configured/i);
  });

  it('400 on missing mode', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', {}) as any,
    );
    expect(res.status).toBe(400);
  });

  it('400 on invalid mode', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', { mode: 'not_a_mode' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('404 when project_id supplied but project is not owned', async () => {
    authed();
    repoMocks.getProject.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', {
        mode: 'build_planner',
        project_id: OTHER_UUID,
      }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('201 on success and audits the create', async () => {
    authed();
    coachRepoMocks.createSession.mockResolvedValue({
      id: 's-1',
      mode: 'general',
      projectId: null,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/sessions', 'POST', { mode: 'general' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.coach.session.create',
        actorId: 'u-1',
      }),
    );
  });

  it('seeds initial_message into the session', async () => {
    authed();
    coachRepoMocks.createSession.mockResolvedValue({
      id: 's-1',
      mode: 'general',
      projectId: null,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    await POST(
      jsonReq('http://t/coach/sessions', 'POST', {
        mode: 'general',
        initial_message: 'walk me through the workshop',
      }) as any,
    );
    const call = coachRepoMocks.createSession.mock.calls[0][0];
    expect(call.initialMessages).toHaveLength(1);
    expect(call.initialMessages[0].role).toBe('user');
    expect(call.initialMessages[0].content).toBe('walk me through the workshop');
  });

  it('auto-titles from the initial_message when title is omitted', async () => {
    authed();
    coachRepoMocks.createSession.mockResolvedValue({
      id: 's-1',
      mode: 'general',
      projectId: null,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/route'
    );
    await POST(
      jsonReq('http://t/coach/sessions', 'POST', {
        mode: 'general',
        initial_message: 'walk me through the workshop',
      }) as any,
    );
    const call = coachRepoMocks.createSession.mock.calls[0][0];
    expect(call.title).toBe('walk me through the workshop');
  });
});

// ═════════ GET /sessions/[id] ═══════════════════════════════════════════════

describe('GET /coach/sessions/[sessionId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await GET(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'GET') as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('404 on cross-ownership miss', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await GET(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'GET') as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('200 with session', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue({ id: VALID_UUID });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await GET(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'GET') as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.id).toBe(VALID_UUID);
  });
});

// ═════════ PATCH /sessions/[id] ═════════════════════════════════════════════

describe('PATCH /coach/sessions/[sessionId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'PATCH', { title: 'new' }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('400 on missing title', async () => {
    authed();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'PATCH', {}) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('404 when session not owned by user', async () => {
    authed();
    coachRepoMocks.updateSession.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'PATCH', { title: 'new' }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('200 + audits on rename', async () => {
    authed();
    coachRepoMocks.updateSession.mockResolvedValue({
      id: VALID_UUID,
      projectId: null,
      title: 'new',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await PATCH(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'PATCH', { title: 'new' }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.coach.session.update' }),
    );
  });
});

// ═════════ DELETE /sessions/[id] ════════════════════════════════════════════

describe('DELETE /coach/sessions/[sessionId]', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'DELETE') as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('404 when session not found', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'DELETE') as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('200 + audits on successful delete', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue({ id: VALID_UUID, projectId: 'p-1' });
    coachRepoMocks.deleteSession.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/route'
    );
    const res = await DELETE(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}`, 'DELETE') as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.coach.session.delete',
        projectId: 'p-1',
      }),
    );
  });
});

// ═════════ POST /sessions/[id]/messages ═════════════════════════════════════

async function drain(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe('POST /coach/sessions/[sessionId]/messages', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {
        message: 'hi',
      }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('503 coach_not_configured when key missing', async () => {
    authed();
    anthropicMocks.isCoachConfigured.mockReturnValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {
        message: 'hi',
      }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('coach_not_configured');
  });

  it('404 on missing session', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {
        message: 'hi',
      }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(404);
  });

  it('400 on empty body', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue({
      id: VALID_UUID,
      mode: 'general',
      projectId: null,
      messages: [],
      title: 'x',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {}) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('streams text/plain on success and emits the U+001E trailer with session_id', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue({
      id: VALID_UUID,
      mode: 'general',
      projectId: null,
      messages: [],
      title: 'x',
    });
    coachRepoMocks.appendMessages.mockResolvedValue({ id: VALID_UUID });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {
        message: 'hi',
      }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(res.headers.get('x-coach-session-id')).toBe(VALID_UUID);
    const body = await drain(res);
    expect(body).toContain('assistant reply');
    expect(body).toContain(String.fromCharCode(0x1e));
    const trailerStart = body.indexOf(String.fromCharCode(0x1e));
    const trailerJson = body.slice(trailerStart + 1).trim();
    const parsed = JSON.parse(trailerJson);
    expect(parsed.session_id).toBe(VALID_UUID);
  });

  it('appends the user message immediately on POST', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue({
      id: VALID_UUID,
      mode: 'general',
      projectId: null,
      messages: [],
      title: 'x',
    });
    coachRepoMocks.appendMessages.mockResolvedValue({ id: VALID_UUID });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {
        message: 'hi',
      }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    await drain(res);
    expect(coachRepoMocks.appendMessages).toHaveBeenCalled();
    const firstAppend = coachRepoMocks.appendMessages.mock.calls[0];
    expect(firstAppend[2][0].role).toBe('user');
    expect(firstAppend[2][0].content).toBe('hi');
  });

  it('builds the per-mode context once per turn', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue({
      id: VALID_UUID,
      mode: 'build_planner',
      projectId: VALID_UUID,
      messages: [],
      title: 'x',
    });
    coachRepoMocks.appendMessages.mockResolvedValue({ id: VALID_UUID });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {
        message: 'plan',
      }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    await drain(res);
    expect(contextMocks.buildCoachContext).toHaveBeenCalledTimes(1);
    expect(contextMocks.buildCoachContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        mode: 'build_planner',
        projectId: VALID_UUID,
      }),
    );
  });

  it('400 when context build throws (e.g. unowned project)', async () => {
    authed();
    coachRepoMocks.getSession.mockResolvedValue({
      id: VALID_UUID,
      mode: 'procurement_advisor',
      projectId: null,
      messages: [],
      title: 'x',
    });
    coachRepoMocks.appendMessages.mockResolvedValue({ id: VALID_UUID });
    contextMocks.buildCoachContext.mockRejectedValue(
      new Error('procurement_advisor requires a projectId'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/sessions/[sessionId]/messages/route'
    );
    const res = await POST(
      jsonReq(`http://t/coach/sessions/${VALID_UUID}/messages`, 'POST', {
        message: 'hi',
      }) as any,
      paramsFor({ sessionId: VALID_UUID }) as any,
    );
    expect(res.status).toBe(400);
  });
});

// ═════════ POST /quick ════════════════════════════════════════════════════

describe('POST /coach/quick', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/quick', 'POST', { mode: 'general', message: 'hi' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('503 coach_not_configured when key missing', async () => {
    authed();
    anthropicMocks.isCoachConfigured.mockReturnValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/quick', 'POST', { mode: 'general', message: 'hi' }) as any,
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('coach_not_configured');
  });

  it('400 on missing mode', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/quick', 'POST', { message: 'hi' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('400 on missing message', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/quick', 'POST', { mode: 'general' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('streams text/plain on success', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/quick', 'POST', {
        mode: 'general',
        message: 'hi',
      }) as any,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    const body = await drain(res);
    expect(body).toContain('assistant reply');
    expect(body).toContain(String.fromCharCode(0x1e));
  });

  it('does NOT audit (one-shot, no persistence)', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/coach/quick/route'
    );
    const res = await POST(
      jsonReq('http://t/coach/quick', 'POST', {
        mode: 'general',
        message: 'hi',
      }) as any,
    );
    await drain(res);
    expect(repoMocks.recordAudit).not.toHaveBeenCalled();
  });
});
