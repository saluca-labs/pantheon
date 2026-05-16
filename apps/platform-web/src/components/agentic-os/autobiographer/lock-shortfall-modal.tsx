'use client';

/**
 * Autobiographer OS — LockShortfallModal.
 *
 * Renders the body returned by `/chapters/[id]/lock` when the lock
 * is blocked by missing or unsatisfied checks. The modal lists every
 * missing check with a quick link to the privacy hub so the user can
 * resolve and re-attempt.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import Link from 'next/link';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import {
  REVIEW_CHECK_KIND_LABELS,
  type ReviewCheckKind,
} from '@/lib/agentic-os/autobiographer/review-checks';

export interface LockShortfallEntry {
  kind: string;
  status: string;
}

export interface LockShortfallModalProps {
  open: boolean;
  bookId: string;
  required: readonly string[];
  missing: readonly LockShortfallEntry[];
  hasSensitiveContent?: boolean;
  onClose: () => void;
}

function statusLabel(status: string): string {
  if (status === 'missing') return 'not started';
  return status;
}

export function LockShortfallModal({
  open,
  bookId,
  required,
  missing,
  hasSensitiveContent,
  onClose,
}: LockShortfallModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-warning/30 bg-surface-2 shadow-xl">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
          <div className="inline-flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            <h2 className="text-base font-semibold text-white">
              Lock blocked — review checklist incomplete
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-4 py-3 space-y-3">
          <p className="text-sm text-text-primary leading-relaxed">
            Locking this chapter requires the following review checks to be
            in <code className="text-positive">passed</code> or{' '}
            <code className="text-os-research">waived</code> status:
          </p>
          <ul className="space-y-1">
            {required.map((kind) => {
              const label =
                REVIEW_CHECK_KIND_LABELS[kind as ReviewCheckKind] ?? kind;
              return (
                <li
                  key={kind}
                  className="text-sm text-text-primary inline-flex items-center gap-2"
                >
                  <span className="text-text-tertiary">·</span>
                  {label}
                </li>
              );
            })}
          </ul>
          {hasSensitiveContent && (
            <p className="text-xs text-warning/80 inline-flex items-center gap-1">
              Sensitive content detected — `sensitive_flagged` joined the
              required set automatically.
            </p>
          )}

          <div className="rounded border border-danger/30 bg-danger/10 p-3">
            <p className="text-xs uppercase tracking-wide text-danger mb-1">
              {missing.length}{' '}
              {missing.length === 1 ? 'check is' : 'checks are'} blocking
            </p>
            <ul className="space-y-0.5">
              {missing.map((m) => {
                const label =
                  REVIEW_CHECK_KIND_LABELS[m.kind as ReviewCheckKind] ??
                  m.kind;
                return (
                  <li
                    key={m.kind}
                    className="text-sm text-text-primary inline-flex items-center gap-2"
                  >
                    <span className="text-text-tertiary">·</span>
                    <span>{label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-danger/80">
                      ({statusLabel(m.status)})
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-border-subtle flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white transition"
          >
            Close
          </button>
          <Link
            href={`/dashboard/os/autobiographer/privacy?bookId=${bookId}`}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-accent/40 bg-accent/10 text-accent hover:text-white hover:bg-accent/20 transition"
          >
            Open privacy hub
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
