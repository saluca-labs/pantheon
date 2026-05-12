/**
 * Research OS Phase 3 — hypothesis-falsifier domain types.
 *
 * Falsifiers are pre-registered observations or thresholds that would
 * refute the hypothesis if observed. Keeping the falsifier explicit at
 * the time the hypothesis is formed enforces Popperian rigor — the
 * researcher commits to what would change their mind BEFORE running the
 * experiment.
 *
 * `text` is the headline claim ("If we see X..."); `criterion_md` is the
 * quantitative gate (markdown, optional).
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

export interface Falsifier {
  id: string;
  hypothesisId: string;
  userId: string;
  text: string;
  /** Optional quantitative threshold or condition (markdown). */
  criterionMd: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFalsifierInput {
  text: string;
  criterionMd?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateFalsifierInput {
  text?: string;
  criterionMd?: string | null;
  metadata?: Record<string, unknown>;
}
