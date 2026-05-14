'use client';

/**
 * Autobiographer OS — BookCard.
 *
 * List card used by the books-manager grid. Shows cover image (or
 * gradient fallback), title, subtitle, status pill, target-date
 * countdown, and a phase-avg progress bar mirroring Maker's card.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { BookOpenText, Calendar } from 'lucide-react';
import {
  BOOK_STATUS_LABELS,
  bookPhaseAvg,
  type BookPhase,
  type BookStatus,
} from '@/lib/agentic-os/autobiographer/books';

export const BOOK_STATUS_COLOR: Record<BookStatus, string> = {
  drafting: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  revising: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  done: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  paused: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  archived: 'text-text-secondary bg-surface-2 border-border-subtle',
};

export interface BookCardData {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: BookStatus;
  tags: string[];
  coverImageUrl: string | null;
  targetCompletionDate: string | null;
  phaseProgress: Record<BookPhase, number>;
}

function daysUntil(target: string | null): number | null {
  if (!target) return null;
  const t = new Date(target + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.round((t - now) / 86_400_000);
}

export function BookCard({ book }: { book: BookCardData }) {
  const avg = bookPhaseAvg(book.phaseProgress);
  const countdown = daysUntil(book.targetCompletionDate);

  return (
    <Link
      href={`/dashboard/os/autobiographer/books/${book.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 overflow-hidden hover:border-accent/60 transition group"
    >
      <div className="flex">
        {book.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverImageUrl}
            alt=""
            className="w-32 h-32 object-cover border-r border-border-subtle shrink-0"
          />
        ) : (
          <div className="w-32 h-32 shrink-0 border-r border-border-subtle bg-gradient-to-br from-accent/15 to-surface-2 flex items-center justify-center">
            <BookOpenText className="w-8 h-8 text-accent/50" />
          </div>
        )}
        <div className="flex-1 min-w-0 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium group-hover:text-accent transition truncate">
              {book.title}
            </h3>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${BOOK_STATUS_COLOR[book.status]}`}
            >
              {BOOK_STATUS_LABELS[book.status]}
            </span>
            {book.targetCompletionDate && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border-subtle bg-surface-0 text-text-primary inline-flex items-center gap-1"
                title={`Target ${book.targetCompletionDate}`}
              >
                <Calendar className="w-3 h-3" />
                {countdown == null
                  ? book.targetCompletionDate
                  : countdown >= 0
                    ? `${countdown}d`
                    : `${Math.abs(countdown)}d ago`}
              </span>
            )}
          </div>
          {book.subtitle && (
            <p className="text-xs text-text-primary/80 truncate">{book.subtitle}</p>
          )}
          {book.description && (
            <p className="text-xs text-text-secondary truncate">{book.description}</p>
          )}
          {book.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {book.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                >
                  {t}
                </span>
              ))}
              {book.tags.length > 4 && (
                <span className="text-[10px] text-text-secondary">
                  +{book.tags.length - 4}
                </span>
              )}
            </div>
          )}
          {/* Phase-avg bar */}
          <div>
            <div className="flex items-center justify-between mb-1 text-[10px] text-text-secondary">
              <span>Overall</span>
              <span className="text-white font-medium">{avg}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-0 overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${avg}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
