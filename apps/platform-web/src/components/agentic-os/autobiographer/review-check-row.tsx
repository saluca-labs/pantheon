'use client';

/**
 * Autobiographer OS — ReviewCheckRow.
 *
 * One row in the review checklist. Renders the kind label + status pill
 * + checked_at timestamp + an editable notes textarea + Mark passed /
 * waived / failed buttons. Used by `ReviewChecklistPanel` once per
 * existing check row, and also as a "create new" row for kinds that
 * haven't been seeded yet.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MinusCircle, Save, XCircle } from 'lucide-react';
import { ReviewCheckStatusPill } from './review-check-status-pill';
import {
  REVIEW_CHECK_KIND_DESCRIPTIONS,
  REVIEW_CHECK_KIND_LABELS,
  type ReviewCheckKind,
  type ReviewCheckStatus,
} from '@/lib/agentic-os/autobiographer/review-checks';

export interface ReviewCheckRowProps {
  bookId: string;
  chapterId: string | null;
  kind: ReviewCheckKind;
  /** When present, this row is editing an existing check. */
  checkId: string | null;
  initialStatus: ReviewCheckStatus;
  initialNotes: string | null;
  checkedAt: string | null;
  /** Mark this row as "required for lock" — adds a small badge. */
  required?: boolean;
}

const ACTION_BUTTONS: Array<{
  status: ReviewCheckStatus;
  label: string;
  icon: typeof CheckCircle2;
  classes: string;
}> = [
  {
    status: 'passed',
    label: 'Pass',
    icon: CheckCircle2,
    classes:
      'border-positive/30 bg-positive/10 text-positive hover:bg-positive/20',
  },
  {
    status: 'waived',
    label: 'Waive',
    icon: MinusCircle,
    classes:
      'border-os-research/30 bg-os-research/10 text-os-research hover:bg-os-research/20',
  },
  {
    status: 'failed',
    label: 'Fail',
    icon: XCircle,
    classes:
      'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
  },
];

export function ReviewCheckRow({
  bookId,
  chapterId,
  kind,
  checkId,
  initialStatus,
  initialNotes,
  checkedAt,
  required,
}: ReviewCheckRowProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ReviewCheckStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notesDirty = (initialNotes ?? '') !== notes;

  async function persistStatus(next: ReviewCheckStatus) {
    setBusy(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();
      if (checkId) {
        const res = await fetch(
          `/api/tiresias/agentic-os/autobiographer/review-checks/${checkId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              status: next,
              checkedAt: nowIso,
              ...(notesDirty ? { notes: notes.trim() || null } : {}),
            }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `${res.status} ${res.statusText}`);
        }
      } else {
        const res = await fetch(
          `/api/tiresias/agentic-os/autobiographer/books/${bookId}/review-checks`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chapterId,
              kind,
              status: next,
              checkedAt: nowIso,
              notes: notes.trim() || null,
            }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `${res.status} ${res.statusText}`);
        }
      }
      setStatus(next);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to update check');
    } finally {
      setBusy(false);
    }
  }

  async function persistNotes() {
    if (!notesDirty) return;
    setBusy(true);
    setError(null);
    try {
      if (checkId) {
        const res = await fetch(
          `/api/tiresias/agentic-os/autobiographer/review-checks/${checkId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ notes: notes.trim() || null }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `${res.status} ${res.statusText}`);
        }
      } else {
        // Seed the row in pending state if user added a note before
        // marking it.
        const res = await fetch(
          `/api/tiresias/agentic-os/autobiographer/books/${bookId}/review-checks`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chapterId,
              kind,
              notes: notes.trim() || null,
            }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `${res.status} ${res.statusText}`);
        }
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save notes');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-white">
              {REVIEW_CHECK_KIND_LABELS[kind]}
            </span>
            <ReviewCheckStatusPill status={status} />
            {required && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-warning/30 bg-warning/10 text-warning">
                Required
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {REVIEW_CHECK_KIND_DESCRIPTIONS[kind]}
          </p>
        </div>
        {checkedAt && (
          <span className="text-[10px] text-text-tertiary shrink-0">
            checked {new Date(checkedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {ACTION_BUTTONS.map((b) => (
          <button
            key={b.status}
            type="button"
            disabled={busy || status === b.status}
            onClick={() => void persistStatus(b.status)}
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition disabled:opacity-50 disabled:cursor-not-allowed ${b.classes}`}
          >
            <b.icon className="w-3.5 h-3.5" />
            Mark {b.label}
          </button>
        ))}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => void persistNotes()}
        placeholder="Notes (optional — who reviewed, when, with what evidence)"
        rows={2}
        disabled={busy}
        className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
      />

      {notesDirty && (
        <button
          type="button"
          onClick={() => void persistNotes()}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[10px] text-text-secondary hover:text-white"
        >
          <Save className="w-3 h-3" />
          Save notes
        </button>
      )}

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}
