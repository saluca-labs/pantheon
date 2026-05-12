/**
 * Research OS Phase 4 — experiment-reference (experiment ↔ paper) types.
 *
 * Relevance is a small enum capturing why an experiment cites a paper:
 *   - cites        — generic citation.
 *   - methods      — borrowed methodology.
 *   - prior_art    — establishes prior art.
 *   - contradicts  — the experiment contradicts the paper's finding.
 *   - builds_on    — the experiment extends the paper's finding.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import type { Paper } from './papers';

export const REFERENCE_RELEVANCES = [
  'cites',
  'methods',
  'prior_art',
  'contradicts',
  'builds_on',
] as const;

export type ReferenceRelevance = (typeof REFERENCE_RELEVANCES)[number];

export const REFERENCE_RELEVANCE_LABELS: Record<ReferenceRelevance, string> = {
  cites: 'Cites',
  methods: 'Methods',
  prior_art: 'Prior art',
  contradicts: 'Contradicts',
  builds_on: 'Builds on',
};

export const REFERENCE_RELEVANCE_DESCRIPTIONS: Record<ReferenceRelevance, string> = {
  cites: 'Generic citation.',
  methods: 'Borrows methodology from this paper.',
  prior_art: 'Establishes prior art for the question.',
  contradicts: 'Experiment contradicts this paper\'s finding.',
  builds_on: 'Experiment extends this paper\'s finding.',
};

export interface ExperimentReferenceLink {
  id: string;
  experimentId: string;
  paperId: string;
  relevance: ReferenceRelevance;
  notes: string | null;
  createdAt: string;
}

export interface LinkedPaperReference {
  link: ExperimentReferenceLink;
  paper: Paper;
}

export interface CreateReferenceInput {
  paperId: string;
  relevance?: ReferenceRelevance;
  notes?: string | null;
}

export interface UpdateReferenceInput {
  relevance?: ReferenceRelevance;
  notes?: string | null;
}

export function asReferenceRelevance(value: unknown): ReferenceRelevance | null {
  if (typeof value !== 'string') return null;
  return (REFERENCE_RELEVANCES as readonly string[]).includes(value)
    ? (value as ReferenceRelevance)
    : null;
}
