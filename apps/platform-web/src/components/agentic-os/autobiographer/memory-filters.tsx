'use client';

/**
 * Autobiographer OS — MemoryFilters.
 *
 * Filter chip strip for the workshop memory list. Surfaces:
 *   - book scope toggle: "All books" / "Workshop-only" / per-book
 *   - sensitive flag toggle
 *   - content-tag chips derived from the loaded set
 *   - emotion-tag chips derived from the loaded set
 *
 * Filtering is client-side over the initial set; the page only refetches
 * via router.refresh when the book scope changes (server-rendered).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useMemo, useState } from 'react';
import type { MemoryCardData } from './memory-card';

export interface MemoryFiltersValue {
  bookId: string | 'all' | 'workshop';
  isSensitive: 'any' | 'yes' | 'no';
  contentTag: string | null;
  emotionTag: string | null;
}

export interface BookOption {
  id: string;
  title: string;
}

export interface MemoryFiltersProps {
  memories: MemoryCardData[];
  books: BookOption[];
  value: MemoryFiltersValue;
  onChange: (v: MemoryFiltersValue) => void;
}

export function MemoryFilters({
  memories,
  books,
  value,
  onChange,
}: MemoryFiltersProps) {
  const [showAllContent, setShowAllContent] = useState(false);
  const [showAllEmotion, setShowAllEmotion] = useState(false);

  const contentTagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const mem of memories) {
      for (const t of mem.contentTags) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [memories]);

  const emotionTagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const mem of memories) {
      for (const t of mem.emotionTags) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [memories]);

  const visibleContent = showAllContent
    ? contentTagCounts
    : contentTagCounts.slice(0, 8);
  const visibleEmotion = showAllEmotion
    ? emotionTagCounts
    : emotionTagCounts.slice(0, 8);

  return (
    <div className="space-y-3">
      {/* Book scope + sensitive */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary mr-1">
            Scope
          </span>
          {(['all', 'workshop'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...value, bookId: s })}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                value.bookId === s
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
              }`}
            >
              {s === 'all' ? 'All books' : 'Workshop-only'}
            </button>
          ))}
          {books.slice(0, 6).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange({ ...value, bookId: b.id })}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                value.bookId === b.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
              }`}
            >
              {b.title}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary mr-1">
            Sensitive
          </span>
          {(['any', 'yes', 'no'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...value, isSensitive: s })}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                value.isSensitive === s
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
              }`}
            >
              {s === 'any' ? 'Any' : s === 'yes' ? 'Flagged' : 'Unflagged'}
            </button>
          ))}
        </div>
      </div>

      {/* Content tag chips */}
      {contentTagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary mr-1">
            Content tag
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...value, contentTag: null })}
            className={`text-xs px-2 py-0.5 rounded border transition ${
              value.contentTag === null
                ? 'bg-accent/20 text-white border-accent/60'
                : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
            }`}
          >
            All
          </button>
          {visibleContent.map(([t, count]) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  contentTag: value.contentTag === t ? null : t,
                })
              }
              className={`text-xs px-2 py-0.5 rounded border transition ${
                value.contentTag === t
                  ? 'bg-accent/20 text-white border-accent/60'
                  : 'bg-surface-0 text-text-primary border-border-subtle hover:text-white'
              }`}
            >
              {t} <span className="text-[#64748b]">{count}</span>
            </button>
          ))}
          {contentTagCounts.length > 8 && !showAllContent && (
            <button
              type="button"
              onClick={() => setShowAllContent(true)}
              className="text-xs text-text-secondary hover:text-white"
            >
              +{contentTagCounts.length - 8} more
            </button>
          )}
        </div>
      )}

      {/* Emotion tag chips */}
      {emotionTagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary mr-1">
            Emotion
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...value, emotionTag: null })}
            className={`text-xs px-2 py-0.5 rounded border transition ${
              value.emotionTag === null
                ? 'bg-rose-500/20 text-white border-rose-500/60'
                : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
            }`}
          >
            All
          </button>
          {visibleEmotion.map(([t, count]) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  emotionTag: value.emotionTag === t ? null : t,
                })
              }
              className={`text-xs px-2 py-0.5 rounded border transition ${
                value.emotionTag === t
                  ? 'bg-rose-500/20 text-white border-rose-500/60'
                  : 'bg-rose-500/5 text-rose-200/80 border-rose-500/20 hover:text-white'
              }`}
            >
              {t} <span className="text-[#64748b]">{count}</span>
            </button>
          ))}
          {emotionTagCounts.length > 8 && !showAllEmotion && (
            <button
              type="button"
              onClick={() => setShowAllEmotion(true)}
              className="text-xs text-text-secondary hover:text-white"
            >
              +{emotionTagCounts.length - 8} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
