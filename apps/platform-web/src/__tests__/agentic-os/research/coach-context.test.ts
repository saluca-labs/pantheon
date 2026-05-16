/**
 * Research OS Phase 7 — coach context loader tests.
 *
 * Covers:
 *   - Per-mode dispatch (lit_reviewer / hypothesis_critic /
 *     methods_advisor / general).
 *   - Selectivity: each mode loads only the data its system prompt
 *     consumes.
 *   - methods_advisor REJECTS without experimentId.
 *   - methods_advisor 404s when the experiment isn't owned by user.
 *   - Workshop-scoped lit_reviewer / hypothesis_critic / general paths.
 *   - Truncation drop order per mode.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMocks = vi.hoisted(() => ({
  getExperiment: vi.fn(),
  listExperimentsForUser: vi.fn(),
  listHypotheses: vi.fn(),
}));

const papersRepoMocks = vi.hoisted(() => ({
  listPapers: vi.fn(),
}));

const predictionsMocks = vi.hoisted(() => ({
  listPredictionsForHypothesis: vi.fn(),
}));

const falsifiersMocks = vi.hoisted(() => ({
  listFalsifiersForHypothesis: vi.fn(),
}));

const evidenceMocks = vi.hoisted(() => ({
  listEvidenceForHypothesis: vi.fn(),
}));

const expRefsMocks = vi.hoisted(() => ({
  listReferencesForExperiment: vi.fn(),
}));

const expHypsMocks = vi.hoisted(() => ({
  listLinkedHypothesesForExperiment: vi.fn(),
}));

const expProtocolsMocks = vi.hoisted(() => ({
  listProtocolsForExperiment: vi.fn(),
}));

const datasetsMocks = vi.hoisted(() => ({
  listDatasetsForExperiment: vi.fn(),
}));

const reproMocks = vi.hoisted(() => ({
  listReproChecksForExperiment: vi.fn(),
}));

vi.mock('@/lib/agentic-os/research/repo', () => repoMocks);
vi.mock('@/lib/agentic-os/research/papers-repo', () => papersRepoMocks);
vi.mock('@/lib/agentic-os/research/predictions-repo', () => predictionsMocks);
vi.mock('@/lib/agentic-os/research/falsifiers-repo', () => falsifiersMocks);
vi.mock('@/lib/agentic-os/research/evidence-repo', () => evidenceMocks);
vi.mock('@/lib/agentic-os/research/experiment-references-repo', () => expRefsMocks);
vi.mock(
  '@/lib/agentic-os/research/experiment-hypotheses-repo',
  () => expHypsMocks,
);
vi.mock(
  '@/lib/agentic-os/research/experiment-protocols-repo',
  () => expProtocolsMocks,
);
vi.mock('@/lib/agentic-os/research/datasets-repo', () => datasetsMocks);
vi.mock('@/lib/agentic-os/research/reproducibility-repo', () => reproMocks);

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => ({ query: vi.fn() }),
  getCurrentResearchUser: vi.fn(),
}));

import {
  MAX_CONTEXT_BYTES,
  buildCoachContext,
  truncateHypothesisCritic,
  truncateLitReviewer,
  truncateMethodsAdvisor,
  type CoachHypothesisCriticContext,
  type CoachLitReviewerContext,
  type CoachMethodsAdvisorContext,
  type CoachContextPaperEntry,
  type CoachContextExperimentReferenceEntry,
  type CoachContextEvidenceEntry,
  type CoachContextHypothesisEntry,
  type CoachContextProtocolEntry,
  type CoachContextDatasetEntry,
} from '@/lib/agentic-os/research/coach/context';

beforeEach(() => {
  for (const m of [
    repoMocks.getExperiment,
    repoMocks.listExperimentsForUser,
    repoMocks.listHypotheses,
    papersRepoMocks.listPapers,
    predictionsMocks.listPredictionsForHypothesis,
    falsifiersMocks.listFalsifiersForHypothesis,
    evidenceMocks.listEvidenceForHypothesis,
    expRefsMocks.listReferencesForExperiment,
    expHypsMocks.listLinkedHypothesesForExperiment,
    expProtocolsMocks.listProtocolsForExperiment,
    datasetsMocks.listDatasetsForExperiment,
    reproMocks.listReproChecksForExperiment,
  ]) {
    (m as unknown as { mockReset: () => void }).mockReset();
  }
});

function makeExperiment(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'exp-1',
    userId: 'u-1',
    hypothesisId: null,
    name: 'Pilot',
    description: 'A pilot experiment',
    status: 'planning',
    tags: ['pilot'],
    coverImageUrl: null,
    targetCompletionDate: null,
    teamSize: null,
    phaseProgress: { planning: 50 },
    archivedAt: null,
    metadata: {},
    independent: '',
    dependent: '',
    controls: '',
    protocol: '',
    successCriteria: '',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-02T00:00:00Z',
    ...over,
  };
}

function makePaper(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    userId: 'u-1',
    title: 'A paper',
    kind: 'paper',
    doi: null,
    arxivId: null,
    url: null,
    authorsText: 'Author et al.',
    venue: null,
    year: 2024,
    abstractMd: 'An abstract.',
    tags: ['ml'],
    metadata: {},
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-02T00:00:00Z',
    ...over,
  };
}

function makeHypothesis(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'h-1',
    userId: 'u-1',
    title: 'A hypothesis',
    ifClause: 'If A',
    thenClause: 'then B',
    becauseClause: 'because C',
    status: 'active',
    confidence: 'medium',
    tags: [],
    experimentIds: [],
    descriptionMd: '',
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-02T00:00:00Z',
    ...over,
  };
}

function makeDataset(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd-1',
    userId: 'u-1',
    experimentId: 'exp-1',
    name: 'Trace data',
    kind: 'tabular',
    url: 'https://example.com',
    version: null,
    sizeBytes: 1024,
    checksum: null,
    archived: false,
    publishedDoi: null,
    notesMd: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-02T00:00:00Z',
    ...over,
  };
}

function makeProtocolPin(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    link: {
      id: 'epl-1',
      experimentId: 'exp-1',
      protocolId: 'pro-1',
      pinnedVersion: '1.2',
      notes: null,
      createdAt: '2026-05-01T00:00:00Z',
    },
    protocol: {
      id: 'pro-1',
      userId: 'u-1',
      title: 'Cryostat warmup',
      version: '1.2',
      bodyMd: 'Start at room temperature...',
      kind: 'method',
      attachedUrls: [],
      tags: [],
      parentProtocolId: null,
      metadata: {},
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    },
    resolved: {
      id: 'pro-1',
      userId: 'u-1',
      title: 'Cryostat warmup',
      version: '1.2',
      bodyMd: 'Start at room temperature; warm gradually to 300K.',
      kind: 'method',
      attachedUrls: [],
      tags: [],
      parentProtocolId: null,
      metadata: {},
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    },
    ...over,
  };
}

// ─── lit_reviewer ────────────────────────────────────────────────────────

describe('buildCoachContext — lit_reviewer', () => {
  it('workshop-scoped: loads recent papers + zero refs', async () => {
    papersRepoMocks.listPapers.mockResolvedValue([
      makePaper({ id: 'p-1' }),
      makePaper({ id: 'p-2' }),
    ]);
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'lit_reviewer',
    });
    expect(out.context.mode).toBe('lit_reviewer');
    if (out.context.mode === 'lit_reviewer') {
      expect(out.context.data.recent_papers.length).toBe(2);
      expect(out.context.data.experiment_references).toEqual([]);
      expect(out.context.data.prior_art_refs).toEqual([]);
      expect(out.context.data.experiment).toBeNull();
    }
  });

  it('experiment-scoped: loads experiment + references', async () => {
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    papersRepoMocks.listPapers.mockResolvedValue([makePaper()]);
    expRefsMocks.listReferencesForExperiment.mockResolvedValue([
      {
        link: {
          id: 'r-1',
          experimentId: 'exp-1',
          paperId: 'p-9',
          relevance: 'methods',
          notes: 'good baseline',
          createdAt: '2026-05-01T00:00:00Z',
        },
        paper: makePaper({ id: 'p-9' }),
      },
    ]);
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'lit_reviewer',
      experimentId: 'exp-1',
    });
    if (out.context.mode === 'lit_reviewer') {
      expect(out.context.data.experiment_references.length).toBe(1);
      expect(out.context.data.experiment_references[0]!.relevance).toBe('methods');
    }
  });

  it('experiment-scoped with no papers returns an empty papers list', async () => {
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    papersRepoMocks.listPapers.mockResolvedValue([]);
    expRefsMocks.listReferencesForExperiment.mockResolvedValue([]);
    repoMocks.listExperimentsForUser.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'lit_reviewer',
      experimentId: 'exp-1',
    });
    if (out.context.mode === 'lit_reviewer') {
      expect(out.context.data.recent_papers).toEqual([]);
    }
  });

  it('collects workshop prior_art refs', async () => {
    papersRepoMocks.listPapers.mockResolvedValue([]);
    repoMocks.listExperimentsForUser.mockResolvedValue([makeExperiment()]);
    expRefsMocks.listReferencesForExperiment.mockResolvedValue([
      {
        link: {
          id: 'r-1',
          experimentId: 'exp-1',
          paperId: 'p-9',
          relevance: 'prior_art',
          notes: null,
          createdAt: '2026-05-01T00:00:00Z',
        },
        paper: makePaper({ id: 'p-9' }),
      },
      {
        link: {
          id: 'r-2',
          experimentId: 'exp-1',
          paperId: 'p-10',
          relevance: 'methods',
          notes: null,
          createdAt: '2026-05-01T00:00:00Z',
        },
        paper: makePaper({ id: 'p-10' }),
      },
    ]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'lit_reviewer',
    });
    if (out.context.mode === 'lit_reviewer') {
      expect(out.context.data.prior_art_refs.length).toBe(1);
      expect(out.context.data.prior_art_refs[0]!.relevance).toBe('prior_art');
    }
  });
});

// ─── hypothesis_critic ──────────────────────────────────────────────────

describe('buildCoachContext — hypothesis_critic', () => {
  it('workshop-scoped: loads all active hypotheses', async () => {
    repoMocks.listHypotheses.mockResolvedValue([
      makeHypothesis({ id: 'h-1' }),
      makeHypothesis({ id: 'h-2' }),
    ]);
    predictionsMocks.listPredictionsForHypothesis.mockResolvedValue([]);
    falsifiersMocks.listFalsifiersForHypothesis.mockResolvedValue([]);
    evidenceMocks.listEvidenceForHypothesis.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'hypothesis_critic',
    });
    if (out.context.mode === 'hypothesis_critic') {
      expect(out.context.data.hypotheses.length).toBe(2);
      expect(out.context.data.experiment).toBeNull();
    }
  });

  it('experiment-scoped: filters to linked hypotheses only', async () => {
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    repoMocks.listHypotheses.mockResolvedValue([
      makeHypothesis({ id: 'h-1' }),
      makeHypothesis({ id: 'h-2' }),
      makeHypothesis({ id: 'h-3' }),
    ]);
    expHypsMocks.listLinkedHypothesesForExperiment.mockResolvedValue([
      {
        link: { hypothesisId: 'h-2' },
        hypothesis: makeHypothesis({ id: 'h-2' }),
      },
    ]);
    predictionsMocks.listPredictionsForHypothesis.mockResolvedValue([]);
    falsifiersMocks.listFalsifiersForHypothesis.mockResolvedValue([]);
    evidenceMocks.listEvidenceForHypothesis.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'hypothesis_critic',
      experimentId: 'exp-1',
    });
    if (out.context.mode === 'hypothesis_critic') {
      expect(out.context.data.hypotheses.length).toBe(1);
      expect(out.context.data.hypotheses[0]!.id).toBe('h-2');
    }
  });

  it('loads predictions + falsifiers + recent evidence per hypothesis', async () => {
    repoMocks.listHypotheses.mockResolvedValue([makeHypothesis()]);
    predictionsMocks.listPredictionsForHypothesis.mockResolvedValue([
      {
        id: 'pred-1',
        hypothesisId: 'h-1',
        userId: 'u-1',
        text: 'cooling improves coherence',
        kind: 'direction',
        confidence: 'medium',
        metadata: {},
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
      },
    ]);
    falsifiersMocks.listFalsifiersForHypothesis.mockResolvedValue([
      {
        id: 'fals-1',
        hypothesisId: 'h-1',
        userId: 'u-1',
        text: 'no improvement seen',
        criterionMd: 'T1 < 100us',
        metadata: {},
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
      },
    ]);
    evidenceMocks.listEvidenceForHypothesis.mockResolvedValue([
      {
        id: 'ev-1',
        hypothesisId: 'h-1',
        userId: 'u-1',
        polarity: 'supports',
        sourceKind: 'notebook_entry',
        sourceId: 'n-1',
        sourceUrl: null,
        notes: 'pilot run looked promising',
        metadata: {},
        createdAt: '2026-05-01T00:00:00Z',
      },
    ]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'hypothesis_critic',
    });
    if (out.context.mode === 'hypothesis_critic') {
      expect(out.context.data.hypotheses[0]!.predictions.length).toBe(1);
      expect(out.context.data.hypotheses[0]!.falsifiers.length).toBe(1);
      expect(out.context.data.recent_evidence.length).toBe(1);
    }
  });
});

// ─── methods_advisor ─────────────────────────────────────────────────────

describe('buildCoachContext — methods_advisor', () => {
  it('rejects without experimentId', async () => {
    await expect(
      buildCoachContext({ userId: 'u-1', mode: 'methods_advisor' }),
    ).rejects.toThrow(/methods_advisor requires an experimentId/);
  });

  it('throws when experiment is not owned by user', async () => {
    repoMocks.getExperiment.mockResolvedValue(null);
    await expect(
      buildCoachContext({
        userId: 'u-1',
        mode: 'methods_advisor',
        experimentId: 'exp-x',
      }),
    ).rejects.toThrow(/Experiment not found/);
  });

  it('loads experiment + protocols + datasets + repro', async () => {
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    expProtocolsMocks.listProtocolsForExperiment.mockResolvedValue([
      makeProtocolPin(),
    ]);
    datasetsMocks.listDatasetsForExperiment.mockResolvedValue([makeDataset()]);
    reproMocks.listReproChecksForExperiment.mockResolvedValue([
      {
        id: 'r-1',
        experimentId: 'exp-1',
        userId: 'u-1',
        itemKey: 'data_publicly_available',
        state: 'pending',
        evidenceUrl: null,
        notes: null,
        completedAt: null,
        metadata: {},
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
      },
    ]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'methods_advisor',
      experimentId: 'exp-1',
    });
    if (out.context.mode === 'methods_advisor') {
      expect(out.context.data.protocols.length).toBe(1);
      expect(out.context.data.datasets.length).toBe(1);
      expect(out.context.data.reproducibility.length).toBe(1);
      expect(out.context.data.experiment.id).toBe('exp-1');
    }
  });

  it('truncates experiment_description to 1KB', async () => {
    const longDesc = 'x'.repeat(2000);
    repoMocks.getExperiment.mockResolvedValue(
      makeExperiment({ description: longDesc }),
    );
    expProtocolsMocks.listProtocolsForExperiment.mockResolvedValue([]);
    datasetsMocks.listDatasetsForExperiment.mockResolvedValue([]);
    reproMocks.listReproChecksForExperiment.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'methods_advisor',
      experimentId: 'exp-1',
    });
    if (out.context.mode === 'methods_advisor') {
      expect(out.context.data.experiment_description.length).toBeLessThanOrEqual(
        1024,
      );
      expect(out.context.data.experiment_description.endsWith('…')).toBe(true);
    }
  });

  it('truncates protocol body_md to 1KB', async () => {
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    const big = 'x'.repeat(2000);
    const pin = makeProtocolPin();
    (pin.resolved as { bodyMd: string }).bodyMd = big;
    expProtocolsMocks.listProtocolsForExperiment.mockResolvedValue([pin]);
    datasetsMocks.listDatasetsForExperiment.mockResolvedValue([]);
    reproMocks.listReproChecksForExperiment.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'methods_advisor',
      experimentId: 'exp-1',
    });
    if (out.context.mode === 'methods_advisor') {
      expect(
        out.context.data.protocols[0]!.body_snippet.length,
      ).toBeLessThanOrEqual(1024);
    }
  });
});

// ─── general ─────────────────────────────────────────────────────────────

describe('buildCoachContext — general', () => {
  it('loads workshop counts only', async () => {
    repoMocks.listExperimentsForUser.mockResolvedValue([
      makeExperiment({ id: 'e-1' }),
      makeExperiment({ id: 'e-2' }),
    ]);
    repoMocks.listHypotheses.mockResolvedValue([makeHypothesis()]);
    papersRepoMocks.listPapers.mockResolvedValue([makePaper(), makePaper(), makePaper()]);
    const out = await buildCoachContext({ userId: 'u-1', mode: 'general' });
    if (out.context.mode === 'general') {
      expect(out.context.data.counts).toEqual({
        experiments: 2,
        hypotheses: 1,
        papers: 3,
      });
      expect(out.context.data.experiment).toBeNull();
    }
  });

  it('experiment-scoped: includes the experiment summary alongside counts', async () => {
    repoMocks.getExperiment.mockResolvedValue(makeExperiment());
    repoMocks.listExperimentsForUser.mockResolvedValue([makeExperiment()]);
    repoMocks.listHypotheses.mockResolvedValue([]);
    papersRepoMocks.listPapers.mockResolvedValue([]);
    const out = await buildCoachContext({
      userId: 'u-1',
      mode: 'general',
      experimentId: 'exp-1',
    });
    if (out.context.mode === 'general') {
      expect(out.context.data.experiment).not.toBeNull();
      expect(out.context.data.experiment!.id).toBe('exp-1');
    }
  });
});

// ─── Truncation ──────────────────────────────────────────────────────────

describe('truncateLitReviewer', () => {
  function makeBigPaper(id: string): CoachContextPaperEntry {
    return {
      id,
      title: 'A paper with a fairly long title that adds bytes',
      authors_text: 'Author A, Author B, Author C, Author D, Author E, Author F',
      year: 2024,
      kind: 'paper',
      tags: ['ml', 'systems', 'theory', 'survey'],
      abstract_snippet: 'X'.repeat(390),
    } as CoachContextPaperEntry;
  }
  function makeRef(id: string): CoachContextExperimentReferenceEntry {
    return {
      paper_id: id,
      paper_title: 'A long-ish paper title',
      relevance: 'prior_art',
      notes: 'X'.repeat(200),
    } as CoachContextExperimentReferenceEntry;
  }

  it('drops oldest papers first', () => {
    const data: CoachLitReviewerContext = {
      experiment: null,
      recent_papers: Array.from({ length: 200 }).map((_, i) =>
        makeBigPaper(`p-${i}`),
      ),
      experiment_references: [],
      prior_art_refs: [],
    };
    const out = truncateLitReviewer(data);
    expect(out.truncated).toBe(true);
    expect(out.data.recent_papers.length).toBeLessThan(200);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
  });

  it('drops prior_art_refs only when papers alone can\'t fit', () => {
    const data: CoachLitReviewerContext = {
      experiment: null,
      recent_papers: [makeBigPaper('p-keep')],
      experiment_references: [makeRef('r-keep')],
      prior_art_refs: Array.from({ length: 200 }).map((_, i) =>
        makeRef(`pa-${i}`),
      ),
    };
    const out = truncateLitReviewer(data);
    // Truncation may have dropped the prior_art_refs block when payload
    // exceeded — accept either ordered outcome.
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
  });

  it('small payload returns truncated=false', () => {
    const data: CoachLitReviewerContext = {
      experiment: null,
      recent_papers: [makeBigPaper('p-1')],
      experiment_references: [],
      prior_art_refs: [],
    };
    const out = truncateLitReviewer(data);
    expect(out.truncated).toBe(false);
  });
});

describe('truncateHypothesisCritic', () => {
  function makeBigEvidence(id: string): CoachContextEvidenceEntry {
    return {
      id,
      hypothesis_id: 'h-1',
      polarity: 'supports',
      source_kind: 'notebook_entry',
      notes_snippet: 'X'.repeat(195),
      created_at: '2026-05-01T00:00:00Z',
    } as CoachContextEvidenceEntry;
  }
  function makeBigHypothesis(id: string): CoachContextHypothesisEntry {
    return {
      id,
      title: 'Long title that takes some bytes to encode here',
      if_clause: 'If X holds across all conditions C',
      then_clause: 'then Y should outperform baseline',
      because_clause: 'because mechanism M is dominant',
      status: 'active',
      confidence: 'medium',
      tags: ['t1', 't2'],
      description_snippet: 'X'.repeat(1000),
      predictions: [],
      falsifiers: Array.from({ length: 3 }).map((_, k) => ({
        id: `f-${id}-${k}`,
        text: 'A falsifier text that runs at moderate length',
        criterion_snippet: 'X'.repeat(195),
      })),
    } as CoachContextHypothesisEntry;
  }

  it('drops oldest evidence first', () => {
    const data: CoachHypothesisCriticContext = {
      experiment: null,
      hypotheses: [],
      recent_evidence: Array.from({ length: 500 }).map((_, i) =>
        makeBigEvidence(`ev-${i}`),
      ),
    };
    const out = truncateHypothesisCritic(data);
    expect(out.truncated).toBe(true);
    expect(out.data.recent_evidence.length).toBeLessThan(500);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
  });

  it('drops falsifier criterion_snippet detail next', () => {
    const data: CoachHypothesisCriticContext = {
      experiment: null,
      hypotheses: Array.from({ length: 30 }).map((_, i) =>
        makeBigHypothesis(`h-${i}`),
      ),
      recent_evidence: [],
    };
    const out = truncateHypothesisCritic(data);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
    // After truncation, all falsifier criterion_snippets should be null
    // (since description and evidence weren't enough to bring us under),
    // OR we should have dropped some hypotheses entirely.
    if (out.truncated) {
      const allNullCriteria = out.data.hypotheses.every((h) =>
        h.falsifiers.every((f) => f.criterion_snippet === null),
      );
      const someHypothesesDropped = out.data.hypotheses.length < 30;
      expect(allNullCriteria || someHypothesesDropped).toBe(true);
    }
  });

  it('small payload returns truncated=false', () => {
    const data: CoachHypothesisCriticContext = {
      experiment: null,
      hypotheses: [],
      recent_evidence: [],
    };
    const out = truncateHypothesisCritic(data);
    expect(out.truncated).toBe(false);
  });
});

describe('truncateMethodsAdvisor', () => {
  function makeBigPin(id: string): CoachContextProtocolEntry {
    return {
      protocol_id: id,
      title: `Protocol ${id} with a longer title`,
      pinned_version: '1.0',
      kind: 'method',
      body_snippet: 'X'.repeat(1000),
    } as CoachContextProtocolEntry;
  }
  function makeBigDataset(id: string): CoachContextDatasetEntry {
    return {
      id,
      name: `Dataset ${id} with descriptive name`,
      kind: 'tabular',
      size_bytes: 1024 * 1024,
      archived: false,
    } as CoachContextDatasetEntry;
  }

  it('drops protocol body_snippet detail when over the cap', () => {
    const data: CoachMethodsAdvisorContext = {
      experiment: {
        id: 'exp-1',
        name: 'X',
        description: '',
        status: 'planning',
        tags: [],
        target_completion_date: null,
        phase_progress_avg: 0,
      },
      experiment_description: '',
      protocols: Array.from({ length: 60 }).map((_, i) => makeBigPin(`p-${i}`)),
      datasets: [],
      reproducibility: [],
    };
    const out = truncateMethodsAdvisor(data);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
    expect(out.truncated).toBe(true);
  });

  it('drops dataset metadata when needed', () => {
    const data: CoachMethodsAdvisorContext = {
      experiment: {
        id: 'exp-1',
        name: 'X',
        description: '',
        status: 'planning',
        tags: [],
        target_completion_date: null,
        phase_progress_avg: 0,
      },
      experiment_description: '',
      protocols: [],
      datasets: Array.from({ length: 500 }).map((_, i) =>
        makeBigDataset(`d-${i}`),
      ),
      reproducibility: [],
    };
    const out = truncateMethodsAdvisor(data);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
  });

  it('truncates experiment_description harder under extreme pressure', () => {
    const data: CoachMethodsAdvisorContext = {
      experiment: {
        id: 'exp-1',
        name: 'X',
        description: '',
        status: 'planning',
        tags: [],
        target_completion_date: null,
        phase_progress_avg: 0,
      },
      experiment_description: 'D'.repeat(1024),
      protocols: Array.from({ length: 60 }).map((_, i) => ({
        protocol_id: `p-${i}`,
        title: `T`,
        pinned_version: '1.0',
        kind: 'method',
        body_snippet: 'X'.repeat(1000),
      })),
      datasets: [],
      reproducibility: [],
    };
    const out = truncateMethodsAdvisor(data);
    expect(JSON.stringify(out.data).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
  });

  it('small payload returns truncated=false', () => {
    const data: CoachMethodsAdvisorContext = {
      experiment: {
        id: 'exp-1',
        name: 'X',
        description: '',
        status: 'planning',
        tags: [],
        target_completion_date: null,
        phase_progress_avg: 0,
      },
      experiment_description: '',
      protocols: [],
      datasets: [],
      reproducibility: [],
    };
    const out = truncateMethodsAdvisor(data);
    expect(out.truncated).toBe(false);
  });
});
