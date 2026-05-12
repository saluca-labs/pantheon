/**
 * Research OS Phase 3 — hypothesis-prediction domain types.
 *
 * Predictions are forward-looking statements attached to a hypothesis:
 * what we expect to observe IF the hypothesis holds. Each carries a kind
 * (positive / negative / magnitude / direction) and an independent
 * confidence label (low / medium / high — same enum the hypothesis
 * itself uses).
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import type { ConfidenceLevel } from './hypotheses';

export const PREDICTION_KINDS = ['positive', 'negative', 'magnitude', 'direction'] as const;
export type PredictionKind = (typeof PREDICTION_KINDS)[number];

export const PREDICTION_KIND_LABELS: Record<PredictionKind, string> = {
  positive: 'Positive',
  negative: 'Negative',
  magnitude: 'Magnitude',
  direction: 'Direction',
};

export const PREDICTION_KIND_DESCRIPTIONS: Record<PredictionKind, string> = {
  positive: 'Effect expected in the predicted direction.',
  negative: 'No effect / null prediction.',
  magnitude: 'Specific quantitative magnitude expected.',
  direction: 'Sign or direction of effect only (no magnitude claim).',
};

export interface Prediction {
  id: string;
  hypothesisId: string;
  userId: string;
  text: string;
  kind: PredictionKind;
  confidence: ConfidenceLevel;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePredictionInput {
  text: string;
  kind?: PredictionKind;
  confidence?: ConfidenceLevel;
  metadata?: Record<string, unknown>;
}

export interface UpdatePredictionInput {
  text?: string;
  kind?: PredictionKind;
  confidence?: ConfidenceLevel;
  metadata?: Record<string, unknown>;
}

/** Type guard — returns the typed value or null. */
export function asPredictionKind(value: unknown): PredictionKind | null {
  if (typeof value !== 'string') return null;
  return (PREDICTION_KINDS as readonly string[]).includes(value)
    ? (value as PredictionKind)
    : null;
}
