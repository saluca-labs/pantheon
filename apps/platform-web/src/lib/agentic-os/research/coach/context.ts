/**
 * Research OS coach — per-mode context snapshot.
 *
 * Loads a compact, current-state view for one session. The shape varies
 * by mode so the model isn't given a full workshop dump every turn:
 *
 *   - lit_reviewer (experiment optional): user's 30 most recent papers
 *     + (if experiment scoped) experiment ↔ paper reference links +
 *     prior-art references workshop-wide.
 *   - hypothesis_critic (experiment optional): user's hypotheses with
 *     predictions, falsifiers, recent evidence; if experiment scoped,
 *     filter to hypotheses linked to that experiment.
 *   - methods_advisor (experiment REQUIRED): experiment meta + linked
 *     protocols (first 1KB of body_md) + datasets summary +
 *     reproducibility item states.
 *   - general (experiment optional): workshop counts only +
 *     experiment meta if scoped.
 *
 * Workshop-scoped sessions (no `experimentId`) load a slimmer "across
 * the research workshop" view. The size cap (`MAX_CONTEXT_BYTES`) is
 * enforced after rendering to JSON so a pathological tag/notes payload
 * can't blow the model's context window.
 *
 * Mode-specific truncation priority (lowest-priority dropped first):
 *   - lit_reviewer: drop oldest papers → drop prior_art refs → drop
 *     experiment refs.
 *   - hypothesis_critic: drop oldest evidence → drop falsifier criterion
 *     detail → drop hypothesis description_md.
 *   - methods_advisor: drop reproducibility notes → drop dataset
 *     metadata → drop oldest protocol bodies → truncate experiment
 *     description_md.
 *   - general: stays minimal — never exceeds.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import 'server-only';
import { getExperiment, listExperimentsForUser, listHypotheses } from '../repo';
import type { ResearchExperiment } from '../repo';
import { listPapers } from '../papers-repo';
import type { Paper } from '../papers';
import type { Hypothesis } from '../hypotheses';
import { listPredictionsForHypothesis } from '../predictions-repo';
import type { Prediction } from '../predictions';
import { listFalsifiersForHypothesis } from '../falsifiers-repo';
import type { Falsifier } from '../falsifiers';
import { listEvidenceForHypothesis } from '../evidence-repo';
import type { Evidence } from '../evidence';
import { listReferencesForExperiment } from '../experiment-references-repo';
import type { LinkedPaperReference } from '../experiment-references';
import { listLinkedHypothesesForExperiment } from '../experiment-hypotheses-repo';
import type { LinkedHypothesis } from '../experiment-hypotheses';
import { listProtocolsForExperiment } from '../experiment-protocols-repo';
import type { LinkedProtocolPin } from '../experiment-protocols';
import { listDatasetsForExperiment } from '../datasets-repo';
import type { Dataset } from '../datasets';
import { listReproChecksForExperiment } from '../reproducibility-repo';
import type { ReproCheck } from '../reproducibility';
import type { CoachMode } from './modes';

/** Hard cap on the rendered JSON size (50 KB pre-prompt). Truncate beyond. */
export const MAX_CONTEXT_BYTES = 50_000;

/** Default cap on recent papers surfaced in lit_reviewer mode. */
export const LIT_REVIEWER_PAPER_LIMIT = 30;

/** Default cap on recent evidence rows surfaced in hypothesis_critic mode. */
export const HYPOTHESIS_CRITIC_EVIDENCE_LIMIT = 20;

// ─── Shared shape ────────────────────────────────────────────────────────

export interface CoachContextExperimentSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  target_completion_date: string | null;
  phase_progress_avg: number;
}

export interface CoachContextPaperEntry {
  id: string;
  title: string;
  authors_text: string | null;
  year: number | null;
  kind: string;
  tags: string[];
  abstract_snippet: string;
}

export interface CoachContextExperimentReferenceEntry {
  paper_id: string;
  paper_title: string;
  relevance: string;
  notes: string | null;
}

