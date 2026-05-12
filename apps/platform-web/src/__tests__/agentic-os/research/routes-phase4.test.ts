/**
 * Research OS Phase 4 — route handler tests.
 *
 * Covers the full Phase 4 surface:
 *   - papers (GET, POST) + papers/[id] (GET, PATCH, DELETE) + restore
 *   - papers/[id]/authors (GET, POST) + /[authorId] (PATCH, DELETE)
 *   - authors (GET, POST) + authors/[id] (GET, PATCH, DELETE)
 *   - experiments/[id]/references (GET, POST) + /[paperId] (PATCH, DELETE)
 *
 * Repo + session + audit mocked at module level.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentResearchUser = vi.fn();
const recordAudit = vi.fn();

// Papers repo
const papersRepo = {
  listPapers: vi.fn(),
  getPaper: vi.fn(),
  createPaper: vi.fn(),
  updatePaper: vi.fn(),
  archivePaper: vi.fn(),
  restorePaper: vi.fn(),
  countLinkedExperimentsForPaper: vi.fn(),
};
const authorsRepo = {
  listAuthors: vi.fn(),
  getAuthor: vi.fn(),
  createAuthor: vi.fn(),
  updateAuthor: vi.fn(),
  deleteAuthor: vi.fn(),
  countLinkedPapersForAuthor: vi.fn(),
  authorPaperCounts: vi.fn(),
};
const paperAuthorsRepo = {
  isPaperOwnedByUser: vi.fn(),
  isAuthorOwnedByUser: vi.fn(),
  listOrderedAuthorsForPaper: vi.fn(),
  linkExistingAuthor: vi.fn(),
  unlinkAuthor: vi.fn(),
  reorderPaperAuthor: vi.fn(),
};
const referencesRepo = {
  isExperimentOwnedByUser: vi.fn(),
  isPaperOwnedByUser: vi.fn(),
  listReferencesForExperiment: vi.fn(),
  getReferenceByPair: vi.fn(),
  listExperimentsLinkingPaper: vi.fn(),
  createReference: vi.fn(),
  updateReference: vi.fn(),
  deleteReference: vi.fn(),
  listRelatedNotebookEntriesForPaper: vi.fn(),
};

vi.mock('@/lib/agentic-os/research/session', () => ({
  getCurrentResearchUser: (...a: any[]) => getCurrentResearchUser(...a),
  getResearchPool: () => ({ query: vi.fn() }),
}));

vi.mock('@/lib/agentic-os/research/repo', () => ({
  recordAudit: (...a: any[]) => recordAudit(...a),
}));

vi.mock('@/lib/agentic-os/research/papers-repo', () => papersRepo);
vi.mock('@/lib/agentic-os/research/authors-repo', () => authorsRepo);
vi.mock('@/lib/agentic-os/research/paper-authors-repo', () => paperAuthorsRepo);
vi.mock('@/lib/agentic-os/research/experiment-references-repo', () => referencesRepo);

function authed() {
  getCurrentResearchUser.mockResolvedValue({
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

function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

beforeEach(() => {
  getCurrentResearchUser.mockReset();
  recordAudit.mockReset();
  recordAudit.mockResolvedValue(undefined);
  for (const m of Object.values({
    ...papersRepo,
    ...authorsRepo,
    ...paperAuthorsRepo,
    ...referencesRepo,
  })) {
    (m as any).mockReset();
  }
});

function makePaper(o: Record<string, any> = {}) {
  return {
    id: 'p-1',
    userId: 'u-1',
    title: 'A study',
    kind: 'paper',
    doi: null,
    arxivId: null,
    url: null,
    authorsText: null,
    venue: null,
    year: 2024,
    abstractMd: null,
    tags: [],
    metadata: {},
    archivedAt: null,
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...o,
  };
}

function makeAuthor(o: Record<string, any> = {}) {
  return {
    id: 'a-1',
    userId: 'u-1',
    displayName: 'Smith, J.',
    givenName: 'Jane',
    familyName: 'Smith',
    orcid: null,
    affiliation: null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...o,
  };
}

// ─── papers route ─────────────────────────────────────────────────────────

describe('GET /papers', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers';

  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(401);
  });

  it('passes kind/tag/year/q to repo', async () => {
    authed();
    papersRepo.listPapers.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    await GET(new Request(`${URL}?kind=preprint&tag=robotics&year=2024&q=topology`) as any);
    expect(papersRepo.listPapers).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        kind: 'preprint',
        tag: 'robotics',
        year: 2024,
        q: 'topology',
        archived: false,
      }),
    );
  });

  it('400 on invalid kind filter', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    const r = await GET(new Request(`${URL}?kind=bogus`) as any);
    expect(r.status).toBe(400);
  });

  it('400 on out-of-range year', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    const r = await GET(new Request(`${URL}?year=999`) as any);
    expect(r.status).toBe(400);
  });

  it('?archived=true forwards archived=true', async () => {
    authed();
    papersRepo.listPapers.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    await GET(new Request(`${URL}?archived=true`) as any);
    expect(papersRepo.listPapers).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ archived: true }),
    );
  });
});

describe('POST /papers', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers';

  it('400 on invalid body', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    const r = await POST(jsonReq(URL, 'POST', { wrong: true }) as any);
    expect(r.status).toBe(400);
  });

  it('409 on DOI duplicate', async () => {
    authed();
    papersRepo.createPaper.mockResolvedValue({ kind: 'duplicate', field: 'doi' });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    const r = await POST(jsonReq(URL, 'POST', { title: 'T', doi: '10.1/x' }) as any);
    expect(r.status).toBe(409);
  });

  it('409 on arxiv duplicate', async () => {
    authed();
    papersRepo.createPaper.mockResolvedValue({ kind: 'duplicate', field: 'arxiv_id' });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    const r = await POST(jsonReq(URL, 'POST', { title: 'T', arxiv_id: '2401.12345' }) as any);
    expect(r.status).toBe(409);
  });

  it('201 + audit research.paper.created on success', async () => {
    authed();
    papersRepo.createPaper.mockResolvedValue({ kind: 'ok', paper: makePaper() });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/route');
    const r = await POST(jsonReq(URL, 'POST', { title: 'T' }) as any);
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.paper.created' }),
    );
  });
});

describe('GET /papers/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers/p-1';

  it('404 on cross-tenant', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('200 with authors + linkedExperimentsCount', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(makePaper());
    paperAuthorsRepo.listOrderedAuthorsForPaper.mockResolvedValue([]);
    papersRepo.countLinkedExperimentsForPaper.mockResolvedValue(2);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.linkedExperimentsCount).toBe(2);
  });
});

describe('PATCH /papers/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers/p-1';

  it('404 cross-tenant', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { title: 'New' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('PATCH archived=true delegates to archivePaper + audits .archived', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(makePaper());
    papersRepo.archivePaper.mockResolvedValue(
      makePaper({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: true }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.paper.archived' }),
    );
    expect(recordAudit.mock.calls.every((c) => c[0].action !== 'research.paper.updated')).toBe(true);
  });

  it('PATCH archived=false returns 400 with restore-route pointer', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(makePaper());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: false }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.restorePath).toBe(`/api/tiresias/agentic-os/research/papers/p-1/restore`);
  });

  it('409 on DOI duplicate during update', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(makePaper());
    papersRepo.updatePaper.mockResolvedValue({ kind: 'duplicate', field: 'doi' });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { doi: '10.1/x' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(409);
  });

  it('200 + audit .updated on successful update', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(makePaper());
    papersRepo.updatePaper.mockResolvedValue({ kind: 'ok', paper: makePaper({ title: 'New' }) });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { title: 'New' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.paper.updated' }),
    );
  });
});

describe('DELETE /papers/[id] (soft-archive)', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers/p-1';

  it('404 cross-tenant', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('sets archived_at + audits .archived', async () => {
    authed();
    papersRepo.getPaper.mockResolvedValue(makePaper());
    papersRepo.archivePaper.mockResolvedValue(
      makePaper({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.paper.archived' }),
    );
  });
});

describe('POST /papers/[id]/restore', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers/p-1/restore';

  it('404 cross-tenant', async () => {
    authed();
    papersRepo.restorePaper.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('400 when already active', async () => {
    authed();
    papersRepo.restorePaper.mockResolvedValue({ paper: makePaper(), alreadyActive: true });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(400);
  });

  it('200 + audit .restored on success', async () => {
    authed();
    papersRepo.restorePaper.mockResolvedValue({
      paper: makePaper({ archivedAt: null }),
      alreadyActive: false,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.paper.restored' }),
    );
  });
});

// ─── papers/[id]/authors collection ──────────────────────────────────────

describe('GET /papers/[id]/authors', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers/p-1/authors';

  it('404 cross-tenant paper', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(false);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/authors/route');
    const r = await GET(new Request(URL) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('200 with ordered authors', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.listOrderedAuthorsForPaper.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/authors/route');
    const r = await GET(new Request(URL) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
  });
});

describe('POST /papers/[id]/authors', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers/p-1/authors';

  it('400 when neither authorId nor displayName supplied', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/authors/route');
    const r = await POST(jsonReq(URL, 'POST', { position: 1 }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(400);
  });

  it('404 when authorId is cross-tenant', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.isAuthorOwnedByUser.mockResolvedValue(false);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/authors/route');
    const r = await POST(
      jsonReq(URL, 'POST', { authorId: '00000000-0000-0000-0000-000000000001' }) as any,
      params({ id: 'p-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('auto-creates + links when no authorId supplied', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    authorsRepo.createAuthor.mockResolvedValue({ kind: 'ok', author: makeAuthor() });
    paperAuthorsRepo.linkExistingAuthor.mockResolvedValue({
      kind: 'ok',
      link: {
        id: 'pa-1',
        paperId: 'p-1',
        authorId: 'a-1',
        position: 1,
        createdAt: '2026-05-12T10:00:00.000Z',
      },
      authorId: 'a-1',
      created: false,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/authors/route');
    const r = await POST(
      jsonReq(URL, 'POST', { displayName: 'Smith, J.' }) as any,
      params({ id: 'p-1' }),
    );
    expect(r.status).toBe(201);
    const actions = recordAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('research.author.created');
    expect(actions).toContain('research.paper.author.linked');
  });

  it('409 when (paper, author) already linked', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.isAuthorOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.linkExistingAuthor.mockResolvedValue({ kind: 'duplicate_author' });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/authors/route');
    const r = await POST(
      jsonReq(URL, 'POST', { authorId: '00000000-0000-0000-0000-000000000001' }) as any,
      params({ id: 'p-1' }),
    );
    expect(r.status).toBe(409);
  });

  it('409 when position slot is taken', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.isAuthorOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.linkExistingAuthor.mockResolvedValue({ kind: 'duplicate_position' });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/papers/[id]/authors/route');
    const r = await POST(
      jsonReq(URL, 'POST', {
        authorId: '00000000-0000-0000-0000-000000000001',
        position: 1,
      }) as any,
      params({ id: 'p-1' }),
    );
    expect(r.status).toBe(409);
  });
});

describe('PATCH/DELETE /papers/[id]/authors/[authorId]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/papers/p-1/authors/a-1';

  it('PATCH reorder ok + audits .reordered', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.reorderPaperAuthor.mockResolvedValue({ kind: 'ok' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/papers/[id]/authors/[authorId]/route'
    );
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { position: 3 }) as any,
      params({ id: 'p-1', authorId: 'a-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.paper.author.reordered' }),
    );
  });

  it('PATCH 404 when reorder returns not_found', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.reorderPaperAuthor.mockResolvedValue({ kind: 'not_found' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/papers/[id]/authors/[authorId]/route'
    );
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { position: 3 }) as any,
      params({ id: 'p-1', authorId: 'a-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('PATCH 400 on invalid_position', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.reorderPaperAuthor.mockResolvedValue({ kind: 'invalid_position' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/papers/[id]/authors/[authorId]/route'
    );
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { position: 100 }) as any,
      params({ id: 'p-1', authorId: 'a-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('DELETE 404 cross-tenant paper', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/papers/[id]/authors/[authorId]/route'
    );
    const r = await DELETE(
      new Request(URL, { method: 'DELETE' }) as any,
      params({ id: 'p-1', authorId: 'a-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('DELETE unlink ok + audits .unlinked', async () => {
    authed();
    paperAuthorsRepo.isPaperOwnedByUser.mockResolvedValue(true);
    paperAuthorsRepo.unlinkAuthor.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/papers/[id]/authors/[authorId]/route'
    );
    const r = await DELETE(
      new Request(URL, { method: 'DELETE' }) as any,
      params({ id: 'p-1', authorId: 'a-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.paper.author.unlinked' }),
    );
  });
});

// ─── authors routes ───────────────────────────────────────────────────────

describe('GET /authors', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/authors';

  it('401 unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/authors/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(401);
  });

  it('forwards family_name_prefix + q', async () => {
    authed();
    authorsRepo.listAuthors.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/authors/route');
    await GET(new Request(`${URL}?family_name_prefix=Sm&q=jane`) as any);
    expect(authorsRepo.listAuthors).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ familyNamePrefix: 'Sm', q: 'jane' }),
    );
  });
});

describe('POST /authors', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/authors';

  it('400 on invalid body', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/authors/route');
    const r = await POST(jsonReq(URL, 'POST', { foo: 'bar' }) as any);
    expect(r.status).toBe(400);
  });

  it('400 on malformed ORCID', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/authors/route');
    const r = await POST(
      jsonReq(URL, 'POST', { display_name: 'Smith', orcid: 'not-an-orcid' }) as any,
    );
    expect(r.status).toBe(400);
  });

  it('409 on duplicate ORCID', async () => {
    authed();
    authorsRepo.createAuthor.mockResolvedValue({ kind: 'duplicate', field: 'orcid' });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/authors/route');
    const r = await POST(
      jsonReq(URL, 'POST', {
        display_name: 'Smith',
        orcid: '0000-0001-2345-6789',
      }) as any,
    );
    expect(r.status).toBe(409);
  });

  it('201 + audit .created on success', async () => {
    authed();
    authorsRepo.createAuthor.mockResolvedValue({ kind: 'ok', author: makeAuthor() });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/authors/route');
    const r = await POST(jsonReq(URL, 'POST', { display_name: 'Smith' }) as any);
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.author.created' }),
    );
  });
});

describe('GET/PATCH/DELETE /authors/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/authors/a-1';

  it('GET 404 cross-tenant', async () => {
    authed();
    authorsRepo.getAuthor.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/authors/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'a-1' }));
    expect(r.status).toBe(404);
  });

  it('PATCH 404 cross-tenant', async () => {
    authed();
    authorsRepo.getAuthor.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/authors/[id]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { display_name: 'Smith' }) as any,
      params({ id: 'a-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('PATCH 409 on duplicate ORCID', async () => {
    authed();
    authorsRepo.getAuthor.mockResolvedValue(makeAuthor());
    authorsRepo.updateAuthor.mockResolvedValue({ kind: 'duplicate', field: 'orcid' });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/authors/[id]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { orcid: '0000-0001-2345-6789' }) as any,
      params({ id: 'a-1' }),
    );
    expect(r.status).toBe(409);
  });

  it('PATCH 200 + audit .updated', async () => {
    authed();
    authorsRepo.getAuthor.mockResolvedValue(makeAuthor());
    authorsRepo.updateAuthor.mockResolvedValue({
      kind: 'ok',
      author: makeAuthor({ displayName: 'New' }),
    });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/authors/[id]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { display_name: 'New' }) as any,
      params({ id: 'a-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.author.updated' }),
    );
  });

  it('DELETE 404 cross-tenant', async () => {
    authed();
    authorsRepo.deleteAuthor.mockResolvedValue({ kind: 'not_found' });
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/authors/[id]/route');
    const r = await DELETE(
      new Request(URL, { method: 'DELETE' }) as any,
      params({ id: 'a-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('DELETE 409 when papers still link the author', async () => {
    authed();
    authorsRepo.deleteAuthor.mockResolvedValue({ kind: 'in_use', count: 2 });
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/authors/[id]/route');
    const r = await DELETE(
      new Request(URL, { method: 'DELETE' }) as any,
      params({ id: 'a-1' }),
    );
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.linkedCount).toBe(2);
  });

  it('DELETE 200 + audit .deleted on success', async () => {
    authed();
    authorsRepo.deleteAuthor.mockResolvedValue({ kind: 'ok' });
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/authors/[id]/route');
    const r = await DELETE(
      new Request(URL, { method: 'DELETE' }) as any,
      params({ id: 'a-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.author.deleted' }),
    );
  });
});

// ─── experiment-references routes ─────────────────────────────────────────

describe('GET /experiments/[id]/references', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/experiments/e-1/references';

  it('404 cross-tenant experiment', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(false);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
    );
    const r = await GET(new Request(URL) as any, params({ id: 'e-1' }));
    expect(r.status).toBe(404);
  });

  it('200 with joined list', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.listReferencesForExperiment.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
    );
    const r = await GET(new Request(URL) as any, params({ id: 'e-1' }));
    expect(r.status).toBe(200);
  });
});

describe('POST /experiments/[id]/references', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/experiments/e-1/references';

  it('404 cross-tenant experiment', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
    );
    const r = await POST(
      jsonReq(URL, 'POST', { paperId: '00000000-0000-0000-0000-000000000001' }) as any,
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('404 cross-tenant paper', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
    );
    const r = await POST(
      jsonReq(URL, 'POST', { paperId: '00000000-0000-0000-0000-000000000001' }) as any,
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('400 on invalid body', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
    );
    const r = await POST(jsonReq(URL, 'POST', { foo: 'bar' }) as any, params({ id: 'e-1' }));
    expect(r.status).toBe(400);
  });

  it('409 on duplicate triple', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
    referencesRepo.createReference.mockResolvedValue({ kind: 'duplicate' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
    );
    const r = await POST(
      jsonReq(URL, 'POST', {
        paperId: '00000000-0000-0000-0000-000000000001',
        relevance: 'cites',
      }) as any,
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(409);
  });

  it('all 5 relevance values accepted', async () => {
    const RELS = ['cites', 'methods', 'prior_art', 'contradicts', 'builds_on'];
    for (const rel of RELS) {
      authed();
      referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
      referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
      referencesRepo.createReference.mockResolvedValue({
        kind: 'ok',
        link: {
          id: 'er-1',
          experimentId: 'e-1',
          paperId: 'p-1',
          relevance: rel,
          notes: null,
          createdAt: '2026-05-12T10:00:00.000Z',
        },
      });
      const { POST } = await import(
        '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
      );
      const r = await POST(
        jsonReq(URL, 'POST', {
          paperId: '00000000-0000-0000-0000-000000000001',
          relevance: rel,
        }) as any,
        params({ id: 'e-1' }),
      );
      expect(r.status).toBe(201);
    }
  });

  it('201 + audit with projectId = experimentId', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
    referencesRepo.createReference.mockResolvedValue({
      kind: 'ok',
      link: {
        id: 'er-1',
        experimentId: 'e-1',
        paperId: 'p-1',
        relevance: 'cites',
        notes: null,
        createdAt: '2026-05-12T10:00:00.000Z',
      },
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/route'
    );
    await POST(
      jsonReq(URL, 'POST', { paperId: '00000000-0000-0000-0000-000000000001' }) as any,
      params({ id: 'e-1' }),
    );
    const audit = recordAudit.mock.calls[0]?.[0];
    expect(audit?.action).toBe('research.experiment.reference.linked');
    expect(audit?.projectId).toBe('e-1');
  });
});

describe('PATCH/DELETE /experiments/[id]/references/[paperId]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/experiments/e-1/references/p-1';

  it('PATCH 404 cross-tenant experiment', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(false);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/[paperId]/route'
    );
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { relevance: 'methods' }) as any,
      params({ id: 'e-1', paperId: 'p-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('PATCH 400 when no fields supplied', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
    referencesRepo.getReferenceByPair.mockResolvedValue({
      id: 'er-1',
      experimentId: 'e-1',
      paperId: 'p-1',
      relevance: 'cites',
      notes: null,
      createdAt: '2026-05-12T10:00:00.000Z',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/[paperId]/route'
    );
    const r = await PATCH(jsonReq(URL, 'PATCH', {}) as any, params({ id: 'e-1', paperId: 'p-1' }));
    expect(r.status).toBe(400);
  });

  it('PATCH 200 + audit .updated', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
    referencesRepo.getReferenceByPair.mockResolvedValue({
      id: 'er-1',
      experimentId: 'e-1',
      paperId: 'p-1',
      relevance: 'cites',
      notes: null,
      createdAt: '2026-05-12T10:00:00.000Z',
    });
    referencesRepo.updateReference.mockResolvedValue({
      id: 'er-1',
      experimentId: 'e-1',
      paperId: 'p-1',
      relevance: 'methods',
      notes: 'updated',
      createdAt: '2026-05-12T10:00:00.000Z',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/[paperId]/route'
    );
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { relevance: 'methods', notes: 'updated' }) as any,
      params({ id: 'e-1', paperId: 'p-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.reference.updated',
        projectId: 'e-1',
      }),
    );
  });

  it('DELETE 404 when no rows match', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
    referencesRepo.deleteReference.mockResolvedValue(0);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/[paperId]/route'
    );
    const r = await DELETE(
      new Request(URL, { method: 'DELETE' }) as any,
      params({ id: 'e-1', paperId: 'p-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('DELETE 400 on invalid relevance query param', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/[paperId]/route'
    );
    const r = await DELETE(
      new Request(`${URL}?relevance=bogus`, { method: 'DELETE' }) as any,
      params({ id: 'e-1', paperId: 'p-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('DELETE 200 + audit .unlinked', async () => {
    authed();
    referencesRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    referencesRepo.isPaperOwnedByUser.mockResolvedValue(true);
    referencesRepo.deleteReference.mockResolvedValue(1);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/references/[paperId]/route'
    );
    const r = await DELETE(
      new Request(`${URL}?relevance=cites`, { method: 'DELETE' }) as any,
      params({ id: 'e-1', paperId: 'p-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.reference.unlinked',
        projectId: 'e-1',
      }),
    );
  });
});

// ─── registry sanity ──────────────────────────────────────────────────────

describe('registry includes Literature library card', () => {
  it('research OS module surfaces the library card', async () => {
    const { AGENTIC_OS_MODULES } = await import('@/lib/agentic-os/registry');
    const research = AGENTIC_OS_MODULES.find((m) => m.slug === 'research');
    expect(research).toBeTruthy();
    const card = research?.features.find(
      (f) => f.href === '/dashboard/os/research/library',
    );
    expect(card).toBeTruthy();
    expect(card?.label).toBe('Literature library');
  });
});
