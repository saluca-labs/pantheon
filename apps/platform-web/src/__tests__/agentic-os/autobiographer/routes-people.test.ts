/**
 * Autobiographer OS — people route handler tests.
 *
 * Covers 401, 200/201, 400 on bad body, 404 on cross-ownership, 409 on
 * duplicate canonical_name, and audit invocation across POST/PATCH/DELETE
 * plus the /consent convenience route.
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

const peopleRepoMocks = {
  listPeople: vi.fn(),
  getPerson: vi.fn(),
  getPersonWithCounts: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  recordConsent: vi.fn(),
  deletePerson: vi.fn(),
};

vi.mock('@/lib/agentic-os/autobiographer/people-repo', () => peopleRepoMocks);

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
  for (const m of Object.values(peopleRepoMocks)) (m as any).mockReset();
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

// ─── GET /people ─────────────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/people', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('returns 200 + people array when authenticated', async () => {
    authedUser();
    peopleRepoMocks.listPeople.mockResolvedValue([
      { id: 'p-1', canonicalName: 'Maria' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.people).toHaveLength(1);
  });

  it('passes ?consent_to_publish= filter through', async () => {
    authedUser();
    peopleRepoMocks.listPeople.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    await GET(
      jsonReq('http://t/x?consent_to_publish=pending', 'GET') as any,
    );
    expect(peopleRepoMocks.listPeople).toHaveBeenCalledWith(
      expect.objectContaining({ consentToPublish: 'pending' }),
    );
  });

  it('returns 400 on invalid ?consent_to_publish=', async () => {
    authedUser();
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    const res = await GET(
      jsonReq('http://t/x?consent_to_publish=nope', 'GET') as any,
    );
    expect(res.status).toBe(400);
  });

  it('passes ?relation= + ?q= filters through', async () => {
    authedUser();
    peopleRepoMocks.listPeople.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    await GET(
      jsonReq(
        'http://t/x?relation=mother&q=maria',
        'GET',
      ) as any,
    );
    expect(peopleRepoMocks.listPeople).toHaveBeenCalledWith(
      expect.objectContaining({ relation: 'mother', q: 'maria' }),
    );
  });
});

// ─── POST /people ────────────────────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/people', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { canonicalName: 'Maria' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when canonicalName is missing', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(400);
  });

  it('returns 201 on success and records an audit', async () => {
    authedUser();
    peopleRepoMocks.createPerson.mockResolvedValue({
      id: 'p-1',
      canonicalName: 'Maria',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { canonicalName: 'Maria' }) as any,
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        action: 'autobiographer.person.created',
        projectId: 'p-1',
      }),
    );
  });

  it('returns 409 when the repo throws duplicate_name', async () => {
    authedUser();
    const dup: any = new Error('duplicate_name');
    dup.code = 'duplicate_name';
    peopleRepoMocks.createPerson.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { canonicalName: 'Maria' }) as any,
    );
    expect(res.status).toBe(409);
  });
});

// ─── GET /people/[id] ────────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/people/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the person does not belong to caller', async () => {
    authedUser();
    peopleRepoMocks.getPersonWithCounts.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'p-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with the joined memory count', async () => {
    authedUser();
    peopleRepoMocks.getPersonWithCounts.mockResolvedValue({
      id: 'p-1',
      memoryCount: 3,
    });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person.memoryCount).toBe(3);
  });
});

// ─── PATCH /people/[id] ──────────────────────────────────────────────────────

describe('PATCH /api/tiresias/agentic-os/autobiographer/people/[id]', () => {
  it('returns 400 on invalid consent_to_publish', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { consentToPublish: 'nope' }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing matches', async () => {
    authedUser();
    peopleRepoMocks.updatePerson.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { canonicalName: 'X' }) as any,
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 on duplicate_name rename collision', async () => {
    authedUser();
    const dup: any = new Error('duplicate_name');
    dup.code = 'duplicate_name';
    peopleRepoMocks.updatePerson.mockRejectedValue(dup);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        canonicalName: 'CollidesWithSibling',
      }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('returns 200 and audits autobiographer.person.updated', async () => {
    authedUser();
    peopleRepoMocks.updatePerson.mockResolvedValue({
      id: 'p-1',
      canonicalName: 'Renamed',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { canonicalName: 'Renamed' }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.person.updated',
        projectId: 'p-1',
      }),
    );
  });
});

// ─── DELETE /people/[id] ─────────────────────────────────────────────────────

describe('DELETE /api/tiresias/agentic-os/autobiographer/people/[id]', () => {
  it('returns 404 when person is missing or foreign', async () => {
    authedUser();
    peopleRepoMocks.getPerson.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'p-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('audits deletion with the prior canonical_name + consent state', async () => {
    authedUser();
    peopleRepoMocks.getPerson.mockResolvedValue({
      id: 'p-1',
      canonicalName: 'Maria',
      consentToPublish: 'pending',
    });
    peopleRepoMocks.deletePerson.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.person.deleted',
        projectId: 'p-1',
        payload: expect.objectContaining({
          canonicalName: 'Maria',
          consentToPublish: 'pending',
        }),
      }),
    );
  });
});

// ─── POST /people/[id]/consent ───────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/people/[id]/consent', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/consent/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { state: 'granted' }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when state is missing or invalid', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/consent/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { state: 'nope' }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the person does not exist for caller', async () => {
    authedUser();
    peopleRepoMocks.recordConsent.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/consent/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { state: 'granted' }) as any,
      { params: Promise.resolve({ id: 'p-other' }) },
    );
    expect(res.status).toBe(404);
  });

  it('flips state + audits consent_recorded with payload', async () => {
    authedUser();
    peopleRepoMocks.recordConsent.mockResolvedValue({
      id: 'p-1',
      consentToPublish: 'granted',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/consent/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        state: 'granted',
        recordedBy: 'verbal, 2026-04-12',
      }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(peopleRepoMocks.recordConsent).toHaveBeenCalledWith(
      'p-1',
      'u-1',
      'granted',
      'verbal, 2026-04-12',
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.person.consent_recorded',
        projectId: 'p-1',
        payload: expect.objectContaining({
          state: 'granted',
          recordedBy: 'verbal, 2026-04-12',
        }),
      }),
    );
  });

  it('defaults recordedBy to null when omitted', async () => {
    authedUser();
    peopleRepoMocks.recordConsent.mockResolvedValue({
      id: 'p-1',
      consentToPublish: 'withheld',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/people/[id]/consent/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { state: 'withheld' }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(peopleRepoMocks.recordConsent).toHaveBeenCalledWith(
      'p-1',
      'u-1',
      'withheld',
      null,
    );
  });
});