export interface CoachContextHypothesisEntry {
  id: string;
  title: string;
  if_clause: string;
  then_clause: string;
  because_clause: string;
  status: string;
  confidence: string;
  tags: string[];
  description_snippet: string;
  predictions: CoachContextPredictionEntry[];
  falsifiers: CoachContextFalsifierEntry[];
}

export interface CoachContextPredictionEntry {
  id: string;
  text: string;
  kind: string;
  confidence: string;
}

export interface CoachContextFalsifierEntry {
  id: string;
  text: string;
  /** Truncated to 200 chars; null when the underlying criterion is empty. */
  criterion_snippet: string | null;
}

export interface CoachContextEvidenceEntry {
  id: string;
  hypothesis_id: string;
  polarity: string;
  source_kind: string;
  notes_snippet: string | null;
  created_at: string;
}

export interface CoachContextProtocolEntry {
  protocol_id: string;
  title: string;
  pinned_version: string;
  kind: string;
  body_snippet: string;
}

export interface CoachContextDatasetEntry {
  id: string;
  name: string;
  kind: string;
  size_bytes: number | null;
  archived: boolean;
}

export interface CoachContextReproItemEntry {
  item_key: string;
  state: string;
}

// ─── Per-mode payloads ──────────────────────────────────────────────────

export interface CoachLitReviewerContext {
  experiment: CoachContextExperimentSummary | null;
  /** User's N most recent papers, newest first. */
  recent_papers: CoachContextPaperEntry[];
  /** Experiment ↔ paper reference links (only when experiment scoped). */
  experiment_references: CoachContextExperimentReferenceEntry[];
  /** Workshop-wide prior_art references across the user's experiments. */
  prior_art_refs: CoachContextExperimentReferenceEntry[];
}

export interface CoachHypothesisCriticContext {
  experiment: CoachContextExperimentSummary | null;
  hypotheses: CoachContextHypothesisEntry[];
  recent_evidence: CoachContextEvidenceEntry[];
}

export interface CoachMethodsAdvisorContext {
  experiment: CoachContextExperimentSummary;
  /** experiment.description_md truncated to 1 KB. */
  experiment_description: string;
  protocols: CoachContextProtocolEntry[];
  datasets: CoachContextDatasetEntry[];
  reproducibility: CoachContextReproItemEntry[];
}

export interface CoachGeneralContext {
  experiment: CoachContextExperimentSummary | null;
  counts: {
    experiments: number;
    hypotheses: number;
    papers: number;
  };
}

export type ResearchCoachContext =
  | { mode: 'lit_reviewer'; data: CoachLitReviewerContext }
  | { mode: 'hypothesis_critic'; data: CoachHypothesisCriticContext }
  | { mode: 'methods_advisor'; data: CoachMethodsAdvisorContext }
  | { mode: 'general'; data: CoachGeneralContext };

export interface BuildCoachContextInput {
  userId: string;
  mode: CoachMode;
  experimentId?: string | null;
}

// ─── Shape mappers ──────────────────────────────────────────────────────

function experimentSummary(
  e: ResearchExperiment,
): CoachContextExperimentSummary {
  const values = Object.values(e.phaseProgress ?? {}) as number[];
  const avg =
    values.length === 0
      ? 0
      : Math.round(values.reduce((acc, v) => acc + v, 0) / values.length);
  return {
    id: e.id,
    name: e.name,
    description: e.description ?? '',
    status: e.status,
    tags: e.tags,
    target_completion_date: e.targetCompletionDate,
    phase_progress_avg: avg,
  };
}

function paperEntry(p: Paper): CoachContextPaperEntry {
  const abstract = (p.abstractMd ?? '').trim();
  const snippet = abstract.length > 400 ? abstract.slice(0, 399) + '…' : abstract;
  return {
    id: p.id,
    title: p.title,
    authors_text: p.authorsText,
    year: p.year,
    kind: p.kind,
    tags: p.tags,
    abstract_snippet: snippet,
  };
}

