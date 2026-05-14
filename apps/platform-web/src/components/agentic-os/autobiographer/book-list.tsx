'use client';

/**
 * Autobiographer OS — BookList.
 *
 * Client-side list shell around BookCard. The hub page is server-rendered
 * with the initial books, and this component handles status filter
 * chips client-side.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useMemo, useState } from 'react';
import { BookCard, type BookCardData } from './book-card';
import {
  BOOK_STATUSES,
  BOOK_STATUS_LABELS,
  type BookStatus,
} from '@/lib/agentic-os/autobiographer/books';

export function BookList({ initial }: { initial: BookCardData[] }) {
  const [statusFilter, setStatusFilter] = useState<BookStatus | 'all'>('all');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return initial;
    return initial.filter((b) => b.status === statusFilter);
  }, [initial, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`text-xs px-2.5 py-1 rounded-full border transition ${
            statusFilter === 'all'
              ? 'bg-accent text-white border-accent'
              : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
          }`}
        >
          All ({initial.length})
        </button>
        {BOOK_STATUSES.map((s) => {
          const count = initial.filter((b) => b.status === s).length;
          if (count === 0) return null;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                statusFilter === s
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
              }`}
            >
              {BOOK_STATUS_LABELS[s]} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-8 text-center">
          <p className="text-sm font-medium text-white mb-1">No books yet</p>
          <p className="text-xs text-text-secondary">
            {statusFilter === 'all'
              ? 'Start a new book to begin capturing your story.'
              : `No books in the "${BOOK_STATUS_LABELS[statusFilter as BookStatus]}" status.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}
    </div>
  );
}
