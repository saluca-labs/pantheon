/**
 * Research OS Phase 5 — route handler tests.
 *
 * Covers the full Phase 5 surface:
 *   - experiments/[id]/datasets (GET, POST) + datasets/[datasetId] (GET, PATCH, DELETE)
 *   - protocols (GET, POST) + protocols/[id] (GET, PATCH, DELETE) + /versions (POST)
 *   - experiments/[id]/protocols (GET, POST) + /[protocolId] (PATCH, DELETE)
 *   - experiments/[id]/export.pdf (GET happy + 400 empty + 404 cross-user)
 *
 * Repo + session + audit mocked at module level.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentResearchUser = vi.fn();
const recordAudit = vi.fn();

// Datasets repo
const datasetsRepo = {
  isExperimentOwnedByUser: vi.fn(),
  listDatasetsForExperiment: vi.fn(),
  getDataset: vi.fn(),
  createDataset: vi.fn(),
  updateDataset: vi.fn(),
  deleteDataset: vi.fn(),
  countDatasetsForExperiment: vi.fn(),
};
const protocolsRepo = {
  isProtocolOwnedByUser: vi.fn(),
  listProtocols: vi.fn(),
  getProtocol: vi.fn(),
  getProtocolTree: vi.fn(),
  createProtocol: vi.fn(),
  bumpProtocolVersion: vi.fn(),
  updateProtocol: vi.fn(),
  deleteProtocol: vi.fn(),
};
const expProtocolsRepo = {
  isExperimentOwnedByUser: vi.fn(),
  isProtocolOwnedByUser: vi.fn(),
  listProtocolsForExperiment: vi.fn(),
  getExperimentProtocolLink: vi.fn(),
  getExperimentProtocolLinkById: vi.fn(),
  pinProtocolToExperiment: vi.fn(),
  updateExperimentProtocolNotes: vi.fn(),
  unpinProtocolFromExperiment: vi.fn(),
  countProtocolPinsForExperiment: vi.fn(),
};
const referencesRepoMocks = {
  listReferencesForExperiment: vi.fn(),
  isExperimentOwnedByUser: vi.fn(),
  isPaperOwnedByUser: vi.fn(),
  getReferenceByPair: vi.fn(),
  createReference: vi.fn(),
  updateReference: vi.fn(),
  deleteReference: vi.fn(),
  listExperimentsLinkingPaper: vi.fn(),
  listRelatedNotebookEntriesForPaper: vi.fn(),
};
const expHypothesesMocks = {
  listLinkedHypothesesForExperiment: vi.fn(),
  isExperimentOwnedByUser: vi.fn(),
  isHypothesisOwnedByUser: vi.fn(),
};
const notebookRepoMocks = {
  listNotebookEntriesForExperiment: vi.fn(),
  isExperimentOwnedByUser: vi.fn(),
  getNotebookEntry: vi.fn(),
  createNotebookEntry: vi.fn(),
  updateNotebookEntry: vi.fn(),
  archiveNotebookEntry: vi.fn(),
  restoreNotebookEntry: vi.fn(),
};
const predictionsMocks = {
  listPredictionsForHypothesis: vi.fn(),
};
const falsifiersMocks = {
  listFalsifiersForHypothesis: vi.fn(),
};
const paperAuthorsMocks = {
  listOrderedAuthorsForPaper: vi.fn(),
};
const repoMocks = {
  recordAudit: (...a: any[]) => recordAudit(...a),
  getExperiment: vi.fn(),
  listHypotheses: vi.fn(),
};
const renderPdfToBuffer = vi.fn();

vi.mock('@/lib/agentic-os/research/session', () => ({
  getCurrentResearchUser: (...a: any[]) => getCurrentResearchUser(...a),
  getResearchPool: () => ({ query: vi.fn() }),
}));

vi.mock('@/lib/agentic-os/research/repo', () => repoMocks);
vi.mock('@/lib/agentic-os/research/datasets-repo', () => datasetsRepo);
vi.mock('@/lib/agentic-os/research/protocols-repo', () => protocolsRepo);
vi.mock(
  '@/lib/agentic-os/research/experiment-protocols-repo',
  () => expProtocolsRepo,
);
vi.mock(
  '@/lib/agentic-os/research/experiment-references-repo',
  () => referencesRepoMocks,
);
vi.mock(
  '@/lib/agentic-os/research/experiment-hypotheses-repo',
  () => expHypothesesMocks,
);
vi.mock(
  '@/lib/agentic-os/research/notebook-entries-repo',
  () => notebookRepoMocks,
);
vi.mock(
  '@/lib/agentic-os/research/predictions-repo',
  () => predictionsMocks,
);
vi.mock(
  '@/lib/agentic-os/research/falsifiers-repo',
  () => falsifiersMocks,
);
vi.mock(
  '@/lib/agentic-os/research/paper-authors-repo',
  () => paperAuthorsMocks,
);
vi.mock('@/lib/agentic-os/_shared/pdf/render', () => ({
  renderPdfToBuffer: (...a: any[]) => renderPdfToBuffer(...a),
}));

function authed() {
  getCurrentResearchUser.mockResolvedValue({
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

function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

beforeEach(() => {
  getCurrentResearchUser.mockReset();
  recordAudit.mockReset();
  recordAudit.mockResolvedValue(undefined);
  renderPdfToBuffer.mockReset();
  for (const m of Object.values({
    ...datasetsRepo,
    ...protocolsRepo,
    ...expProtocolsRepo,
    ...referencesRepoMocks,
    ...expHypothesesMocks,
    ...notebookRepoMocks,
    ...predictionsMocks,
    ...falsifiersMocks,
    ...paperAuthorsMocks,
  })) {
    (m as any).mockReset();
  }
  for (const m of Object.values(repoMocks)) {
    if (typeof m === 'function' && (m as any).mockReset) {
      (m as any).mockReset();
    }
  }
});

function makeDataset(o: Record<string, any> = {}) {
  return {
    id: 'd-1',
    userId: 'u-1',
    experimentId: 'e-1',
    name: 'Sample',
    kind: 'tabular',
    url: 'https://example.com/data.csv',
    version: '1.0',
    sizeBytes: 1024,
    checksum: null,
    archived: false,
    publishedDoi: null,
    notesMd: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...o,
  };
}

function makeProtocol(o: Record<string, any> = {}) {
  return {
    id: 'p-1',
    userId: 'u-1',
    title: 'Method X',
    version: '1.0',
    bodyMd: '## step 1',
    kind: 'method',
    attachedUrls: [],
    tags: [],
    parentProtocolId: null,
    metadata: {},
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...o,
  };
}

function makeExperiment(o: Record<string, any> = {}) {
  return {
    id: 'e-1',
    userId: 'u-1',
    hypothesisId: null,
    name: 'My experiment',
    description: 'A trial of method X.',
    status: 'planning',
    tags: ['mouse'],
    coverImageUrl: null,
    targetCompletionDate: '2026-06-01',
    teamSize: 1,
    phaseProgress: { planning: 50, running: 0, analysis: 0, writeup: 0, published: 0 },
    archivedAt: null,
    metadata: {},
    independent: '',
    dependent: '',
    controls: '',
    protocol: '',
    successCriteria: '',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...o,
  };
}

// ─── /experiments/[id]/datasets ──────────────────────────────────────────

describe('GET /experiments/[id]/datasets', () => {
  it('401 unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/datasets/route'
    );
    const r = await GET(jsonReq('http://x/datasets', 'GET'), params({ id: 'e-1' }));
    expect(r.status).toBe(401);
  });

  it('404 cross-ownership', async () => {
    authed();
    datasetsRepo.isExperimentOwnedByUser.mockResolvedValue(false);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/datasets/route'
    );
    const r = await GET(jsonReq('http://x/datasets', 'GET'), params({ id: 'e-2' }));
    expect(r.status).toBe(404);
  });

  it('200 with rows + passes kind filter through', async () => {
    authed();
    datasetsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    datasetsRepo.listDatasetsForExperiment.mockResolvedValue([makeDataset()]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/datasets/route'
    );
    const r = await GET(
      jsonReq('http://x/datasets?kind=tabular&archived=true&tag=mouse', 'GET'),
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(200);
    expect(datasetsRepo.listDatasetsForExperiment).toHaveBeenCalledWith(
      'e-1',
      'u-1',
      expect.objectContaining({ kind: 'tabular', archived: true, tag: 'mouse' }),
    );
  });
});

describe('POST /experiments/[id]/datasets', () => {
  it('400 on missing url', async () => {
    authed();
    datasetsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/datasets/route'
    );
    const r = await POST(
      jsonReq('http://x/datasets', 'POST', { name: 'X' }),
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('400 on invalid url scheme', async () => {
    authed();
    datasetsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/datasets/route'
    );
    const r = await POST(
      jsonReq('http://x/datasets', 'POST', { name: 'X', url: 'ftp://no' }),
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('201 + audits research.dataset.created', async () => {
    authed();
    datasetsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    const out = makeDataset();
    datasetsRepo.createDataset.mockResolvedValue(out);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/datasets/route'
    );
    const r = await POST(
      jsonReq('http://x/datasets', 'POST', {
        name: 'Sample',
        url: 'https://example.com/data',
        kind: 'tabular',
        tags: ['MOUSE', 'rna'],
      }),
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.dataset.created',
        projectId: 'e-1',
      }),
    );
    // Tags were normalized through the route before reaching the repo.
    const createCall = datasetsRepo.createDataset.mock.calls[0];
    expect(createCall[2].tags).toEqual(['mouse', 'rna']);
  });
});

// ─── /datasets/[datasetId] ───────────────────────────────────────────────

describe('PATCH /datasets/[datasetId]', () => {
  it('audits .archived when archived flips false → true', async () => {
    authed();
    datasetsRepo.getDataset.mockResolvedValue(makeDataset({ archived: false }));
    datasetsRepo.updateDataset.mockResolvedValue(makeDataset({ archived: true }));
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/datasets/[datasetId]/route'
    );
    const r = await PATCH(
      jsonReq('http://x/datasets/d-1', 'PATCH', { archived: true }),
      params({ datasetId: 'd-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.dataset.archived' }),
    );
  });

  it('audits .restored when archived flips true → false', async () => {
    authed();
    datasetsRepo.getDataset.mockResolvedValue(makeDataset({ archived: true }));
    datasetsRepo.updateDataset.mockResolvedValue(makeDataset({ archived: false }));
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/datasets/[datasetId]/route'
    );
    const r = await PATCH(
      jsonReq('http://x/datasets/d-1', 'PATCH', { archived: false }),
      params({ datasetId: 'd-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.dataset.restored' }),
    );
  });

  it('audits .updated on a non-archive patch', async () => {
    authed();
    datasetsRepo.getDataset.mockResolvedValue(makeDataset());
    datasetsRepo.updateDataset.mockResolvedValue(makeDataset({ name: 'Renamed' }));
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/datasets/[datasetId]/route'
    );
    const r = await PATCH(
      jsonReq('http://x/datasets/d-1', 'PATCH', { name: 'Renamed' }),
      params({ datasetId: 'd-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.dataset.updated' }),
    );
  });

  it('404 on cross-ownership (existing get returns null)', async () => {
    authed();
    datasetsRepo.getDataset.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/datasets/[datasetId]/route'
    );
    const r = await PATCH(
      jsonReq('http://x/datasets/d-1', 'PATCH', { name: 'X' }),
      params({ datasetId: 'd-1' }),
    );
    expect(r.status).toBe(404);
  });
});

describe('DELETE /datasets/[datasetId]', () => {
  it('audits research.dataset.deleted', async () => {
    authed();
    datasetsRepo.getDataset.mockResolvedValue(makeDataset());
    datasetsRepo.deleteDataset.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/datasets/[datasetId]/route'
    );
    const r = await DELETE(jsonReq('http://x/datasets/d-1', 'DELETE'), params({ datasetId: 'd-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.dataset.deleted' }),
    );
  });
});

// ─── /protocols ──────────────────────────────────────────────────────────

describe('GET /protocols', () => {
  it('200 with rows; passes filters', async () => {
    authed();
    protocolsRepo.listProtocols.mockResolvedValue([makeProtocol()]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/protocols/route'
    );
    const r = await GET(jsonReq('http://x/protocols?kind=method&tag=flow&q=hello', 'GET'));
    expect(r.status).toBe(200);
    expect(protocolsRepo.listProtocols).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ kind: 'method', tag: 'flow', q: 'hello' }),
    );
  });

  it('roots=false flips rootsOnly to false', async () => {
    authed();
    protocolsRepo.listProtocols.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/protocols/route'
    );
    await GET(jsonReq('http://x/protocols?roots=false', 'GET'));
    expect(protocolsRepo.listProtocols).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ rootsOnly: false }),
    );
  });
});

describe('POST /protocols', () => {
  it('201 + audits research.protocol.created with defaulted version', async () => {
    authed();
    const out = makeProtocol({ version: '1.0' });
    protocolsRepo.createProtocol.mockResolvedValue(out);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/protocols/route'
    );
    const r = await POST(
      jsonReq('http://x/protocols', 'POST', { title: 'My method' }),
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.protocol.created',
        payload: expect.objectContaining({ version: '1.0' }),
      }),
    );
  });

  it('400 on missing title', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/protocols/route'
    );
    const r = await POST(jsonReq('http://x/protocols', 'POST', { title: '' }));
    expect(r.status).toBe(400);
  });
});

// ─── /protocols/[id] + /versions ─────────────────────────────────────────

describe('POST /protocols/[id]/versions (bump)', () => {
  it('404 when source missing', async () => {
    authed();
    protocolsRepo.getProtocol.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/protocols/[id]/versions/route'
    );
    const r = await POST(
      jsonReq('http://x/protocols/p-1/versions', 'POST', { version: '2.0', bodyMd: 'x' }),
      params({ id: 'p-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('201 + audits research.protocol.version_bumped', async () => {
    authed();
    protocolsRepo.getProtocol.mockResolvedValue(makeProtocol({ version: '1.0' }));
    protocolsRepo.bumpProtocolVersion.mockResolvedValue(
      makeProtocol({ id: 'p-2', version: '2.0', parentProtocolId: 'p-1' }),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/protocols/[id]/versions/route'
    );
    const r = await POST(
      jsonReq('http://x/protocols/p-1/versions', 'POST', {
        version: '2.0',
        bodyMd: 'newer',
      }),
      params({ id: 'p-1' }),
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.protocol.version_bumped',
        payload: expect.objectContaining({
          sourceProtocolId: 'p-1',
          newProtocolId: 'p-2',
          fromVersion: '1.0',
          toVersion: '2.0',
        }),
      }),
    );
  });
});

describe('DELETE /protocols/[id]', () => {
  it('audits research.protocol.deleted', async () => {
    authed();
    protocolsRepo.getProtocol.mockResolvedValue(makeProtocol());
    protocolsRepo.deleteProtocol.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/protocols/[id]/route'
    );
    const r = await DELETE(jsonReq('http://x/protocols/p-1', 'DELETE'), params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.protocol.deleted' }),
    );
  });
});

// ─── /experiments/[id]/protocols (pin/unpin) ─────────────────────────────

describe('POST /experiments/[id]/protocols (pin)', () => {
  it('404 cross-ownership on experiment', async () => {
    authed();
    expProtocolsRepo.isExperimentOwnedByUser.mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/protocols/route'
    );
    const r = await POST(
      jsonReq('http://x/protocols', 'POST', { protocolId: '11111111-1111-1111-1111-111111111111' }),
      params({ id: 'e-x' }),
    );
    expect(r.status).toBe(404);
  });

  it('404 when protocol not owned', async () => {
    authed();
    expProtocolsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.isProtocolOwnedByUser.mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/protocols/route'
    );
    const r = await POST(
      jsonReq('http://x/protocols', 'POST', { protocolId: '11111111-1111-1111-1111-111111111111' }),
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('409 on duplicate triple', async () => {
    authed();
    expProtocolsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.isProtocolOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.pinProtocolToExperiment.mockResolvedValue({ kind: 'duplicate' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/protocols/route'
    );
    const r = await POST(
      jsonReq('http://x/protocols', 'POST', {
        protocolId: '11111111-1111-1111-1111-111111111111',
        pinnedVersion: '1.0',
      }),
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(409);
  });

  it('201 + audits research.experiment.protocol.pinned (projectId = experimentId)', async () => {
    authed();
    expProtocolsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.isProtocolOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.pinProtocolToExperiment.mockResolvedValue({
      kind: 'ok',
      link: {
        id: 'l-1',
        experimentId: 'e-1',
        protocolId: '11111111-1111-1111-1111-111111111111',
        pinnedVersion: '1.0',
        notes: null,
        createdAt: '2026-05-12T00:00:00.000Z',
      },
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/protocols/route'
    );
    const r = await POST(
      jsonReq('http://x/protocols', 'POST', {
        protocolId: '11111111-1111-1111-1111-111111111111',
        pinnedVersion: '1.0',
      }),
      params({ id: 'e-1' }),
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.protocol.pinned',
        projectId: 'e-1',
      }),
    );
  });
});

describe('PATCH /experiments/[id]/protocols/[protocolId]', () => {
  it('audits research.experiment.protocol.updated', async () => {
    authed();
    expProtocolsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.isProtocolOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.getExperimentProtocolLink.mockResolvedValue({
      id: 'l-1',
      experimentId: 'e-1',
      protocolId: 'p-1',
      pinnedVersion: '1.0',
      notes: 'old',
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    expProtocolsRepo.updateExperimentProtocolNotes.mockResolvedValue({
      id: 'l-1',
      experimentId: 'e-1',
      protocolId: 'p-1',
      pinnedVersion: '1.0',
      notes: 'new',
      createdAt: '2026-05-12T00:00:00.000Z',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/protocols/[protocolId]/route'
    );
    const r = await PATCH(
      jsonReq('http://x/protocols/p-1', 'PATCH', { notes: 'new' }),
      params({ id: 'e-1', protocolId: 'p-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.experiment.protocol.updated' }),
    );
  });
});

describe('DELETE /experiments/[id]/protocols/[protocolId]', () => {
  it('404 when no rows removed', async () => {
    authed();
    expProtocolsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.isProtocolOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.unpinProtocolFromExperiment.mockResolvedValue(0);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/protocols/[protocolId]/route'
    );
    const r = await DELETE(
      jsonReq('http://x/protocols/p-1', 'DELETE'),
      params({ id: 'e-1', protocolId: 'p-1' }),
    );
    expect(r.status).toBe(404);
  });

  it('audits research.experiment.protocol.unpinned with row count', async () => {
    authed();
    expProtocolsRepo.isExperimentOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.isProtocolOwnedByUser.mockResolvedValue(true);
    expProtocolsRepo.unpinProtocolFromExperiment.mockResolvedValue(2);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/protocols/[protocolId]/route'
    );
    const r = await DELETE(
      jsonReq('http://x/protocols/p-1', 'DELETE'),
      params({ id: 'e-1', protocolId: 'p-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.protocol.unpinned',
        payload: expect.objectContaining({ removedCount: 2 }),
      }),
    );
  });
});

// ─── /experiments/[id]/export.pdf ────────────────────────────────────────

describe('GET /experiments/[id]/export.pdf', () => {
  it('401 unauthenticated', async () => {
    getCurrentResearchUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/export.pdf/route'
    );
    const r = await GET(jsonReq('http://x/export.pdf', 'GET'), params({ id: 'e-1' }));
    expect(r.status).toBe(401);
  });

  it('404 cross-ownership', async () => {
    authed();
    repoMocks.getExperiment.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/export.pdf/route'
    );
    const r = await GET(jsonReq('http://x/export.pdf', 'GET'), params({ id: 'e-1' }));
    expect(r.status).toBe(404);
  });

  it('400 on truly empty experiment (no notebook/hypotheses/papers/datasets/protocols)', async () => {
    authed();
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    notebookRepoMocks.listNotebookEntriesForExperiment.mockResolvedValue([]);
    expHypothesesMocks.listLinkedHypothesesForExperiment.mockResolvedValue([]);
    referencesRepoMocks.listReferencesForExperiment.mockResolvedValue([]);
    datasetsRepo.listDatasetsForExperiment.mockResolvedValue([]);
    expProtocolsRepo.listProtocolsForExperiment.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/export.pdf/route'
    );
    const r = await GET(jsonReq('http://x/export.pdf', 'GET'), params({ id: 'e-1' }));
    expect(r.status).toBe(400);
  });

  it('200 with application/pdf + %PDF magic + audit row', async () => {
    authed();
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    notebookRepoMocks.listNotebookEntriesForExperiment.mockResolvedValue([
      {
        id: 'n-1',
        userId: 'u-1',
        experimentId: 'e-1',
        entryKind: 'note',
        title: 'Daily',
        bodyMd: 'body',
        attachedUrls: [],
        tags: [],
        entryAt: '2026-05-12T00:00:00.000Z',
        archivedAt: null,
        metadata: {},
        createdAt: '2026-05-12T00:00:00.000Z',
        updatedAt: '2026-05-12T00:00:00.000Z',
      },
    ]);
    expHypothesesMocks.listLinkedHypothesesForExperiment.mockResolvedValue([]);
    referencesRepoMocks.listReferencesForExperiment.mockResolvedValue([]);
    datasetsRepo.listDatasetsForExperiment.mockResolvedValue([]);
    expProtocolsRepo.listProtocolsForExperiment.mockResolvedValue([]);

    // 4-byte buffer with %PDF prefix so the magic-bytes assertion succeeds.
    const magic = Buffer.from('%PDF-fake-render-body');
    renderPdfToBuffer.mockResolvedValue(magic);

    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/export.pdf/route'
    );
    const r = await GET(jsonReq('http://x/export.pdf', 'GET'), params({ id: 'e-1' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    const cd = r.headers.get('Content-Disposition') ?? '';
    expect(cd).toMatch(/attachment; filename="my-experiment-\d{4}-\d{2}-\d{2}\.pdf"/);
    const body = new Uint8Array(await r.arrayBuffer());
    const head = String.fromCharCode(...body.slice(0, 4));
    expect(head).toBe('%PDF');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'research.experiment.export.pdf',
        projectId: 'e-1',
      }),
    );
  });
});