function refEntry(
  r: LinkedPaperReference,
): CoachContextExperimentReferenceEntry {
  return {
    paper_id: r.paper.id,
    paper_title: r.paper.title,
    relevance: r.link.relevance,
    notes: r.link.notes,
  };
}

function predictionEntry(p: Prediction): CoachContextPredictionEntry {
  return {
    id: p.id,
    text: p.text,
    kind: p.kind,
    confidence: p.confidence,
  };
}

function falsifierEntry(f: Falsifier): CoachContextFalsifierEntry {
  const criterion = (f.criterionMd ?? '').trim();
  const snippet =
    criterion.length === 0
      ? null
      : criterion.length > 200
        ? criterion.slice(0, 199) + '…'
        : criterion;
  return {
    id: f.id,
    text: f.text,
    criterion_snippet: snippet,
  };
}

function hypothesisEntry(
  h: Hypothesis,
  predictions: Prediction[],
  falsifiers: Falsifier[],
): CoachContextHypothesisEntry {
  const desc = (h.descriptionMd ?? '').trim();
  const snippet = desc.length > 1024 ? desc.slice(0, 1023) + '…' : desc;
  return {
    id: h.id,
    title: h.title,
    if_clause: h.ifClause,
    then_clause: h.thenClause,
    because_clause: h.becauseClause,
    status: h.status,
    confidence: h.confidence,
    tags: h.tags,
    description_snippet: snippet,
    predictions: predictions.map(predictionEntry),
    falsifiers: falsifiers.map(falsifierEntry),
  };
}

function evidenceEntry(e: Evidence): CoachContextEvidenceEntry {
  const notes = (e.notes ?? '').trim();
  const snippet =
    notes.length === 0
      ? null
      : notes.length > 200
        ? notes.slice(0, 199) + '…'
        : notes;
  return {
    id: e.id,
    hypothesis_id: e.hypothesisId,
    polarity: e.polarity,
    source_kind: e.sourceKind,
    notes_snippet: snippet,
    created_at: e.createdAt,
  };
}

function protocolEntry(p: LinkedProtocolPin): CoachContextProtocolEntry {
  const body = (p.resolved.bodyMd ?? '').trim();
  const snippet = body.length > 1024 ? body.slice(0, 1023) + '…' : body;
  return {
    protocol_id: p.protocol.id,
    title: p.protocol.title,
    pinned_version: p.link.pinnedVersion,
    kind: p.protocol.kind,
    body_snippet: snippet,
  };
}

function datasetEntry(d: Dataset): CoachContextDatasetEntry {
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    size_bytes: d.sizeBytes,
    archived: !!d.archived,
  };
}

function reproItemEntry(r: ReproCheck): CoachContextReproItemEntry {
  return {
    item_key: r.itemKey,
    state: r.state,
  };
}

// ─── Mode-specific loaders ──────────────────────────────────────────────

async function loadLitReviewer(
  userId: string,
  experimentId: string | null,
): Promise<CoachLitReviewerContext> {
  const [experiment, papers] = await Promise.all([
    experimentId ? getExperiment(experimentId, userId) : Promise.resolve(null),
    listPapers(userId, { limit: LIT_REVIEWER_PAPER_LIMIT }),
  ]);

  let experimentRefs: LinkedPaperReference[] = [];
  if (experimentId && experiment) {
    experimentRefs = await listReferencesForExperiment(experimentId, userId);
  }

  // Workshop-wide prior_art refs: scan all of the user's experiments
  // for references whose relevance = 'prior_art'. Bounded to a small N
  // so the payload stays under cap.
  let priorArtRefs: LinkedPaperReference[] = [];
  try {
    const allExperiments = await listExperimentsForUser(userId, { limit: 50 });
    const slice = allExperiments.slice(0, 20);
    const batches = await Promise.all(
      slice.map((e) => listReferencesForExperiment(e.id, userId)),
    );
    const flat = batches.flat();
    priorArtRefs = flat.filter((r) => r.link.relevance === 'prior_art').slice(0, 20);
  } catch {
    priorArtRefs = [];
  }

  return {
    experiment: experiment ? experimentSummary(experiment) : null,
    recent_papers: papers.map(paperEntry),
    experiment_references: experimentRefs.map(refEntry),
    prior_art_refs: priorArtRefs.map(refEntry),
  };
}

