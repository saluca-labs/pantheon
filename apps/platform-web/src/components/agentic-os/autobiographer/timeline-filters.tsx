'use client';

/**
 * Autobiographer OS — TimelineFilters.
 *
 * URL-state filter chips for the timeline page. Reads + writes to the
 * `?theme_id=`, `?content_tag=`, `?decade=`, `?person_id=`,
 * `?sensitive=`, `?scope=`, `?book_id=` query params via Next's
 * router so the filtered state is shareable / bookmarkable.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { ThemeChip } from './theme-chip';

export interface FilterTheme {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface FilterBook {
  id: string;
  title: string;
}

export interface TimelineFiltersProps {
  themes: FilterTheme[];
  books: FilterBook[];
  decades: number[];
  contentTags: string[];
  emotionTags: string[];
}

export function TimelineFilters({
  themes,
  books,
  decades,
  contentTags,
  emotionTags,
}: TimelineFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const scope = (params.get('scope') as 'workshop' | 'book' | null) ?? 'workshop';
  const bookId = params.get('book_id') ?? '';
  const themeIds = useMemo(() => params.getAll('theme_id'), [params]);
  const contentTag = params.get('content_tag') ?? '';
  const emotionTag = params.get('emotion_tag') ?? '';
  const decade = params.get('decade') ?? '';
  const sensitive = params.get('sensitive') ?? '';

  function updateParam(name: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === '') {
      next.delete(name);
    } else {
      next.set(name, value);
    }
    router.push(`?${next.toString()}`);
  }

  function toggleTheme(themeId: string) {
    const next = new URLSearchParams(params.toString());
    const existing = next.getAll('theme_id');
    next.delete('theme_id');
    if (existing.includes(themeId)) {
      for (const id of existing) if (id !== themeId) next.append('theme_id', id);
    } else {
      for (const id of existing) next.append('theme_id', id);
      next.append('theme_id', themeId);
    }
    router.push(`?${next.toString()}`);
  }

  function clearAll() {
    router.push('?');
  }

  const anyActive =
    themeIds.length > 0 ||
    !!contentTag ||
    !!emotionTag ||
    !!decade ||
    sensitive !== '' ||
    scope === 'book';

  return (
    <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wide text-[#94a3b8]">
          Filters
        </h2>
        {anyActive && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] uppercase tracking-wide text-[#94a3b8] hover:text-white inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scope}
          onChange={(e) => updateParam('scope', e.target.value)}
          className="text-xs bg-[#0f1117] border border-[#2a2d3e] rounded px-2 py-1 text-white"
        >
          <option value="workshop">Workshop (all books)</option>
          <option value="book">Single book</option>
        </select>
        {scope === 'book' && (
          <select
            value={bookId}
            onChange={(e) => updateParam('book_id', e.target.value || null)}
            className="text-xs bg-[#0f1117] border border-[#2a2d3e] rounded px-2 py-1 text-white"
          >
            <option value="">— Pick a book —</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        )}
        {decades.length > 0 && (
          <select
            value={decade}
            onChange={(e) => updateParam('decade', e.target.value || null)}
            className="text-xs bg-[#0f1117] border border-[#2a2d3e] rounded px-2 py-1 text-white"
          >
            <option value="">All decades</option>
            {decades.map((d) => (
              <option key={d} value={String(d)}>
                {d}s
              </option>
            ))}
          </select>
        )}
        {contentTags.length > 0 && (
          <select
            value={contentTag}
            onChange={(e) => updateParam('content_tag', e.target.value || null)}
            className="text-xs bg-[#0f1117] border border-[#2a2d3e] rounded px-2 py-1 text-white"
          >
            <option value="">All content tags</option>
            {contentTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {emotionTags.length > 0 && (
          <select
            value={emotionTag}
            onChange={(e) => updateParam('emotion_tag', e.target.value || null)}
            className="text-xs bg-[#0f1117] border border-[#2a2d3e] rounded px-2 py-1 text-white"
          >
            <option value="">All emotion tags</option>
            {emotionTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <select
          value={sensitive}
          onChange={(e) => updateParam('sensitive', e.target.value || null)}
          className="text-xs bg-[#0f1117] border border-[#2a2d3e] rounded px-2 py-1 text-white"
        >
          <option value="">Sensitive: any</option>
          <option value="false">Not sensitive</option>
          <option value="true">Sensitive only</option>
        </select>
      </div>

      {themes.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">
            Themes (toggle to filter)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {themes.map((t) => {
              const active = themeIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTheme(t.id)}
                  className={`rounded-full ${active ? 'ring-2 ring-[#4361EE]/60' : ''}`}
                >
                  <ThemeChip name={t.name} color={t.color} size="sm" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
