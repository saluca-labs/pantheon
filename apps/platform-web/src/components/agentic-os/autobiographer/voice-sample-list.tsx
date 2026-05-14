'use client';

/**
 * Autobiographer OS — VoiceSampleList.
 *
 * Renders the Voice Studio sample list with archive-state filter chips
 * and a free-text search over title + body. State lives client-side;
 * the underlying data is fetched server-side and passed in via
 * `initial`.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useMemo, useState } from 'react';
import { Mic } from 'lucide-react';
import { EntitySearch, EmptyState } from '@/components/agentic-os/_shared/views';
import {
  VoiceSampleCard,
  type VoiceSampleCardData,
} from './voice-sample-card';

type FilterMode = 'active' | 'archived' | 'all';

const FILTER_LABELS: Record<FilterMode, string> = {
  active: 'Active',
  archived: 'Archived',
  all: 'All',
};

export interface VoiceSampleListProps {
  initial: VoiceSampleCardData[];
}

export function VoiceSampleList({ initial }: VoiceSampleListProps) {
  const [filter, setFilter] = useState<FilterMode>('active');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const s of initial) {
      if (s.isArchived) archived++;
      else active++;
    }
    return { active, archived, all: initial.length };
  }, [initial]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return initial
      .filter((s) => {
        if (filter === 'active') return !s.isArchived;
        if (filter === 'archived') return s.isArchived;
        return true;
      })
      .filter((s) => {
        if (!needle) return true;
        const hay = `${s.title ?? ''}\n${s.bodyText}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [initial, filter, q]);

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          {(['active', 'archived', 'all'] as FilterMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFilter(m)}
              className={`text-xs px-2.5 py-1 rounded border transition ${
                filter === m
                  ? 'border-accent/60 bg-accent/15 text-white'
                  : 'border-border-subtle bg-surface-0 text-text-secondary hover:text-white'
              }`}
            >
              {FILTER_LABELS[m]}{' '}
              <span className="text-[#64748b]">({counts[m]})</span>
            </button>
          ))}
        </div>
        <EntitySearch
          defaultValue={q}
          placeholder="Search samples…"
          onQueryChange={setQ}
          className="w-64"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Mic className="h-6 w-6" />}
          title={
            initial.length === 0
              ? 'No voice samples yet'
              : 'No samples match these filters'
          }
          description={
            initial.length === 0
              ? 'Add a paragraph or page of your own writing — backed by an existing memory, or freshly typed.'
              : 'Loosen the filters above to see more.'
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <VoiceSampleCard key={s.id} sample={s} />
          ))}
        </div>
      )}
    </section>
  );
}
