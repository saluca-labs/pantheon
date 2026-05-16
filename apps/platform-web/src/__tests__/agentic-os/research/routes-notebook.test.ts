/**
 * Research OS Phase 2 — route handler tests for the notebook surface.
 *
 * Covers all three routes:
 *   - experiments/[id]/notebook (GET, POST)
 *   - notebook/[entryId] (GET, PATCH, DELETE)
 *   - notebook/[entryId]/restore (POST)
 *
 * Locked behaviours:
 *   - 401 when unauthenticated on every verb.
 *   - 404 when the experiment / entry does not belong to this user
 *     (cross-ownership; repo returns null / owned-probe false).
 *   - 400 on invalid Zod body, invalid filter, invalid entry_kind enum,
 *     out-of-range pagination.
 *   - 201 / 200 happy paths against mocked repo + audit.
 *   - DELETE soft-archives (no hard-delete path).
 *   - Restore returns 400 when entry is already active.
 *   - Audit rows fire with the exact action names + projectId = experimentId.
 *
 * Repo + session mocked at module level.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentResearchUser = vi.fn();
const recordAudit = vi.fn();

vi.mock('@/lib/agentic-os/research/session', () => ({
  getCurrentResearchUser: (...args: unknown[]) => getCurrentResearchUser(...args),
  getResearchPool: () => ({ query: vi.fn() }),
}));

vi.mock('@/lib/agentic-os/research/repo', () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

const repoMocks = {
  isExperimentOwnedByUser: vi.fn(),
  listNotebookEntriesForExperiment: vi.fn(),
  getNotebookEntry: vi.fn(),
  createNotebookEntry: vi.fn(),
  updateNotebookEntry: vi.fn(),
  archiveNotebookEntry: vi.fn(),
  restoreNotebookEntry: vi.fn(),
};

vi.mock('@/lib/agentic-os/research/notebook-entries-repo', () => repoMocks);

beforeEach(() => {
  getCurrentResearchUser.mockReset();
  recordAudit.mockReset();
  recordAudit.mockResolvedValue(undefined);
  for (const m of Object.values(repoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authedUser() {
  getCurrentResearchUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ne-1',
    userId: 'u-1',
    experimentId: 'exp-1',
    entryKind: 'note',
    title: 'Test',
    bodyMd: '',
    attachedUrls: [],
    tags: [],
    entryAt: '2026-05-12T10:00:00.000Z',
    archivedAt: null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

const URL_COLL = 'http://t/api/tiresias/agentic-os/research/experiments/exp-1/notebook';
const URL_ENTRY = 'http://t/api/tiresias/agentic-os/research/notebook/ne-1';
const URL_RESTORE = `${URL_ENTRY}/restore`;

// Helper to wrap params (Next.js 15 — params is a Promise).
function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

// ─── experiments/[id]/notebook GET ────────────────────────────────────────

describe('GET /api/tiresias/.../experiments/[id]/notebook', () => {
  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await GET(new Request(URL_COLL) as never, params({ id: 'exp-1' }));
    expect(res.status).toBe(401);
  });

  it('404 when experiment not owned by user', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(false);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await GET(new Request(URL_COLL) as never, params({ id: 'exp-1' }));
    expect(res.status).toBe(404);
    expect(repoMocks.listNotebookEntriesForExperiment).not.toHaveBeenCalled();
  });

  it('200 with the listed entries on happy path', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.listNotebookEntriesForExperiment.mockResolvedValue([entry()]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await GET(new Request(URL_COLL) as never, params({ id: 'exp-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('ne-1');
  });

  it('rejects unknown entry_kind filter with 400', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await GET(
      new Request(`${URL_COLL}?entry_kind=idea`) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
    expect(repoMocks.listNotebookEntriesForExperiment).not.toHaveBeenCalled();
  });

  it('rejects too-large limit with 400', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await GET(
      new Request(`${URL_COLL}?limit=99999`) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects negative offset with 400', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await GET(
      new Request(`${URL_COLL}?offset=-5`) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('honors archived=true filter', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.listNotebookEntriesForExperiment.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    await GET(
      new Request(`${URL_COLL}?archived=true`) as never,
      params({ id: 'exp-1' }),
    );
    const callArgs = repoMocks.listNotebookEntriesForExperiment.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ archived: true });
  });

  it('default archived behaviour hides archived (passes false to repo)', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.listNotebookEntriesForExperiment.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    await GET(new Request(URL_COLL) as never, params({ id: 'exp-1' }));
    const callArgs = repoMocks.listNotebookEntriesForExperiment.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ archived: false });
  });

  it('honors tag filter pass-through', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.listNotebookEntriesForExperiment.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    await GET(
      new Request(`${URL_COLL}?tag=enzyme`) as never,
      params({ id: 'exp-1' }),
    );
    const callArgs = repoMocks.listNotebookEntriesForExperiment.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ tag: 'enzyme' });
  });

  it('honors entry_kind filter pass-through (each of the 6 kinds)', async () => {
    for (const k of ['note', 'observation', 'result', 'decision', 'question', 'todo']) {
      authedUser();
      repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
      repoMocks.listNotebookEntriesForExperiment.mockReset();
      repoMocks.listNotebookEntriesForExperiment.mockResolvedValue([]);
      const { GET } = await import(
        '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
      );
      const res = await GET(
        new Request(`${URL_COLL}?entry_kind=${k}`) as never,
        params({ id: 'exp-1' }),
      );
      expect(res.status).toBe(200);
      const callArgs = repoMocks.listNotebookEntriesForExperiment.mock.calls[0];
      expect(callArgs[2]).toMatchObject({ entryKind: k });
    }
  });

  it('combines entry_kind + tag filters', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.listNotebookEntriesForExperiment.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    await GET(
      new Request(`${URL_COLL}?entry_kind=todo&tag=urgent`) as never,
      params({ id: 'exp-1' }),
    );
    const callArgs = repoMocks.listNotebookEntriesForExperiment.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ entryKind: 'todo', tag: 'urgent' });
  });
});

// ─── experiments/[id]/notebook POST ───────────────────────────────────────

describe('POST /api/tiresias/.../experiments/[id]/notebook', () => {
  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', { title: 'Hi' }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(401);
  });

  it('404 when experiment not owned', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', { title: 'Hi' }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(404);
    expect(repoMocks.createNotebookEntry).not.toHaveBeenCalled();
  });

  it('400 on empty body', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', {}) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on invalid entry_kind enum (CHECK guard via Zod)', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', { title: 'Hi', entry_kind: 'idea' }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on non-URL in attached_urls', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', {
        title: 'Hi',
        attached_urls: ['not-a-url'],
      }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when title is empty', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', { title: '' }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on too-many tags', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const tags = Array.from({ length: 25 }, (_, i) => `t-${i}`);
    const res = await POST(
      jsonReq(URL_COLL, 'POST', { title: 'Hi', tags }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('201 on happy path with created entry', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.createNotebookEntry.mockResolvedValue(entry({ id: 'ne-new' }));
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', { title: 'Hi', body_md: 'body' }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry.id).toBe('ne-new');
  });

  it('audits research.notebook.created with projectId = experimentId', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.createNotebookEntry.mockResolvedValue(entry({ id: 'ne-new' }));
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    await POST(
      jsonReq(URL_COLL, 'POST', { title: 'Hi' }) as never,
      params({ id: 'exp-1' }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.notebook.created',
        projectId: 'exp-1',
        payload: expect.objectContaining({
          entryId: 'ne-new',
          experimentId: 'exp-1',
        }),
      }),
    );
  });

  it('passes entry_at through to the repo (backfill case)', async () => {
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.createNotebookEntry.mockResolvedValue(entry({ id: 'ne-new' }));
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    await POST(
      jsonReq(URL_COLL, 'POST', {
        title: 'Hi',
        entry_at: '2024-06-01T10:00:00.000Z',
      }) as never,
      params({ id: 'exp-1' }),
    );
    const callArgs = repoMocks.createNotebookEntry.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ entryAt: '2024-06-01T10:00:00.000Z' });
  });

  it('accepts every valid entry_kind enum value', async () => {
    for (const k of ['note', 'observation', 'result', 'decision', 'question', 'todo']) {
      authedUser();
      repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
      repoMocks.createNotebookEntry.mockReset();
      recordAudit.mockReset();
      repoMocks.createNotebookEntry.mockResolvedValue(entry({ id: `ne-${k}`, entryKind: k as never }));
      const { POST } = await import(
        '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
      );
      const res = await POST(
        jsonReq(URL_COLL, 'POST', { title: 'Hi', entry_kind: k }) as never,
        params({ id: 'exp-1' }),
      );
      expect(res.status).toBe(201);
    }
  });
});

// ─── notebook/[entryId] GET ────────────────────────────────────────────────

describe('GET /api/tiresias/.../notebook/[entryId]', () => {
  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await GET(new Request(URL_ENTRY) as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(401);
  });

  it('404 when entry not owned (cross-tenant)', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await GET(new Request(URL_ENTRY) as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(404);
  });

  it('200 with the entry on hit', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry({ title: 'Found' }));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await GET(new Request(URL_ENTRY) as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.title).toBe('Found');
  });
});

// ─── notebook/[entryId] PATCH ──────────────────────────────────────────────

describe('PATCH /api/tiresias/.../notebook/[entryId]', () => {
  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq(URL_ENTRY, 'PATCH', { title: 'X' }) as never,
      params({ entryId: 'ne-1' }),
    );
    expect(res.status).toBe(401);
  });

  it('404 when entry not owned', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq(URL_ENTRY, 'PATCH', { title: 'X' }) as never,
      params({ entryId: 'ne-1' }),
    );
    expect(res.status).toBe(404);
    expect(repoMocks.updateNotebookEntry).not.toHaveBeenCalled();
  });

  it('400 on invalid body (unknown entry_kind)', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq(URL_ENTRY, 'PATCH', { entry_kind: 'idea' }) as never,
      params({ entryId: 'ne-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('200 + audit on happy patch', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    repoMocks.updateNotebookEntry.mockResolvedValue(entry({ title: 'New' }));
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq(URL_ENTRY, 'PATCH', { title: 'New' }) as never,
      params({ entryId: 'ne-1' }),
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.notebook.updated',
        projectId: 'exp-1',
      }),
    );
  });

  it('allows updating entry_at (backfill)', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    repoMocks.updateNotebookEntry.mockResolvedValue(
      entry({ entryAt: '2024-01-01T00:00:00.000Z' }),
    );
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq(URL_ENTRY, 'PATCH', { entry_at: '2024-01-01T00:00:00.000Z' }) as never,
      params({ entryId: 'ne-1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.entryAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('400 on bad entry_at format', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await PATCH(
      jsonReq(URL_ENTRY, 'PATCH', { entry_at: 'not-a-date' }) as never,
      params({ entryId: 'ne-1' }),
    );
    expect(res.status).toBe(400);
  });

  it('audit payload includes the patched field names', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    repoMocks.updateNotebookEntry.mockResolvedValue(entry({ title: 'New', tags: ['x'] }));
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    await PATCH(
      jsonReq(URL_ENTRY, 'PATCH', { title: 'New', tags: ['x'] }) as never,
      params({ entryId: 'ne-1' }),
    );
    const call = recordAudit.mock.calls[0][0];
    expect(call.payload.fields).toEqual(expect.arrayContaining(['title', 'tags']));
  });
});

// ─── notebook/[entryId] DELETE ────────────────────────────────────────────

describe('DELETE /api/tiresias/.../notebook/[entryId]', () => {
  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await DELETE(new Request(URL_ENTRY, { method: 'DELETE' }) as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(401);
  });

  it('404 when not owned', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await DELETE(new Request(URL_ENTRY, { method: 'DELETE' }) as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(404);
    expect(repoMocks.archiveNotebookEntry).not.toHaveBeenCalled();
  });

  it('soft-archives (calls archive, not delete)', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    repoMocks.archiveNotebookEntry.mockResolvedValue(
      entry({ archivedAt: '2026-05-12T11:00:00.000Z' }),
    );
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    const res = await DELETE(new Request(URL_ENTRY, { method: 'DELETE' }) as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(200);
    expect(repoMocks.archiveNotebookEntry).toHaveBeenCalledWith('ne-1', 'u-1');
    const body = await res.json();
    expect(body.entry.archivedAt).toBeTruthy();
  });

  it('audits research.notebook.archived', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    repoMocks.archiveNotebookEntry.mockResolvedValue(entry({ archivedAt: '2026-05-12T11:00:00.000Z' }));
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    await DELETE(new Request(URL_ENTRY, { method: 'DELETE' }) as never, params({ entryId: 'ne-1' }));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.notebook.archived',
        projectId: 'exp-1',
      }),
    );
  });

  it('does NOT support ?hard=true (no hard delete path)', async () => {
    authedUser();
    repoMocks.getNotebookEntry.mockResolvedValue(entry());
    repoMocks.archiveNotebookEntry.mockResolvedValue(
      entry({ archivedAt: '2026-05-12T11:00:00.000Z' }),
    );
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/route'
    );
    // Even with ?hard=true the route still soft-archives.
    const res = await DELETE(
      new Request(`${URL_ENTRY}?hard=true`, { method: 'DELETE' }) as never,
      params({ entryId: 'ne-1' }),
    );
    expect(res.status).toBe(200);
    expect(repoMocks.archiveNotebookEntry).toHaveBeenCalled();
  });
});

// ─── notebook/[entryId]/restore POST ──────────────────────────────────────

describe('POST /api/tiresias/.../notebook/[entryId]/restore', () => {
  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/restore/route'
    );
    const res = await POST(jsonReq(URL_RESTORE, 'POST') as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(401);
  });

  it('404 when entry not found / not owned', async () => {
    authedUser();
    repoMocks.restoreNotebookEntry.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/restore/route'
    );
    const res = await POST(jsonReq(URL_RESTORE, 'POST') as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(404);
  });

  it('400 when entry is already active (not archived)', async () => {
    authedUser();
    repoMocks.restoreNotebookEntry.mockResolvedValue({
      entry: entry({ archivedAt: null }),
      alreadyActive: true,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/restore/route'
    );
    const res = await POST(jsonReq(URL_RESTORE, 'POST') as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(400);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('200 + audit on restore', async () => {
    authedUser();
    repoMocks.restoreNotebookEntry.mockResolvedValue({
      entry: entry({ archivedAt: null }),
      alreadyActive: false,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/restore/route'
    );
    const res = await POST(jsonReq(URL_RESTORE, 'POST') as never, params({ entryId: 'ne-1' }));
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.notebook.restored',
        projectId: 'exp-1',
      }),
    );
  });

  it('audit projectId = experimentId on the restored entry', async () => {
    authedUser();
    repoMocks.restoreNotebookEntry.mockResolvedValue({
      entry: entry({ experimentId: 'exp-other', archivedAt: null }),
      alreadyActive: false,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/notebook/[entryId]/restore/route'
    );
    await POST(jsonReq(URL_RESTORE, 'POST') as never, params({ entryId: 'ne-1' }));
    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      projectId: 'exp-other',
    });
  });
});

// ─── XSS / raw-HTML escape vector ─────────────────────────────────────────

describe('body_md raw-HTML escape vector', () => {
  it('accepts <script> as body content — no upfront sanitation here', async () => {
    // The CREATE route trusts react-markdown (no rehype-raw) on the
    // render side to neutralize raw HTML. We don't strip it at the API
    // boundary, but we DO confirm the route accepts the body without
    // rejecting it — the test below is a counterpart of the render-
    // layer test (react-markdown escapes <script> by default).
    authedUser();
    repoMocks.isExperimentOwnedByUser.mockResolvedValue(true);
    repoMocks.createNotebookEntry.mockResolvedValue(
      entry({
        id: 'ne-x',
        bodyMd: '<script>alert("xss")</script>',
      }),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/notebook/route'
    );
    const res = await POST(
      jsonReq(URL_COLL, 'POST', {
        title: 'XSS attempt',
        body_md: '<script>alert("xss")</script>',
      }) as never,
      params({ id: 'exp-1' }),
    );
    expect(res.status).toBe(201);
    // The entry is stored verbatim; the render layer (react-markdown
    // without rehype-raw) escapes it as text.
    const body = await res.json();
    expect(body.entry.bodyMd).toContain('<script>');
  });
});