async function loadHypothesisCritic(
  userId: string,
  experimentId: string | null,
): Promise<CoachHypothesisCriticContext> {
  const [experiment, allHypotheses] = await Promise.all([
    experimentId ? getExperiment(experimentId, userId) : Promise.resolve(null),
    listHypotheses(userId, { archived: false }),
  ]);

  // When experiment-scoped, narrow to hypotheses linked through the
  // Phase 3 join table.
  let scopedHypotheses = allHypotheses;
  if (experimentId && experiment) {
    const linked: LinkedHypothesis[] = await listLinkedHypothesesForExperiment(
      experimentId,
      userId,
    );
    const linkedIds = new Set(linked.map((l) => l.link.hypothesisId));
    scopedHypotheses = allHypotheses.filter((h) => linkedIds.has(h.id));
  }

  // Limit hypotheses to keep payload sane; the truncation pass drops more
  // if still over the cap.
  const cappedHypotheses = scopedHypotheses.slice(0, 30);

  const hypothesisEntries: CoachContextHypothesisEntry[] = [];
  const allEvidence: Evidence[] = [];
  for (const h of cappedHypotheses) {
    const [preds, fals, evs] = await Promise.all([
      listPredictionsForHypothesis(h.id, userId),
      listFalsifiersForHypothesis(h.id, userId),
      listEvidenceForHypothesis(h.id, userId),
    ]);
    hypothesisEntries.push(hypothesisEntry(h, preds, fals));
    allEvidence.push(...evs);
  }

  // Sort evidence newest first, cap.
  allEvidence.sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return 0;
  });
  const recentEvidence = allEvidence
    .slice(0, HYPOTHESIS_CRITIC_EVIDENCE_LIMIT)
    .map(evidenceEntry);

  return {
    experiment: experiment ? experimentSummary(experiment) : null,
    hypotheses: hypothesisEntries,
    recent_evidence: recentEvidence,
  };
}

async function loadMethodsAdvisor(
  userId: string,
  experimentId: string,
): Promise<CoachMethodsAdvisorContext> {
  const experiment = await getExperiment(experimentId, userId);
  if (!experiment) {
    throw new Error('Experiment not found or not owned by user');
  }
  const [protocols, datasets, repro] = await Promise.all([
    listProtocolsForExperiment(experimentId, userId),
    listDatasetsForExperiment(experimentId, userId, { limit: 200 }),
    listReproChecksForExperiment(experimentId, userId),
  ]);

  const description = (experiment.description ?? '').trim();
  const truncatedDescription =
    description.length > 1024 ? description.slice(0, 1023) + '…' : description;

  return {
    experiment: experimentSummary(experiment),
    experiment_description: truncatedDescription,
    protocols: protocols.map(protocolEntry),
    datasets: datasets.map(datasetEntry),
    reproducibility: repro.map(reproItemEntry),
  };
}

async function loadGeneral(
  userId: string,
  experimentId: string | null,
): Promise<CoachGeneralContext> {
  const [experiment, allExperiments, allHypotheses, allPapers] =
    await Promise.all([
      experimentId ? getExperiment(experimentId, userId) : Promise.resolve(null),
      listExperimentsForUser(userId, { limit: 200 }),
      listHypotheses(userId, { archived: false }),
      listPapers(userId, { limit: 500 }),
    ]);

  return {
    experiment: experiment ? experimentSummary(experiment) : null,
    counts: {
      experiments: allExperiments.length,
      hypotheses: allHypotheses.length,
      papers: allPapers.length,
    },
  };
}

