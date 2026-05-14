/**
 * Autobiographer OS — Privacy review summary helpers (Wave D).
 *
 * Pure, presentation-layer helpers that derive the per-step readiness
 * of the guided privacy review wizard from data the privacy page
 * already loads (people roster + pseudonym rows + grouped review
 * checks). No new API routes or DB queries — this only summarizes.
 *
 * The wizard's three working steps map to the three existing privacy
 * panels; a fourth "summary" step uses these helpers to tell the
 * author whether the book is ready to lock + export.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import {
  consentIsPublishable,
  type ConsentState,
} from './people';
import {
  REQUIRED_BASE_CHECKS,
  SATISFIED_STATUSES,
  type ReviewCheckKind,
  type ReviewCheckStatus,
} from './review-checks';

/** Per-step status used to colour the wizard's step rail. */
export type WizardStepStatus = 'complete' | 'attention' | 'empty';

export interface PeopleStepInput {
  consentStates: ConsentState[];
}

/**
 * People & consent step: complete when every referenced person has a
 * publishable consent state; `attention` when at least one is blocking
 * (pending / withheld); `empty` when no people are referenced.
 */
export function summarizePeopleStep({
  consentStates,
}: PeopleStepInput): {
  status: WizardStepStatus;
  total: number;
  blocking: number;
} {
  const total = consentStates.length;
  if (total === 0) return { status: 'empty', total: 0, blocking: 0 };
  const blocking = consentStates.filter(
    (s) => !consentIsPublishable(s),
  ).length;
  return {
    status: blocking > 0 ? 'attention' : 'complete',
    total,
    blocking,
  };
}

export interface PseudonymStepInput {
  /** One entry per referenced person: whether a pseudonym is applied. */
  applied: boolean[];
}

/**
 * Pseudonym map step: this step is advisory — not every person needs a
 * pseudonym — so it reports `complete` whenever there are people to
 * review (the author decides who to rename), and `empty` otherwise.
 */
export function summarizePseudonymStep({
  applied,
}: PseudonymStepInput): {
  status: WizardStepStatus;
  total: number;
  appliedCount: number;
} {
  const total = applied.length;
  if (total === 0) return { status: 'empty', total: 0, appliedCount: 0 };
  return {
    status: 'complete',
    total,
    appliedCount: applied.filter(Boolean).length,
  };
}

export interface ChecklistStepCheck {
  kind: ReviewCheckKind;
  status: ReviewCheckStatus;
}

export interface ChecklistStepChapter {
  hasSensitiveContent: boolean;
  checks: ChecklistStepCheck[];
}

export interface ChecklistStepInput {
  bookLevelChecks: ChecklistStepCheck[];
  chapters: ChecklistStepChapter[];
}

/**
 * Review checklist step: `complete` when every required check across
 * the book — base checks per chapter, plus `sensitive_flagged` on
 * chapters with sensitive content — is in a satisfied status (passed /
 * waived). `attention` when at least one required check is unsatisfied.
 * `empty` when the book has no chapters.
 */
export function summarizeChecklistStep({
  chapters,
}: ChecklistStepInput): {
  status: WizardStepStatus;
  requiredTotal: number;
  requiredSatisfied: number;
} {
  if (chapters.length === 0) {
    return { status: 'empty', requiredTotal: 0, requiredSatisfied: 0 };
  }

  let requiredTotal = 0;
  let requiredSatisfied = 0;

  for (const chapter of chapters) {
    const required: ReviewCheckKind[] = [...REQUIRED_BASE_CHECKS];
    if (chapter.hasSensitiveContent) required.push('sensitive_flagged');

    const byKind = new Map(chapter.checks.map((c) => [c.kind, c.status]));
    for (const kind of required) {
      requiredTotal++;
      const status = byKind.get(kind);
      if (
        status &&
        (SATISFIED_STATUSES as readonly string[]).includes(status)
      ) {
        requiredSatisfied++;
      }
    }
  }

  return {
    status:
      requiredSatisfied >= requiredTotal && requiredTotal > 0
        ? 'complete'
        : 'attention',
    requiredTotal,
    requiredSatisfied,
  };
}

/**
 * Overall gate: the book is ready to lock + export only when the
 * people step and the checklist step are both `complete`. The
 * pseudonym step is advisory and never blocks.
 */
export function privacyReviewIsReady(
  people: WizardStepStatus,
  checklist: WizardStepStatus,
): boolean {
  return people === 'complete' && checklist === 'complete';
}
