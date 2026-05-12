/**
 * Autobiographer OS — voice-samples route handler tests.
 *
 * Covers the 401 / 200 / 201 / 400 / 404 matrix across GET/POST/PATCH/
 * DELETE, the cross-ownership no-existence-leak property on memory-
 * backed creation, and audit invocation per verb (including the
 * archive vs unarchive action split).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentAutobiographerUser = vi.fn();

vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: any[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listVoiceSamples: vi.fn(),
  getVoiceSample: vi.fn(),
  getVoiceSampleByMemory: vi.fn(),
  createVoiceSample: vi.fn(),
  updateVoiceSample: vi.fn(),
  deleteVoiceSample: vi.fn(),
  listSamplesForBuilder: vi.fn(),
};

vi.mock(
  '@/lib/agentic-os/autobiographer/voice-samples-repo',
  () => repoMocks,
);

const memoriesRepoMocks = {
  getMemory: vi.fn(),
  listMemories: vi.fn(),
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
};

vi.mock(
  '@/lib/agentic-os/autobiographer/memories-repo',
  () => memoriesRepoMocks,
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
  for (const m of Object.values(repoMocks)) (m as any).mockReset();
  for (const m of Object.values(memoriesRepoMocks)) (m as any).mockReset();
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

// ─── GET /voice-samples ──────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/voice-samples', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('returns 200 + samples array when authenticated', async () => {
    authedUser();
    repoMocks.listVoiceSamples.mockResolvedValue([{ id: 's-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.samples).toHaveLength(1);
  });

  it('passes ?is_archived= boolean through', async () => {
    authedUser();
    repoMocks.listVoiceSamples.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    await GET(jsonReq('http://t/x?is_archived=true', 'GET') as any);
    expect(repoMocks.listVoiceSamples).toHaveBeenCalledWith(
      expect.objectContaining({ isArchived: true }),
    );
  });

  it('passes ?memory_backed=false boolean through', async () => {
    authedUser();
    repoMocks.listVoiceSamples.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    await GET(jsonReq('http://t/x?memory_backed=false', 'GET') as any);
    expect(repoMocks.listVoiceSamples).toHaveBeenCalledWith(
      expect.objectContaining({ memoryBacked: false }),
    );
  });

  it('passes ?q= search through', async () => {
    authedUser();
    repoMocks.listVoiceSamples.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    await GET(jsonReq('http://t/x?q=tuesday', 'GET') as any);
    expect(repoMocks.listVoiceSamples).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'tuesday' }),
    );
  });
});

// ─── POST /voice-samples ─────────────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/voice-samples', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { bodyText: 'b' }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when bodyText is missing', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when bodyText is empty', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { bodyText: '' }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('returns 201 on success and records autobiographer.voice_sample.created audit', async () => {
    authedUser();
    repoMocks.createVoiceSample.mockResolvedValue({
      id: 's-1',
      memoryId: null,
      wordCount: 7,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        bodyText: 'a sample of my prose',
      }) as any,
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        action: 'autobiographer.voice_sample.created',
        projectId: null,
      }),
    );
  });

  it('returns 404 when memoryId points at a foreign memory (no-existence-leak)', async () => {
    authedUser();
    memoriesRepoMocks.getMemory.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        memoryId: '11111111-1111-1111-1111-111111111111',
        bodyText: 'body',
      }) as any,
    );
    expect(res.status).toBe(404);
    expect(repoMocks.createVoiceSample).not.toHaveBeenCalled();
  });

  it('creates the sample when memoryId is owned by caller', async () => {
    authedUser();
    memoriesRepoMocks.getMemory.mockResolvedValue({ id: 'm-1', userId: 'u-1' });
    repoMocks.createVoiceSample.mockResolvedValue({
      id: 's-1',
      memoryId: 'm-1',
      wordCount: 5,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        memoryId: '11111111-1111-1111-1111-111111111111',
        bodyText: 'five words right over here',
      }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.createVoiceSample).toHaveBeenCalled();
  });
});

// ─── GET /voice-samples/[id] ─────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/voice-samples/[id]', () => {
  it('returns 404 when not owned by caller', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 's-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with the sample', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue({ id: 's-1', wordCount: 7 });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 's-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sample.wordCount).toBe(7);
  });
});

// ─── PATCH /voice-samples/[id] ───────────────────────────────────────────────

describe('PATCH /api/tiresias/agentic-os/autobiographer/voice-samples/[id]', () => {
  it('returns 404 when not owned by caller', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'New' }) as any,
      { params: Promise.resolve({ id: 's-other' }) },
    );
    expect(res.status).toBe(404);
  });

  it('audits .updated by default when fields are patched', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue({
      id: 's-1',
      isArchived: false,
    });
    repoMocks.updateVoiceSample.mockResolvedValue({ id: 's-1' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { title: 'New' }) as any,
      { params: Promise.resolve({ id: 's-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_sample.updated',
      }),
    );
  });

  it('audits .archived when isArchived flips false→true', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue({
      id: 's-1',
      isArchived: false,
    });
    repoMocks.updateVoiceSample.mockResolvedValue({ id: 's-1' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', { isArchived: true }) as any,
      { params: Promise.resolve({ id: 's-1' }) },
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_sample.archived',
      }),
    );
  });

  it('audits .unarchived when isArchived flips true→false', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue({
      id: 's-1',
      isArchived: true,
    });
    repoMocks.updateVoiceSample.mockResolvedValue({ id: 's-1' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', { isArchived: false }) as any,
      { params: Promise.resolve({ id: 's-1' }) },
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_sample.unarchived',
      }),
    );
  });

  it('does NOT split audit when isArchived is set to the same value', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue({
      id: 's-1',
      isArchived: true,
    });
    repoMocks.updateVoiceSample.mockResolvedValue({ id: 's-1' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    await PATCH(
      jsonReq('http://t/x', 'PATCH', { isArchived: true }) as any,
      { params: Promise.resolve({ id: 's-1' }) },
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_sample.updated',
      }),
    );
  });
});

// ─── DELETE /voice-samples/[id] ──────────────────────────────────────────────

describe('DELETE /api/tiresias/agentic-os/autobiographer/voice-samples/[id]', () => {
  it('returns 404 when the sample is missing or foreign', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 's-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('audits deletion with the prior memoryId + wordCount', async () => {
    authedUser();
    repoMocks.getVoiceSample.mockResolvedValue({
      id: 's-1',
      memoryId: 'm-1',
      wordCount: 7,
    });
    repoMocks.deleteVoiceSample.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-samples/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 's-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_sample.deleted',
        payload: expect.objectContaining({
          memoryId: 'm-1',
          wordCount: 7,
        }),
      }),
    );
  });
});