// ─── Truncation ─────────────────────────────────────────────────────────

interface TruncationOutcome<T> {
  data: T;
  truncated: boolean;
}

function bytesOf(value: unknown): number {
  return JSON.stringify(value).length;
}

/**
 * Mode-shaped truncation: each mode has a documented "drop priority"
 * list. We walk it from lowest-priority to highest until the JSON
 * payload fits within `MAX_CONTEXT_BYTES`. Returns the (possibly
 * truncated) payload + a flag indicating whether any drop happened.
 *
 * Drop order per mode (see file docstring):
 *
 *   lit_reviewer:
 *     1. drop oldest recent_papers entries
 *     2. drop prior_art_refs
 *     3. drop experiment_references
 *
 *   hypothesis_critic:
 *     1. drop oldest recent_evidence entries
 *     2. drop falsifier criterion_snippet detail (keep falsifier text)
 *     3. drop hypothesis description_snippet (keep title + if/then/because)
 *
 *   methods_advisor:
 *     1. drop reproducibility notes (only item_key + state remain — they
 *        already do, so this is a no-op marker that we tried)
 *     2. drop dataset metadata (size_bytes + archived removed)
 *     3. drop oldest protocol body_snippet (keep title + version)
 *     4. truncate experiment_description harder
 *
 *   general:
 *     never exceeds; returns unchanged.
 */
export function truncateLitReviewer(
  data: CoachLitReviewerContext,
): TruncationOutcome<CoachLitReviewerContext> {
  let truncated = false;
  let working = data;
  // 1. Drop oldest (last in list) recent_papers one at a time.
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.recent_papers.length > 0
  ) {
    working = {
      ...working,
      recent_papers: working.recent_papers.slice(0, -1),
    };
    truncated = true;
  }
  // 2. Drop prior_art_refs.
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.prior_art_refs.length > 0
  ) {
    working = { ...working, prior_art_refs: [] };
    truncated = true;
  }
  // 3. Drop experiment_references.
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.experiment_references.length > 0
  ) {
    working = { ...working, experiment_references: [] };
    truncated = true;
  }
  return { data: working, truncated };
}

export function truncateHypothesisCritic(
  data: CoachHypothesisCriticContext,
): TruncationOutcome<CoachHypothesisCriticContext> {
  let truncated = false;
  let working = data;
  // 1. Drop oldest recent_evidence one at a time.
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.recent_evidence.length > 0
  ) {
    working = {
      ...working,
      recent_evidence: working.recent_evidence.slice(0, -1),
    };
    truncated = true;
  }
  // 2. Drop falsifier criterion_snippet detail across all hypotheses.
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.hypotheses.some((h) =>
      h.falsifiers.some((f) => f.criterion_snippet != null),
    )
  ) {
    working = {
      ...working,
      hypotheses: working.hypotheses.map((h) => ({
        ...h,
        falsifiers: h.falsifiers.map((f) => ({
          ...f,
          criterion_snippet: null,
        })),
      })),
    };
    truncated = true;
  }
  // 3. Drop hypothesis description_snippet detail across all hypotheses.
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.hypotheses.some((h) => h.description_snippet.length > 0)
  ) {
    working = {
      ...working,
      hypotheses: working.hypotheses.map((h) => ({
        ...h,
        description_snippet: '',
      })),
    };
    truncated = true;
  }
  // 4. As a final fallback, drop oldest hypotheses entirely.
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.hypotheses.length > 0
  ) {
    working = { ...working, hypotheses: working.hypotheses.slice(0, -1) };
    truncated = true;
  }
  return { data: working, truncated };
}

