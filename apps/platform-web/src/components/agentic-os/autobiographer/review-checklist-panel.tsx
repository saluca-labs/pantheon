/**
 * Autobiographer OS — ReviewChecklistPanel.
 *
 * Renders the full review checklist for a book: book-level checks at
 * the top, then a section per chapter. Each section includes every
 * review-check kind — existing rows are shown with their status; kinds
 * that haven't been seeded yet are rendered as "pending, no row yet"
 * placeholders that POST on first action.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { ReviewCheckRow } from './review-check-row';
import {
  REVIEW_CHECK_KINDS,
  REQUIRED_BASE_CHECKS,
  type ReviewCheckKind,
  type ReviewCheckStatus,
} from '@/lib/agentic-os/autobiographer/review-checks';

export interface ReviewChecklistCheck {
  id: string;
  kind: ReviewCheckKind;
  status: ReviewCheckStatus;
  notes: string | null;
  checkedAt: string | null;
}

export interface ReviewChecklistChapter {
  chapterId: string;
  title: string;
  position: number;
  hasSensitiveContent: boolean;
  checks: ReviewChecklistCheck[];
}

export interface ReviewChecklistPanelProps {
  bookId: string;
  bookLevelChecks: ReviewChecklistCheck[];
  chapters: ReviewChecklistChapter[];
}

function renderRows(
  bookId: string,
  chapterId: string | null,
  existing: ReviewChecklistCheck[],
  requiredKinds: readonly ReviewCheckKind[],
) {
  const byKind = new Map(existing.map((c) => [c.kind, c] as const));
  return REVIEW_CHECK_KINDS.map((kind) => {
    const row = byKind.get(kind);
    return (
      <ReviewCheckRow
        key={kind}
        bookId={bookId}
        chapterId={chapterId}
        kind={kind}
        checkId={row?.id ?? null}
        initialStatus={row?.status ?? 'pending'}
        initialNotes={row?.notes ?? null}
        checkedAt={row?.checkedAt ?? null}
        required={requiredKinds.includes(kind)}
      />
    );
  });
}

export function ReviewChecklistPanel({
  bookId,
  bookLevelChecks,
  chapters,
}: ReviewChecklistPanelProps) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white mb-2">
          Review checklist
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          Chapter lock requires {REQUIRED_BASE_CHECKS.join(' + ')} (plus{' '}
          <span className="text-amber-300/80">sensitive_flagged</span> for
          chapters with any sensitive content) to be Passed or Waived.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-text-secondary">
          Book-level
        </h3>
        <div className="space-y-2">
          {renderRows(bookId, null, bookLevelChecks, [])}
        </div>
      </div>

      {chapters.length === 0 ? (
        <p className="text-xs text-[#64748b] italic">
          No chapters in this book yet.
        </p>
      ) : (
        chapters.map((c) => {
          const required: ReviewCheckKind[] = [
            'consent_collected',
            'attribution_verified',
          ];
          if (c.hasSensitiveContent) required.push('sensitive_flagged');
          return (
            <div key={c.chapterId} className="space-y-2">
              <h3 className="text-xs uppercase tracking-wide text-text-secondary inline-flex items-center gap-2">
                <span className="font-mono text-[#64748b]">
                  Ch {String(c.position + 1).padStart(2, '0')}
                </span>
                <span className="text-text-primary normal-case font-medium">
                  {c.title}
                </span>
                {c.hasSensitiveContent && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                    Sensitive
                  </span>
                )}
              </h3>
              <div className="space-y-2">
                {renderRows(bookId, c.chapterId, c.checks, required)}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
