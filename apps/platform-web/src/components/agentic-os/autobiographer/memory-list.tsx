'use client';

/**
 * Autobiographer OS — MemoryList.
 *
 * Composes MemoryFilters + a vertical stack of MemoryCard. The page
 * server-renders the initial set; this component handles client-side
 * filter narrowing across book scope, sensitive flag, and tag chips.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useMemo, useState } from 'react';
import { MemoryCard, type MemoryCardData } from './memory-card';
import {
  MemoryFilters,
  type BookOption,
  type MemoryFiltersValue,
} from './memory-filters';

export interface MemoryListProps {
  initial: MemoryCardData[];
  books: BookOption[];
  /** When non-null, filters are book-scoped (per-book view) and book chips hidden. */
  scopedBookId?: string | null;
}

export function MemoryList({ initial, books, scopedBookId }: MemoryListProps) {
  const [value, setValue] = useState<MemoryFiltersValue>({
    bookId: scopedBookId ? scopedBookId : 'all',
    isSensitive: 'any',
    contentTag: null,
    emotionTag: null,
  });

  const filtered = useMemo(() => {
    return initial.filter((m) => {
      // Book scope
      if (value.bookId === 'workshop') {
        if (m.bookId !== null) return false;
      } else if (value.bookId !== 'all' && value.bookId !== scopedBookId) {
        if (m.bookId !== value.bookId) return false;
      }
      // Sensitive
      if (value.isSensitive === 'yes' && !m.isSensitive) return false;
      if (value.isSensitive === 'no' && m.isSensitive) return false;
      // Tags
      if (value.contentTag && !m.contentTags.includes(value.contentTag)) {
        return false;
      }
      if (value.emotionTag && !m.emotionTags.includes(value.emotionTag)) {
        return false;
      }
      return true;
    });
  }, [initial, value, scopedBookId]);

  return (
    <div className="space-y-4">
      {!scopedBookId && (
        <MemoryFilters
          memories={initial}
          books={books}
          value={value}
          onChange={setValue}
        />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/50 p-8 text-center">
          <p className="text-sm font-medium text-white mb-1">
            No memories match
          </p>
          <p className="text-xs text-text-secondary">
            {initial.length === 0
              ? 'Capture your first memory to start building the library.'
              : 'Loosen the filters above to see more.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <MemoryCard key={m.id} memory={m} />
          ))}
          <p className="text-[10px] text-text-secondary text-right">
            Showing {filtered.length} of {initial.length}{' '}
            {initial.length === 1 ? 'memory' : 'memories'}
          </p>
        </div>
      )}
    </div>
  );
}
