'use client';

/**
 * Autobiographer OS — PrivacyReviewWizard (Wave D).
 *
 * A guided multi-step privacy review flow for a single book. Wave C
 * stacked the three privacy panels — people roster, pseudonym map,
 * review checklist — on one long page. Wave D wraps them in a guided
 * wizard: a step rail with per-step readiness, prev/next navigation,
 * and a closing summary step that tells the author whether the book is
 * ready to lock + export.
 *
 * No capability is lost: every panel renders exactly as before, just
 * one step at a time, and the page still loads the same data. The
 * wizard adds the readiness summary on top.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListChecks,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  PrivacyPeoplePanel,
  type PrivacyPeoplePanelEntry,
} from './privacy-people-panel';
import {
  PseudonymMapPanel,
  type PseudonymMapPanelPerson,
} from './pseudonym-map-panel';
import {
  ReviewChecklistPanel,
  type ReviewChecklistCheck,
  type ReviewChecklistChapter,
} from './review-checklist-panel';
import {
  summarizePeopleStep,
  summarizePseudonymStep,
  summarizeChecklistStep,
  privacyReviewIsReady,
  type WizardStepStatus,
} from '@/lib/agentic-os/autobiographer/privacy-review';

export interface PrivacyReviewWizardProps {
  bookId: string;
  people: PrivacyPeoplePanelEntry[];
  pseudonymPeople: PseudonymMapPanelPerson[];
  bookLevelChecks: ReviewChecklistCheck[];
  chapters: ReviewChecklistChapter[];
}

type StepKey = 'people' | 'pseudonyms' | 'checklist' | 'summary';

const STEP_ORDER: StepKey[] = ['people', 'pseudonyms', 'checklist', 'summary'];

const STEP_META: Record<
  StepKey,
  { label: string; icon: typeof Users; blurb: string }
> = {
  people: {
    label: 'People & consent',
    icon: Users,
    blurb:
      'Confirm every person referenced in this book has a consent state on file. Pending or withheld consent blocks publication.',
  },
  pseudonyms: {
    label: 'Pseudonym map',
    icon: UserCheck,
    blurb:
      'Set replacement names for anyone who should not be named in the manuscript. This step is advisory — you decide who to rename.',
  },
  checklist: {
    label: 'Review checklist',
    icon: ListChecks,
    blurb:
      'Work the per-chapter checklist down to all-green. Required checks gate chapter lock and the final PDF export.',
  },
  summary: {
    label: 'Summary',
    icon: ShieldCheck,
    blurb:
      'A readiness snapshot for the whole book. Resolve anything flagged before locking chapters for export.',
  },
};

/** Small status dot for the step rail + summary rows. */
function StatusDot({ status }: { status: WizardStepStatus }) {
  if (status === 'complete') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  }
  if (status === 'attention') {
    return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  }
  return <Circle className="h-4 w-4 text-text-tertiary" />;
}

