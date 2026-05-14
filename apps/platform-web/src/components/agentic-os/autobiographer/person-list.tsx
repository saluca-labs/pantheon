'use client';

/**
 * Autobiographer OS — PersonList.
 *
 * Composes PersonFilters + a vertical stack of PersonCard. The page
 * server-renders the initial set; this component handles client-side
 * filter narrowing by consent state + search.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { PersonCard, type PersonCardData } from './person-card';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import {
  PersonFilters,
  type PersonFiltersValue,
} from './person-filters';

export interface PersonListProps {
  initial: PersonCardData[];
}

export function PersonList({ initial }: PersonListProps) {
  const [value, setValue] = useState<PersonFiltersValue>({
    consentToPublish: 'all',
    query: '',
  });

  const filtered = useMemo(() => {
    const q = value.query.trim().toLowerCase();
    return initial.filter((p) => {
      if (
        value.consentToPublish !== 'all' &&
        p.consentToPublish !== value.consentToPublish
      ) {
        return false;
      }
      if (q) {
        const haystack = [p.canonicalName, ...p.aliases]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [initial, value]);

  return (
    <div className="space-y-4">
      <PersonFilters people={initial} value={value} onChange={setValue} />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={initial.length === 0 ? 'No people yet' : 'No people match'}
          description={
            initial.length === 0
              ? 'Add your first person — mom, dad, mentor, public figure — to start tracking who appears in your story.'
              : 'Loosen the filters above to see more.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PersonCard key={p.id} person={p} />
          ))}
          <p className="text-[10px] text-text-secondary text-right">
            Showing {filtered.length} of {initial.length}{' '}
            {initial.length === 1 ? 'person' : 'people'}
          </p>
        </div>
      )}
    </div>
  );
}
