/**
 * Autobiographer OS — voice-profiles route handler tests.
 *
 * Covers the 401 / 200 / 201 / 400 / 404 / 503 matrix across
 * GET/POST/PATCH/DELETE plus the /activate convenience route. Builder
 * is mocked at the module level so the routes are exercised
 * deterministically without hitting an LLM.
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

const profileRepoMocks = {
  listVoiceProfiles: vi.fn(),
  getVoiceProfile: vi.fn(),
  getActiveVoiceProfile: vi.fn(),
  insertVoiceProfile: vi.fn(),
  updateVoiceProfile: vi.fn(),
  activateProfile: vi.fn(),
  deactivateProfile: vi.fn(),
  deleteVoiceProfile: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/voice-profiles-repo',
  () => profileRepoMocks,
);

const sampleRepoMocks = {
  listSamplesForBuilder: vi.fn(),
};
vi.mock('@/lib/agentic-os/autobiographer/voice-samples-repo', () => ({
  ...sampleRepoMocks,
  listVoiceSamples: vi.fn(),
  getVoiceSample: vi.fn(),
  getVoiceSampleByMemory: vi.fn(),
  createVoiceSample: vi.fn(),
  updateVoiceSample: vi.fn(),
  deleteVoiceSample: vi.fn(),
}));

const buildVoiceProfile = vi.fn();
class FakeVoiceBuilderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'VoiceBuilderError';
  }
}
vi.mock('@/lib/agentic-os/autobiographer/voice/builder', () => ({
  buildVoiceProfile: (...args: any[]) => buildVoiceProfile(...args),
  VoiceBuilderError: FakeVoiceBuilderError,
}));

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
  buildVoiceProfile.mockReset();
  for (const m of Object.values(profileRepoMocks)) (m as any).mockReset();
  sampleRepoMocks.listSamplesForBuilder.mockReset();
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

// ─── GET /voice-profiles ─────────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/voice-profiles', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('returns 200 with profile list', async () => {
    authedUser();
    profileRepoMocks.listVoiceProfiles.mockResolvedValue([
      { id: 'pr-1', version: 1 },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles).toHaveLength(1);
  });

  it('passes ?is_active=true filter through', async () => {
    authedUser();
    profileRepoMocks.listVoiceProfiles.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    await GET(jsonReq('http://t/x?is_active=true', 'GET') as any);
    expect(profileRepoMocks.listVoiceProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
  });
});

// ─── POST /voice-profiles (build) ────────────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/voice-profiles', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no active samples exist', async () => {
    authedUser();
    sampleRepoMocks.listSamplesForBuilder.mockResolvedValue([]);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('no_samples');
    expect(buildVoiceProfile).not.toHaveBeenCalled();
  });

  it('returns 503 with coach_not_configured when builder throws that code', async () => {
    authedUser();
    sampleRepoMocks.listSamplesForBuilder.mockResolvedValue([
      { id: 's-1', title: null, bodyText: 'body', wordCount: 5, memoryId: null },
    ]);
    buildVoiceProfile.mockRejectedValue(
      new FakeVoiceBuilderError('coach_not_configured', 'not set'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('coach_not_configured');
  });

  it('returns 201 + audits .built on success', async () => {
    authedUser();
    sampleRepoMocks.listSamplesForBuilder.mockResolvedValue([
      { id: 's-1', title: null, bodyText: 'body', wordCount: 100, memoryId: null },
      { id: 's-2', title: null, bodyText: 'body 2', wordCount: 50, memoryId: null },
    ]);
    buildVoiceProfile.mockResolvedValue({
      styleSummary: 'summary',
      styleAdjectives: ['warm'],
      styleRules: ['Use short sentences'],
      exampleOpenings: ['Once,'],
      sampleCount: 2,
      sampleWordCount: 150,
      builder: 'coach',
    });
    profileRepoMocks.insertVoiceProfile.mockResolvedValue({
      id: 'pr-1',
      version: 1,
      isActive: false,
      sampleCount: 2,
      sampleWordCount: 150,
    });

    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(201);
    expect(profileRepoMocks.insertVoiceProfile).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        sampleCount: 2,
        sampleWordCount: 150,
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_profile.built',
      }),
    );
  });

  it('forwards builder + setActive overrides into insertVoiceProfile', async () => {
    authedUser();
    sampleRepoMocks.listSamplesForBuilder.mockResolvedValue([
      { id: 's-1', title: null, bodyText: 'b', wordCount: 5, memoryId: null },
    ]);
    buildVoiceProfile.mockResolvedValue({
      styleSummary: 'summary',
      styleAdjectives: ['warm'],
      styleRules: ['Use short sentences'],
      exampleOpenings: ['Once,'],
      sampleCount: 1,
      sampleWordCount: 5,
      builder: 'coach-session-xyz',
    });
    profileRepoMocks.insertVoiceProfile.mockResolvedValue({
      id: 'pr-1',
      version: 1,
      isActive: true,
    });

    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/route'
    );
    await POST(
      jsonReq('http://t/x', 'POST', {
        builder: 'coach-session-xyz',
        setActive: true,
      }) as any,
    );
    expect(buildVoiceProfile).toHaveBeenCalledWith(
      expect.objectContaining({ builderAttribution: 'coach-session-xyz' }),
    );
    expect(profileRepoMocks.insertVoiceProfile).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ setActive: true }),
    );
  });
});

// ─── GET /voice-profiles/[id] ────────────────────────────────────────────────

describe('GET /api/tiresias/agentic-os/autobiographer/voice-profiles/[id]', () => {
  it('returns 404 when not owned by caller', async () => {
    authedUser();
    profileRepoMocks.getVoiceProfile.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'pr-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with profile', async () => {
    authedUser();
    profileRepoMocks.getVoiceProfile.mockResolvedValue({
      id: 'pr-1',
      version: 3,
    });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 'pr-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.version).toBe(3);
  });
});

// ─── PATCH /voice-profiles/[id] ──────────────────────────────────────────────

describe('PATCH /api/tiresias/agentic-os/autobiographer/voice-profiles/[id]', () => {
  it('returns 400 when bad body shape', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { styleSummary: 'x' }) as any,
      { params: Promise.resolve({ id: 'pr-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing matches', async () => {
    authedUser();
    profileRepoMocks.updateVoiceProfile.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        styleSummary:
          'this is a long enough style summary value to satisfy zod',
      }) as any,
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and audits .updated', async () => {
    authedUser();
    profileRepoMocks.updateVoiceProfile.mockResolvedValue({
      id: 'pr-1',
      version: 1,
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', {
        styleSummary:
          'this is a long enough style summary value to satisfy zod',
      }) as any,
      { params: Promise.resolve({ id: 'pr-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_profile.updated',
      }),
    );
  });
});

// ─── DELETE /voice-profiles/[id] ─────────────────────────────────────────────

describe('DELETE /api/tiresias/agentic-os/autobiographer/voice-profiles/[id]', () => {
  it('returns 404 when missing', async () => {
    authedUser();
    profileRepoMocks.getVoiceProfile.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'pr-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('soft-archives an active profile before hard delete', async () => {
    authedUser();
    profileRepoMocks.getVoiceProfile.mockResolvedValue({
      id: 'pr-1',
      version: 1,
      isActive: true,
    });
    profileRepoMocks.deactivateProfile.mockResolvedValue(true);
    profileRepoMocks.deleteVoiceProfile.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'pr-1' }),
    });
    expect(res.status).toBe(200);
    expect(profileRepoMocks.deactivateProfile).toHaveBeenCalled();
    expect(profileRepoMocks.deleteVoiceProfile).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_profile.deleted',
        payload: expect.objectContaining({ wasActive: true }),
      }),
    );
  });

  it('skips deactivate for an already-inactive profile', async () => {
    authedUser();
    profileRepoMocks.getVoiceProfile.mockResolvedValue({
      id: 'pr-1',
      version: 1,
      isActive: false,
    });
    profileRepoMocks.deleteVoiceProfile.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/route'
    );
    await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 'pr-1' }),
    });
    expect(profileRepoMocks.deactivateProfile).not.toHaveBeenCalled();
  });
});

// ─── POST /voice-profiles/[id]/activate ──────────────────────────────────────

describe('POST /api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/activate', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/activate/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST') as any, {
      params: Promise.resolve({ id: 'pr-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when profile is missing or foreign', async () => {
    authedUser();
    profileRepoMocks.activateProfile.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/activate/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST') as any, {
      params: Promise.resolve({ id: 'pr-other' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 + audits .activated on success', async () => {
    authedUser();
    profileRepoMocks.activateProfile.mockResolvedValue({
      id: 'pr-1',
      version: 2,
      isActive: true,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/activate/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST') as any, {
      params: Promise.resolve({ id: 'pr-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.voice_profile.activated',
        payload: expect.objectContaining({ version: 2 }),
      }),
    );
  });
});
