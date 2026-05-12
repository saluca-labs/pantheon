/**
 * Autobiographer OS — themes route handler tests.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentAutobiographerUser = vi.fn();
vi.mock('@/lib/agentic-os/autobiographer/session', () => ({
  getCurrentAutobiographerUser: (...args: any[]) =>
    getCurrentAutobiographerUser(...args),
  getAutobiographerPool: () => ({ query: vi.fn() }),
}));

const themesRepoMocks = {
  listThemes: vi.fn(),
  createTheme: vi.fn(),
  getTheme: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
  getThemesByIds: vi.fn(),
};
vi.mock(
  '@/lib/agentic-os/autobiographer/themes-repo',
  () => themesRepoMocks,
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
  for (const m of Object.values(themesRepoMocks)) (m as any).mockReset();
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

describe('GET /themes', () => {
  it('401 when unauthenticated', async () => {
    getCurrentAutobiographerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any);
    expect(res.status).toBe(401);
  });

  it('200 + themes list, passes search param', async () => {
    authedUser();
    themesRepoMocks.listThemes.mockResolvedValue([{ id: 't-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/route'
    );
    const res = await GET(jsonReq('http://t/x?q=loss&limit=50', 'GET') as any);
    expect(res.status).toBe(200);
    expect(themesRepoMocks.listThemes).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', search: 'loss', limit: 50 }),
    );
  });
});

describe('POST /themes', () => {
  it('400 on invalid body', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(400);
  });

  it('400 on extra (unknown) field — Zod .strict()', async () => {
    authedUser();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        name: 'Loss',
        sensitivity: 'public', // Phase 6 — rejected today
      }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('409 when repo throws duplicate', async () => {
    authedUser();
    const dup: any = new Error('duplicate');
    dup.code = 'duplicate';
    themesRepoMocks.createTheme.mockRejectedValue(dup);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { name: 'Loss' }) as any,
    );
    expect(res.status).toBe(409);
  });

  it('201 + audits theme.created with projectId null (workshop-global)', async () => {
    authedUser();
    themesRepoMocks.createTheme.mockResolvedValue({
      id: 't-1',
      slug: 'loss',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { name: 'Loss', color: 'rose' }) as any,
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.theme.created',
        projectId: null,
      }),
    );
  });
});

describe('GET / PATCH / DELETE /themes/[id]', () => {
  it('GET 404 when missing', async () => {
    authedUser();
    themesRepoMocks.getTheme.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/[id]/route'
    );
    const res = await GET(jsonReq('http://t/x', 'GET') as any, {
      params: Promise.resolve({ id: 't-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH 400 on unknown field (Zod .strict)', async () => {
    authedUser();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { sensitivity: 'public' }) as any,
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('PATCH 409 on duplicate slug', async () => {
    authedUser();
    const dup: any = new Error('duplicate');
    dup.code = 'duplicate';
    themesRepoMocks.updateTheme.mockRejectedValue(dup);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { slug: 'taken' }) as any,
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('PATCH 200 + audit', async () => {
    authedUser();
    themesRepoMocks.updateTheme.mockResolvedValue({ id: 't-1', slug: 'loss' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { name: 'New' }) as any,
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.theme.updated',
      }),
    );
  });

  it('DELETE 404 when missing', async () => {
    authedUser();
    themesRepoMocks.deleteTheme.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 't-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE 200 + audits theme.deleted', async () => {
    authedUser();
    themesRepoMocks.deleteTheme.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/autobiographer/themes/[id]/route'
    );
    const res = await DELETE(jsonReq('http://t/x', 'DELETE') as any, {
      params: Promise.resolve({ id: 't-1' }),
    });
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'autobiographer.theme.deleted',
      }),
    );
  });
});
