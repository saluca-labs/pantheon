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
import { FileText } from 'lucide-react';
import { ChapterCard, type ChapterCardData } from './chapter-card';
import { EmptyState } from '@/components/agentic-os/_shared/views';

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
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="No chapters yet"
        description="Open a book and create one from the book detail page."
      />
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
                ? 'bg-accent border-accent text-white'
                : 'bg-surface-0 border-border-subtle text-text-primary hover:border-accent/40'
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
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface-0 border-border-subtle text-text-primary hover:border-accent/40'
              }`}
            >
              {b.title}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          variant="bare"
          icon={<FileText className="h-6 w-6" />}
          title="No chapters match this filter"
          description="Pick a different book chip to see more."
        />
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