export function PrivacyReviewWizard({
  bookId,
  people,
  pseudonymPeople,
  bookLevelChecks,
  chapters,
}: PrivacyReviewWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEP_ORDER[stepIndex]!;

  // Per-step readiness, derived from the data the page already loaded.
  const peopleSummary = useMemo(
    () =>
      summarizePeopleStep({
        consentStates: people.map((p) => p.consentState),
      }),
    [people],
  );
  const pseudonymSummary = useMemo(
    () =>
      summarizePseudonymStep({
        applied: pseudonymPeople.map((p) => p.applied),
      }),
    [pseudonymPeople],
  );
  const checklistSummary = useMemo(
    () =>
      summarizeChecklistStep({
        bookLevelChecks: bookLevelChecks.map((c) => ({
          kind: c.kind,
          status: c.status,
        })),
        chapters: chapters.map((c) => ({
          hasSensitiveContent: c.hasSensitiveContent,
          checks: c.checks.map((ck) => ({
            kind: ck.kind,
            status: ck.status,
          })),
        })),
      }),
    [bookLevelChecks, chapters],
  );

  const stepStatus: Record<StepKey, WizardStepStatus> = {
    people: peopleSummary.status,
    pseudonyms: pseudonymSummary.status,
    checklist: checklistSummary.status,
    summary: privacyReviewIsReady(peopleSummary.status, checklistSummary.status)
      ? 'complete'
      : 'attention',
  };

  const ready = privacyReviewIsReady(
    peopleSummary.status,
    checklistSummary.status,
  );

  const meta = STEP_META[step];
  const Icon = meta.icon;

  return (
    <section
      data-testid="privacy-review-wizard"
      className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-4"
    >
      {/* Step rail */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {STEP_ORDER.map((key, i) => {
          const m = STEP_META[key];
          const isCurrent = i === stepIndex;
          return (
            <li key={key}>
              <button
                type="button"
                data-testid={`privacy-wizard-step-${key}`}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => setStepIndex(i)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition ${
                  isCurrent
                    ? 'border-accent/60 bg-accent/15 text-white'
                    : 'border-border-subtle bg-surface-0 text-text-secondary hover:text-white'
                }`}
              >
                <StatusDot status={stepStatus[key]} />
                <span className="font-mono text-[10px] text-text-tertiary">
                  {i + 1}
                </span>
                {m.label}
              </button>
            </li>
          );
        })}
      </ol>

      {/* Step header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border-subtle bg-surface-0 p-2">
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{meta.label}</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            {meta.blurb}
          </p>
        </div>
      </div>

      {/* Step body */}
      <div data-testid={`privacy-wizard-body-${step}`}>
        {step === 'people' && <PrivacyPeoplePanel people={people} />}
        {step === 'pseudonyms' && (
          <PseudonymMapPanel bookId={bookId} people={pseudonymPeople} />
        )}
        {step === 'checklist' && (
          <ReviewChecklistPanel
            bookId={bookId}
            bookLevelChecks={bookLevelChecks}
            chapters={chapters}
          />
        )}
        {step === 'summary' && (
          <div
            data-testid="privacy-wizard-summary"
            className="rounded-xl border border-border-subtle bg-surface-0 p-4 space-y-3"
          >
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                ready
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              {ready ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {ready
                ? 'This book is ready to lock chapters and export the final PDF.'
                : 'Resolve the flagged steps below before locking chapters for export.'}
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <StatusDot status={peopleSummary.status} />
                <span className="text-text-primary">
                  <span className="font-medium">People &amp; consent</span> —{' '}
                  {peopleSummary.total === 0
                    ? 'no people referenced in this book yet.'
                    : peopleSummary.blocking > 0
                      ? `${peopleSummary.blocking} of ${peopleSummary.total} ${
                          peopleSummary.blocking === 1
                            ? 'person has'
                            : 'people have'
                        } pending or withheld consent.`
                      : `all ${peopleSummary.total} referenced ${
                          peopleSummary.total === 1 ? 'person has' : 'people have'
                        } publishable consent.`}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <StatusDot status={pseudonymSummary.status} />
                <span className="text-text-primary">
                  <span className="font-medium">Pseudonym map</span> —{' '}
                  {pseudonymSummary.total === 0
                    ? 'no people to rename.'
                    : `${pseudonymSummary.appliedCount} of ${pseudonymSummary.total} ${
                        pseudonymSummary.total === 1 ? 'person' : 'people'
                      } have an applied pseudonym (advisory — does not block).`}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <StatusDot status={checklistSummary.status} />
                <span className="text-text-primary">
                  <span className="font-medium">Review checklist</span> —{' '}
                  {checklistSummary.requiredTotal === 0
                    ? 'no chapters in this book yet.'
                    : `${checklistSummary.requiredSatisfied} of ${checklistSummary.requiredTotal} required checks satisfied.`}
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Prev / next nav */}
      <div className="flex items-center justify-between border-t border-border-subtle pt-3">
        <button
          type="button"
          data-testid="privacy-wizard-prev"
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={stepIndex === 0}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-primary hover:border-accent/40 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="text-[11px] text-text-tertiary">
          Step {stepIndex + 1} of {STEP_ORDER.length}
        </span>
        <button
          type="button"
          data-testid="privacy-wizard-next"
          onClick={() =>
            setStepIndex((i) => Math.min(STEP_ORDER.length - 1, i + 1))
          }
          disabled={stepIndex === STEP_ORDER.length - 1}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-primary hover:border-accent/40 disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
