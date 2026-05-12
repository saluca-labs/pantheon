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

import { Search } from 'lucide-react';
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
        <span className="text-[10px] uppercase tracking-wide text-[#94a3b8] mr-1">
          Consent
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...value, consentToPublish: 'all' })}
          className={`text-xs px-2.5 py-1 rounded-full border transition ${
            value.consentToPublish === 'all'
              ? 'bg-[#4361EE] text-white border-[#4361EE]'
              : 'bg-[#0f1117] text-[#94a3b8] border-[#2a2d3e] hover:text-white'
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
                  ? 'bg-[#4361EE] text-white border-[#4361EE]'
                  : 'bg-[#0f1117] text-[#94a3b8] border-[#2a2d3e] hover:text-white'
              }`}
            >
              {CONSENT_LABELS[s]} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
        <input
          type="search"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          placeholder="Search by name or alias…"
          className="w-full pl-9 pr-3 py-2 bg-[#0f1117] border border-[#2a2d3e] rounded text-sm text-white focus:outline-none focus:border-[#4361EE]"
        />
      </div>
    </div>
  );
}