export function truncateMethodsAdvisor(
  data: CoachMethodsAdvisorContext,
): TruncationOutcome<CoachMethodsAdvisorContext> {
  let truncated = false;
  let working = data;
  // 1. Drop reproducibility notes (we don't currently surface notes —
  //    so check if a future state column expansion adds anything we
  //    can drop). Right now the entry shape is item_key + state only,
  //    which is already minimal. We mark `truncated=true` only if we
  //    proceed past this step, which means subsequent layers fired.
  //    (Step 1 is a documented no-op for the current data shape.)
  // 2. Drop dataset metadata (size_bytes + archived).
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.datasets.some((d) => d.size_bytes != null || d.archived)
  ) {
    working = {
      ...working,
      datasets: working.datasets.map((d) => ({
        ...d,
        size_bytes: null,
        archived: false,
      })),
    };
    truncated = true;
  }
  // 3. Drop oldest protocol body_snippet (highest-index first; keep
  //    title + version pin).
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.protocols.some((p) => p.body_snippet.length > 0)
  ) {
    const idx = (() => {
      for (let i = working.protocols.length - 1; i >= 0; i--) {
        if (working.protocols[i]!.body_snippet.length > 0) return i;
      }
      return -1;
    })();
    if (idx === -1) break;
    working = {
      ...working,
      protocols: working.protocols.map((p, i) =>
        i === idx ? { ...p, body_snippet: '' } : p,
      ),
    };
    truncated = true;
  }
  // 4. Truncate experiment_description harder (chop to 200 chars).
  if (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.experiment_description.length > 200
  ) {
    working = {
      ...working,
      experiment_description:
        working.experiment_description.slice(0, 199) + '…',
    };
    truncated = true;
  }
  // 5. Final fallback: drop datasets, then protocols.
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.datasets.length > 0
  ) {
    working = { ...working, datasets: working.datasets.slice(0, -1) };
    truncated = true;
  }
  while (
    bytesOf(working) > MAX_CONTEXT_BYTES &&
    working.protocols.length > 0
  ) {
    working = { ...working, protocols: working.protocols.slice(0, -1) };
    truncated = true;
  }
  return { data: working, truncated };
}

export function truncateGeneral(
  data: CoachGeneralContext,
): TruncationOutcome<CoachGeneralContext> {
  // Stats only — should never exceed 50 KB.
  return { data, truncated: false };
}

// ─── Entry point ────────────────────────────────────────────────────────

/**
 * Build the context payload for a single coach turn. Throws when the
 * caller passes an `experimentId` that doesn't belong to `userId`; the
 * route layer maps that to a 400. methods_advisor with no experimentId
 * also throws (route layer should pre-reject with 400 — this is a
 * defense-in-depth guard).
 */
export async function buildCoachContext(
  input: BuildCoachContextInput,
): Promise<{ context: ResearchCoachContext; truncated: boolean }> {
  switch (input.mode) {
    case 'lit_reviewer': {
      const data = await loadLitReviewer(
        input.userId,
        input.experimentId ?? null,
      );
      const out = truncateLitReviewer(data);
      return {
        context: { mode: 'lit_reviewer', data: out.data },
        truncated: out.truncated,
      };
    }
    case 'hypothesis_critic': {
      const data = await loadHypothesisCritic(
        input.userId,
        input.experimentId ?? null,
      );
      const out = truncateHypothesisCritic(data);
      return {
        context: { mode: 'hypothesis_critic', data: out.data },
        truncated: out.truncated,
      };
    }
    case 'methods_advisor': {
      if (!input.experimentId) {
        throw new Error('methods_advisor requires an experimentId');
      }
      const data = await loadMethodsAdvisor(input.userId, input.experimentId);
      const out = truncateMethodsAdvisor(data);
      return {
        context: { mode: 'methods_advisor', data: out.data },
        truncated: out.truncated,
      };
    }
    case 'general': {
      const data = await loadGeneral(
        input.userId,
        input.experimentId ?? null,
      );
      const out = truncateGeneral(data);
      return {
        context: { mode: 'general', data: out.data },
        truncated: out.truncated,
      };
    }
  }
}
