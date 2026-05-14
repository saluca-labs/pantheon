'use client';

/**
 * Autobiographer OS — PersonCard.
 *
 * Compact person row used by the workshop people roster. Surfaces
 * canonical name, relation, lifespan (birth/death years), consent badge,
 * alias chips, and a discreet alias-count indicator.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { User2, Tag as TagIcon } from 'lucide-react';
import { ConsentBadge } from './consent-badge';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';

export interface PersonCardData {
  id: string;
  canonicalName: string;
  aliases: string[];
  relation: string | null;
  birthYear: number | null;
  deathYear: number | null;
  consentToPublish: ConsentState;
  imageUrl: string | null;
  notes: string | null;
}

function lifespan(birth: number | null, death: number | null): string | null {
  if (birth === null && death === null) return null;
  if (birth !== null && death !== null) return `${birth} – ${death}`;
  if (birth !== null) return `b. ${birth}`;
  return `d. ${death}`;
}

export function PersonCard({ person }: { person: PersonCardData }) {
  const yrs = lifespan(person.birthYear, person.deathYear);

  return (
    <Link
      href={`/dashboard/os/autobiographer/people/${person.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 p-4 hover:border-accent/60 transition group"
    >
      <div className="flex items-start gap-3">
        {person.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.imageUrl}
            alt=""
            className="w-12 h-12 rounded-full object-cover border border-border-subtle shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/15 to-surface-2 border border-border-subtle flex items-center justify-center shrink-0">
            <User2 className="w-5 h-5 text-accent/60" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-white font-medium group-hover:text-accent transition truncate">
              {person.canonicalName}
            </h3>
            <ConsentBadge state={person.consentToPublish} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            {person.relation && (
              <span className="inline-flex items-center gap-1">
                <TagIcon className="w-3 h-3" />
                {person.relation}
              </span>
            )}
            {yrs && <span className="text-[#64748b]">{yrs}</span>}
            {person.aliases.length > 0 && (
              <span
                className="text-[#64748b]"
                title={`Aliases: ${person.aliases.join(', ')}`}
              >
                {person.aliases.length} alias
                {person.aliases.length === 1 ? '' : 'es'}
              </span>
            )}
          </div>

          {person.notes && (
            <p className="text-xs text-text-secondary mt-1.5 truncate">
              {person.notes}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
