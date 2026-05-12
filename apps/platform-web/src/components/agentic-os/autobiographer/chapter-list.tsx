'use client';

/**
 * Autobiographer OS — ChapterList (workshop-wide chapter index).
 *
 * Displayed on `/dashboard/os/autobiographer/chapters`. Lists every
 * chapter the user owns across every book with a book filter chip.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState, useMemo } from 'react';
import { ChapterCard, type ChapterCardData } from './chapter-card';

export interface BookFilterOption {
  id: string;
  title: string;
}

export interface ChapterListProps {
  initial: ChapterCardData[];
  books: BookFilterOption[];
  /** Optional pre-selected book filter. */
  initialBookId?: string | null;
  /**
   * Optional per-row book-id map. When supplied, the filter chip
   * narrows to the matching book.
   */
  chapterBookIds: Record<string, string>;
}

export function ChapterList({
  initial,
  books,
  initialBookId,
  chapterBookIds,
}: ChapterListProps) {
  const [bookFilter, setBookFilter] = useState<string | null>(
    initialBookId ?? null,
  );

  const filtered = useMemo(() => {
    if (!bookFilter) return initial;
    return initial.filter((c) => chapterBookIds[c.id] === bookFilter);
  }, [bookFilter, chapterBookIds, initial]);

  if (initial.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-6 text-center text-sm text-[#94a3b8]">
        No chapters yet. Open a book and create one from the book detail page.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {books.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#64748b] uppercase tracking-wide">
            Book
          </span>
          <button
            type="button"
            onClick={() => setBookFilter(null)}
            className={`px-2 py-1 rounded border transition ${
              bookFilter === null
                ? 'bg-[#4361EE] border-[#4361EE] text-white'
                : 'bg-[#0f1117] border-[#2a2d3e] text-[#cbd5e1] hover:border-[#4361EE]/40'
            }`}
          >
            All
          </button>
          {books.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBookFilter(b.id)}
              className={`px-2 py-1 rounded border transition ${
                bookFilter === b.id
                  ? 'bg-[#4361EE] border-[#4361EE] text-white'
                  : 'bg-[#0f1117] border-[#2a2d3e] text-[#cbd5e1] hover:border-[#4361EE]/40'
              }`}
            >
              {b.title}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-5 text-sm text-[#94a3b8] text-center">
          No chapters match this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ChapterCard key={c.id} chapter={c} />
          ))}
        </div>
      )}
    </div>
  );
}
