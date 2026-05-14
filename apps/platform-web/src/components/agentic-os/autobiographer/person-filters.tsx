'use client';

/**
 * Autobiographer OS — PersonFilters.
 *
 * Filter chip strip for the workshop people roster. Surfaces:
 *   - consent state chips (pending / withheld / granted / deceased /
 *     public_figure / not_applicable / all)
 *   - search input over canonical_name + aliases
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { EntitySearch } from '@/components/agentic-os/_shared/views';
import {
  CONSENT_STATES,
  CONSENT_LABELS,
  type ConsentState,
} from '@/lib/agentic-os/autobiographer/people';
import type { PersonCardData } from './person-card';

export interface PersonFiltersValue {
  consentToPublish: ConsentState | 'all';
  query: string;
}

export interface PersonFiltersProps {
  people: PersonCardData[];
  value: PersonFiltersValue;
  onChange: (v: PersonFiltersValue) => void;
}

export function PersonFilters({
  people,
  value,
  onChange,
}: PersonFiltersProps) {
  const counts = new Map<ConsentState, number>();
  for (const p of people) {
    counts.set(p.consentToPublish, (counts.get(p.consentToPublish) ?? 0) + 1);
  }

  return (
    <div className="space-y-3">
      {/* Consent chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-text-secondary mr-1">
          Consent
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...value, consentToPublish: 'all' })}
          className={`text-xs px-2.5 py-1 rounded-full border transition ${
            value.consentToPublish === 'all'
              ? 'bg-accent text-white border-accent'
              : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
          }`}
        >
          All ({people.length})
        </button>
        {CONSENT_STATES.map((s) => {
          const count = counts.get(s) ?? 0;
          if (count === 0 && value.consentToPublish !== s) return null;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...value, consentToPublish: s })}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                value.consentToPublish === s
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
              }`}
            >
              {CONSENT_LABELS[s]} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <EntitySearch
        defaultValue={value.query}
        placeholder="Search by name or alias…"
        onQueryChange={(query) => onChange({ ...value, query })}
      />
    </div>
  );
}
