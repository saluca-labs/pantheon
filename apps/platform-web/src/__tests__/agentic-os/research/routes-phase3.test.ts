/**
 * Research OS Phase 3 — route handler tests.
 *
 * Covers the full Phase 3 surface:
 *   - hypotheses route extensions (description_md, archived=true PATCH, restore)
 *   - hypotheses/[id]/predictions (GET, POST) + /predictions/[predId] (PATCH, DELETE)
 *   - hypotheses/[id]/falsifiers  (GET, POST) + /falsifiers/[falsId] (PATCH, DELETE)
 *   - hypotheses/[id]/evidence    (GET, POST) + /evidence/[evId] (DELETE)
 *   - experiments/[id]/hypotheses (GET, POST) + /[hypothesisId] (PATCH, DELETE)
 *
 * Repo + session + audit mocked at module level.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentResearchUser = vi.fn();
const recordAudit = vi.fn();

// Repo mocks
const repoMocks = {
  // hypotheses (in repo.ts)
  listHypotheses: vi.fn(),
  getHypothesis: vi.fn(),
  createHypothesis: vi.fn(),
  updateHypothesis: vi.fn(),
  archiveHypothesis: vi.fn(),
  restoreHypothesis: vi.fn(),
};
const predictionsRepo = {
  isHypothesisOwnedByUser: vi.fn(),
  listPredictionsForHypothesis: vi.fn(),
  getPrediction: vi.fn(),
  createPrediction: vi.fn(),
  updatePrediction: vi.fn(),
  deletePrediction: vi.fn(),
};
const falsifiersRepo = {
  listFalsifiersForHypothesis: vi.fn(),
  getFalsifier: vi.fn(),
  createFalsifier: vi.fn(),
  updateFalsifier: vi.fn(),
  deleteFalsifier: vi.fn(),
};
const evidenceRepo = {
  listEvidenceForHypothesis: vi.fn(),
  getEvidence: vi.fn(),
  createEvidence: vi.fn(),
  deleteEvidence: vi.fn(),
};
const joinRepo = {
  isExperimentOwnedByUser: vi.fn(),
  isHypothesisOwnedByUser: vi.fn(),
  listLinkedHypothesesForExperiment: vi.fn(),
  getLinkByPair: vi.fn(),
  createLink: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
};

vi.mock('@/lib/agentic-os/research/session', () => ({
  getCurrentResearchUser: (...a: any[]) => getCurrentResearchUser(...a),
  getResearchPool: () => ({ query: vi.fn() }),
}));

vi.mock('@/lib/agentic-os/research/repo', () => ({
  ...repoMocks,
  recordAudit: (...a: any[]) => recordAudit(...a),
}));

vi.mock('@/lib/agentic-os/research/predictions-repo', () => predictionsRepo);
vi.mock('@/lib/agentic-os/research/falsifiers-repo', () => falsifiersRepo);
vi.mock('@/lib/agentic-os/research/evidence-repo', () => evidenceRepo);
vi.mock('@/lib/agentic-os/research/experiment-hypotheses-repo', () => joinRepo);

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
  for (const m of Object.values({ ...repoMocks, ...predictionsRepo, ...falsifiersRepo, ...evidenceRepo, ...joinRepo })) {
    (m as any).mockReset();
  }
});

function makeHypothesis(o: Record<string, any> = {}) {
  return {
    id: 'h-1',
    userId: 'u-1',
    title: 'T',
    ifClause: 'if',
    thenClause: 'then',
    becauseClause: 'because',
    status: 'draft',
    confidence: 'medium',
    tags: [],
    experimentIds: [],
    descriptionMd: '',
    archivedAt: null,
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...o,
  };
}

// ─── Hypotheses list/POST/PATCH/restore extensions ─────────────────────────

describe('GET /hypotheses (Phase 3 archived filter)', () => {
  it('default scope passes archived: false to repo', async () => {
    authed();
    repoMocks.listHypotheses.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/route');
    await GET(new Request('http://t/api/x') as any);
    expect(repoMocks.listHypotheses).toHaveBeenCalledWith('u-1', { archived: false });
  });

  it('?archived=true forwards archived: true', async () => {
    authed();
    repoMocks.listHypotheses.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/route');
    await GET(new Request('http://t/api/x?archived=true') as any);
    expect(repoMocks.listHypotheses).toHaveBeenCalledWith('u-1', { archived: true });
  });

  it('?archived=all forwards archived: "all"', async () => {
    authed();
    repoMocks.listHypotheses.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/route');
    await GET(new Request('http://t/api/x?archived=all') as any);
    expect(repoMocks.listHypotheses).toHaveBeenCalledWith('u-1', { archived: 'all' });
  });

  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/route');
    const r = await GET(new Request('http://t/api/x') as any);
    expect(r.status).toBe(401);
  });
});

describe('POST /hypotheses accepts description_md', () => {
  it('passes descriptionMd through to repo on create', async () => {
    authed();
    repoMocks.createHypothesis.mockResolvedValue(makeHypothesis({ descriptionMd: 'long' }));
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/route');
    const r = await POST(jsonReq('http://t/api/x', 'POST', {
      title: 'T',
      ifClause: 'a',
      thenClause: 'b',
      becauseClause: 'c',
      descriptionMd: 'long',
    }) as any);
    expect(r.status).toBe(201);
    expect(repoMocks.createHypothesis).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ descriptionMd: 'long' }),
    );
  });
});

describe('PATCH /hypotheses/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/hypotheses/h-1';

  it('PATCH archived=true delegates to archiveHypothesis + audits .archived', async () => {
    authed();
    repoMocks.getHypothesis.mockResolvedValue(makeHypothesis());
    repoMocks.archiveHypothesis.mockResolvedValue(makeHypothesis({ archivedAt: '2026-05-12T11:00:00Z' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: true }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(200);
    expect(repoMocks.archiveHypothesis).toHaveBeenCalledWith('h-1', 'u-1');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.hypothesis.archived' }),
    );
    // Does NOT fire .updated.
    expect(recordAudit.mock.calls.every((c) => c[0].action !== 'research.hypothesis.updated')).toBe(true);
  });

  it('PATCH archived=false returns 400 (use POST /restore)', async () => {
    authed();
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: false }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(400);
  });

  it('PATCH status change fires status_changed audit in addition to updated', async () => {
    authed();
    repoMocks.getHypothesis.mockResolvedValue(makeHypothesis({ status: 'draft' }));
    repoMocks.updateHypothesis.mockResolvedValue(makeHypothesis({ status: 'active' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { status: 'active' }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(200);
    const actions = recordAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('research.hypothesis.updated');
    expect(actions).toContain('research.hypothesis.status_changed');
  });

  it('PATCH non-status field does NOT fire status_changed', async () => {
    authed();
    repoMocks.getHypothesis.mockResolvedValue(makeHypothesis());
    repoMocks.updateHypothesis.mockResolvedValue(makeHypothesis({ title: 'New' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/route');
    await PATCH(jsonReq(URL, 'PATCH', { title: 'New' }) as any, params({ id: 'h-1' }));
    const actions = recordAudit.mock.calls.map((c) => c[0].action);
    expect(actions).not.toContain('research.hypothesis.status_changed');
  });

  it('PATCH descriptionMd is accepted', async () => {
    authed();
    repoMocks.getHypothesis.mockResolvedValue(makeHypothesis());
    repoMocks.updateHypothesis.mockResolvedValue(makeHypothesis({ descriptionMd: 'long' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { descriptionMd: 'long' }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(200);
    expect(repoMocks.updateHypothesis).toHaveBeenCalledWith(
      'h-1',
      'u-1',
      expect.objectContaining({ descriptionMd: 'long' }),
    );
  });

  it('PATCH on non-owned hypothesis returns 404', async () => {
    authed();
    repoMocks.getHypothesis.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { title: 'new' }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(404);
  });
});

describe('POST /hypotheses/[id]/restore', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/hypotheses/h-1/restore';

  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/restore/route');
    const r = await POST(jsonReq(URL, 'POST') as any, params({ id: 'h-1' }));
    expect(r.status).toBe(401);
  });

  it('404 when repo returns null', async () => {
    authed();
    repoMocks.restoreHypothesis.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/restore/route');
    const r = await POST(jsonReq(URL, 'POST') as any, params({ id: 'h-1' }));
    expect(r.status).toBe(404);
  });

  it('400 when alreadyActive', async () => {
    authed();
    repoMocks.restoreHypothesis.mockResolvedValue({
      hypothesis: makeHypothesis({ archivedAt: null }),
      alreadyActive: true,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/restore/route');
    const r = await POST(jsonReq(URL, 'POST') as any, params({ id: 'h-1' }));
    expect(r.status).toBe(400);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('200 on success + audit fires .restored', async () => {
    authed();
    repoMocks.restoreHypothesis.mockResolvedValue({
      hypothesis: makeHypothesis({ archivedAt: null }),
      alreadyActive: false,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/restore/route');
    const r = await POST(jsonReq(URL, 'POST') as any, params({ id: 'h-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.hypothesis.restored' }),
    );
  });
});

// ─── Predictions routes ─────────────────────────────────────────────────────

function predRow(o: Record<string, any> = {}) {
  return {
    id: 'p-1',
    hypothesisId: 'h-1',
    userId: 'u-1',
    text: 'x',
    kind: 'positive',
    confidence: 'medium',
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...o,
  };
}

describe('GET /hypotheses/[id]/predictions', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/hypotheses/h-1/predictions';

  it('401 unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(401);
  });

  it('404 when hypothesis not owned', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(false);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(404);
  });

  it('200 with predictions on happy path', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    predictionsRepo.listPredictionsForHypothesis.mockResolvedValue([predRow()]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.predictions).toHaveLength(1);
  });
});

describe('POST /hypotheses/[id]/predictions', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/hypotheses/h-1/predictions';

  it('400 on missing text', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await POST(jsonReq(URL, 'POST', {}) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(400);
  });

  it('400 on invalid kind enum', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await POST(jsonReq(URL, 'POST', { text: 'x', kind: 'bogus' }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(400);
  });

  it('400 on invalid confidence enum', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await POST(
      jsonReq(URL, 'POST', { text: 'x', confidence: 'huge' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('404 when hypothesis not owned', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(false);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await POST(jsonReq(URL, 'POST', { text: 'x' }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(404);
    expect(predictionsRepo.createPrediction).not.toHaveBeenCalled();
  });

  it('201 + audit fires .created', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    predictionsRepo.createPrediction.mockResolvedValue(predRow({ id: 'p-new' }));
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
    const r = await POST(jsonReq(URL, 'POST', { text: 'x' }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.prediction.created',
        payload: expect.objectContaining({ predictionId: 'p-new', hypothesisId: 'h-1' }),
      }),
    );
  });

  it('accepts each of the 4 valid kinds', async () => {
    for (const kind of ['positive', 'negative', 'magnitude', 'direction']) {
      authed();
      predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
      predictionsRepo.createPrediction.mockReset();
      predictionsRepo.createPrediction.mockResolvedValue(predRow({ kind: kind as any }));
      const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/predictions/route');
      const r = await POST(
        jsonReq(URL, 'POST', { text: 'x', kind }) as any,
        params({ id: 'h-1' }),
      );
      expect(r.status).toBe(201);
    }
  });
});

describe('PATCH /predictions/[predId]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/predictions/p-1';

  it('404 cross-tenant', async () => {
    authed();
    predictionsRepo.getPrediction.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/predictions/[predId]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { text: 'x' }) as any, params({ predId: 'p-1' }));
    expect(r.status).toBe(404);
    expect(predictionsRepo.updatePrediction).not.toHaveBeenCalled();
  });

  it('400 on invalid kind', async () => {
    authed();
    predictionsRepo.getPrediction.mockResolvedValue(predRow());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/predictions/[predId]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { kind: 'bogus' }) as any, params({ predId: 'p-1' }));
    expect(r.status).toBe(400);
  });

  it('200 + audit fires .updated', async () => {
    authed();
    predictionsRepo.getPrediction.mockResolvedValue(predRow());
    predictionsRepo.updatePrediction.mockResolvedValue(predRow({ text: 'new' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/predictions/[predId]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { text: 'new' }) as any, params({ predId: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.prediction.updated' }),
    );
  });
});

describe('DELETE /predictions/[predId]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/predictions/p-1';

  it('404 cross-tenant', async () => {
    authed();
    predictionsRepo.getPrediction.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/predictions/[predId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ predId: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('200 + audit fires .deleted', async () => {
    authed();
    predictionsRepo.getPrediction.mockResolvedValue(predRow());
    predictionsRepo.deletePrediction.mockResolvedValue(true);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/predictions/[predId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ predId: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.prediction.deleted' }),
    );
  });
});

// ─── Falsifiers routes ─────────────────────────────────────────────────────

function falsRow(o: Record<string, any> = {}) {
  return {
    id: 'f-1',
    hypothesisId: 'h-1',
    userId: 'u-1',
    text: 'x',
    criterionMd: null,
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...o,
  };
}

describe('GET + POST /hypotheses/[id]/falsifiers', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/hypotheses/h-1/falsifiers';

  it('GET 404 when hypothesis not owned', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(false);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/falsifiers/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(404);
  });

  it('GET 200 happy path', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    falsifiersRepo.listFalsifiersForHypothesis.mockResolvedValue([falsRow()]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/falsifiers/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(200);
  });

  it('POST 400 on missing text', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/falsifiers/route');
    const r = await POST(jsonReq(URL, 'POST', {}) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(400);
  });

  it('POST 201 + audit fires .created', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    falsifiersRepo.createFalsifier.mockResolvedValue(falsRow({ id: 'f-new' }));
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/falsifiers/route');
    const r = await POST(jsonReq(URL, 'POST', { text: 'x' }) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.falsifier.created' }),
    );
  });
});

describe('PATCH + DELETE /falsifiers/[falsId]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/falsifiers/f-1';

  it('PATCH 404 cross-tenant', async () => {
    authed();
    falsifiersRepo.getFalsifier.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/falsifiers/[falsId]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { text: 'x' }) as any, params({ falsId: 'f-1' }));
    expect(r.status).toBe(404);
  });

  it('PATCH 200 + audit fires .updated', async () => {
    authed();
    falsifiersRepo.getFalsifier.mockResolvedValue(falsRow());
    falsifiersRepo.updateFalsifier.mockResolvedValue(falsRow({ text: 'new' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/falsifiers/[falsId]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { text: 'new' }) as any, params({ falsId: 'f-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.falsifier.updated' }),
    );
  });

  it('DELETE 404 cross-tenant', async () => {
    authed();
    falsifiersRepo.getFalsifier.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/falsifiers/[falsId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ falsId: 'f-1' }));
    expect(r.status).toBe(404);
  });

  it('DELETE 200 + audit fires .deleted', async () => {
    authed();
    falsifiersRepo.getFalsifier.mockResolvedValue(falsRow());
    falsifiersRepo.deleteFalsifier.mockResolvedValue(true);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/falsifiers/[falsId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ falsId: 'f-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.falsifier.deleted' }),
    );
  });
});

// ─── Evidence routes ───────────────────────────────────────────────────────

function evRow(o: Record<string, any> = {}) {
  return {
    id: 'e-1',
    hypothesisId: 'h-1',
    userId: 'u-1',
    polarity: 'supports',
    sourceKind: 'free_text',
    sourceId: null,
    sourceUrl: null,
    notes: 'evidence',
    metadata: {},
    createdAt: '2026-05-12T10:00:00.000Z',
    ...o,
  };
}

describe('POST /hypotheses/[id]/evidence — discriminator contract', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/hypotheses/h-1/evidence';

  beforeEach(() => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
  });

  it('401 when unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(jsonReq(URL, 'POST', {}) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(401);
  });

  it('404 when hypothesis not owned', async () => {
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(false);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'supports', sourceKind: 'free_text', notes: 'x' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('400 on invalid polarity (Zod enum)', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'strong', sourceKind: 'free_text', notes: 'x' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('400 on invalid source_kind (Zod enum)', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'supports', sourceKind: 'image', notes: 'x' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('400 when external_url missing sourceUrl', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'supports', sourceKind: 'external_url' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('400 when notebook_entry missing sourceId', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'supports', sourceKind: 'notebook_entry' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('400 when paper missing sourceId', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'mixed', sourceKind: 'paper' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('400 when dataset missing sourceId', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'refutes', sourceKind: 'dataset' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('400 when free_text missing notes', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'supports', sourceKind: 'free_text' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('201 + audit fires .linked on valid free_text', async () => {
    evidenceRepo.createEvidence.mockResolvedValue(evRow({ id: 'e-new' }));
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', { polarity: 'supports', sourceKind: 'free_text', notes: 'evidence' }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.evidence.linked',
        payload: expect.objectContaining({ evidenceId: 'e-new' }),
      }),
    );
  });

  it('201 on valid external_url', async () => {
    evidenceRepo.createEvidence.mockResolvedValue(
      evRow({ id: 'e-new', sourceKind: 'external_url', sourceUrl: 'https://x' }),
    );
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', {
        polarity: 'supports',
        sourceKind: 'external_url',
        sourceUrl: 'https://example.com',
      }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(201);
  });

  it('201 on valid notebook_entry with sourceId', async () => {
    evidenceRepo.createEvidence.mockResolvedValue(
      evRow({ id: 'e-new', sourceKind: 'notebook_entry', sourceId: '00000000-0000-0000-0000-000000000001' }),
    );
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await POST(
      jsonReq(URL, 'POST', {
        polarity: 'supports',
        sourceKind: 'notebook_entry',
        sourceId: '00000000-0000-0000-0000-000000000001',
      }) as any,
      params({ id: 'h-1' }),
    );
    expect(r.status).toBe(201);
  });

  it('accepts each of the 3 polarities', async () => {
    for (const polarity of ['supports', 'refutes', 'mixed']) {
      authed();
      predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
      evidenceRepo.createEvidence.mockReset();
      evidenceRepo.createEvidence.mockResolvedValue(evRow({ id: `e-${polarity}`, polarity: polarity as any }));
      const { POST } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
      const r = await POST(
        jsonReq(URL, 'POST', { polarity, sourceKind: 'free_text', notes: 'x' }) as any,
        params({ id: 'h-1' }),
      );
      expect(r.status).toBe(201);
    }
  });
});

describe('GET /hypotheses/[id]/evidence', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/hypotheses/h-1/evidence';

  it('401 unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(401);
  });

  it('404 when hypothesis not owned', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(false);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(404);
  });

  it('200 happy path', async () => {
    authed();
    predictionsRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    evidenceRepo.listEvidenceForHypothesis.mockResolvedValue([evRow()]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/hypotheses/[id]/evidence/route');
    const r = await GET(new Request(URL) as any, params({ id: 'h-1' }));
    expect(r.status).toBe(200);
  });
});

describe('DELETE /evidence/[evId]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/evidence/e-1';

  it('404 cross-tenant', async () => {
    authed();
    evidenceRepo.getEvidence.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/evidence/[evId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ evId: 'e-1' }));
    expect(r.status).toBe(404);
  });

  it('200 + audit fires .unlinked', async () => {
    authed();
    evidenceRepo.getEvidence.mockResolvedValue(evRow());
    evidenceRepo.deleteEvidence.mockResolvedValue(true);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/evidence/[evId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ evId: 'e-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.evidence.unlinked' }),
    );
  });
});

// ─── Experiment-hypotheses N:M routes ──────────────────────────────────────

function linkRow(o: Record<string, any> = {}) {
  return {
    id: 'lk-1',
    experimentId: 'exp-1',
    hypothesisId: 'h-1',
    role: 'tests',
    notes: null,
    createdAt: '2026-05-12T10:00:00.000Z',
    ...o,
  };
}

describe('GET /experiments/[id]/hypotheses', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/experiments/exp-1/hypotheses';

  it('401 unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await GET(new Request(URL) as any, params({ id: 'exp-1' }));
    expect(r.status).toBe(401);
  });

  it('404 when experiment not owned', async () => {
    authed();
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(false);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await GET(new Request(URL) as any, params({ id: 'exp-1' }));
    expect(r.status).toBe(404);
  });

  it('200 happy path', async () => {
    authed();
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    joinRepo.listLinkedHypothesesForExperiment.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await GET(new Request(URL) as any, params({ id: 'exp-1' }));
    expect(r.status).toBe(200);
  });
});

describe('POST /experiments/[id]/hypotheses', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/experiments/exp-1/hypotheses';
  const VALID_HYP_UUID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    authed();
  });

  it('404 when experiment not owned', async () => {
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(false);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await POST(
      jsonReq(URL, 'POST', { hypothesis_id: VALID_HYP_UUID }) as any,
      params({ id: 'exp-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('404 when hypothesis not owned (cross-tenant on the other side)', async () => {
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    joinRepo.isHypothesisOwnedByUser.mockResolvedValue(false);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await POST(
      jsonReq(URL, 'POST', { hypothesis_id: VALID_HYP_UUID }) as any,
      params({ id: 'exp-1' }),
    );
    expect(r.status).toBe(404);
    expect(joinRepo.createLink).not.toHaveBeenCalled();
  });

  it('400 on invalid body (missing hypothesis_id)', async () => {
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await POST(jsonReq(URL, 'POST', {}) as any, params({ id: 'exp-1' }));
    expect(r.status).toBe(400);
  });

  it('400 on invalid role enum', async () => {
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    joinRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await POST(
      jsonReq(URL, 'POST', { hypothesis_id: VALID_HYP_UUID, role: 'owns' }) as any,
      params({ id: 'exp-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('409 on duplicate (UNIQUE violation in repo)', async () => {
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    joinRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    joinRepo.createLink.mockResolvedValue({ kind: 'duplicate' });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await POST(
      jsonReq(URL, 'POST', { hypothesis_id: VALID_HYP_UUID }) as any,
      params({ id: 'exp-1' }),
    );
    expect(r.status).toBe(409);
  });

  it('201 + audit fires .linked with projectId = experimentId', async () => {
    joinRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    joinRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
    joinRepo.createLink.mockResolvedValue({ kind: 'ok', link: linkRow() });
    const { POST } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
    const r = await POST(
      jsonReq(URL, 'POST', { hypothesis_id: VALID_HYP_UUID }) as any,
      params({ id: 'exp-1' }),
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.hypothesis.linked',
        projectId: 'exp-1',
        payload: expect.objectContaining({ experimentId: 'exp-1' }),
      }),
    );
  });

  it('accepts each of the 3 valid roles', async () => {
    for (const role of ['tests', 'motivates', 'related']) {
      authed();
      joinRepo.isExperimentOwnedByUser.mockResolvedValue(true);
      joinRepo.isHypothesisOwnedByUser.mockResolvedValue(true);
      joinRepo.createLink.mockReset();
      joinRepo.createLink.mockResolvedValue({ kind: 'ok', link: linkRow({ role: role as any }) });
      const { POST } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/route');
      const r = await POST(
        jsonReq(URL, 'POST', { hypothesis_id: VALID_HYP_UUID, role }) as any,
        params({ id: 'exp-1' }),
      );
      expect(r.status).toBe(201);
    }
  });
});

describe('PATCH + DELETE /experiments/[id]/hypotheses/[hypothesisId]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/research/experiments/exp-1/hypotheses/h-1';

  it('PATCH 404 cross-tenant either side', async () => {
    authed();
    joinRepo.getLinkByPair.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/[hypothesisId]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { role: 'related' }) as any, params({ id: 'exp-1', hypothesisId: 'h-1' }));
    expect(r.status).toBe(404);
  });

  it('PATCH 200 + audit (with patched: true flag)', async () => {
    authed();
    joinRepo.getLinkByPair.mockResolvedValue(linkRow());
    joinRepo.updateLink.mockResolvedValue(linkRow({ role: 'motivates' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/[hypothesisId]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { role: 'motivates' }) as any,
      params({ id: 'exp-1', hypothesisId: 'h-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.hypothesis.linked',
        projectId: 'exp-1',
        payload: expect.objectContaining({ patched: true }),
      }),
    );
  });

  it('DELETE 404 cross-tenant', async () => {
    authed();
    joinRepo.getLinkByPair.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/[hypothesisId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'exp-1', hypothesisId: 'h-1' }));
    expect(r.status).toBe(404);
  });

  it('DELETE 200 + audit fires .unlinked', async () => {
    authed();
    joinRepo.getLinkByPair.mockResolvedValue(linkRow());
    joinRepo.deleteLink.mockResolvedValue(true);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/research/experiments/[id]/hypotheses/[hypothesisId]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'exp-1', hypothesisId: 'h-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.hypothesis.unlinked',
        projectId: 'exp-1',
      }),
    );
  });
});
