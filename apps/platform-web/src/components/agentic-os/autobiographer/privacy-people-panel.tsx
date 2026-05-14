/**
 * Autobiographer OS — PrivacyPeoplePanel.
 *
 * People roster + consent state for a single book. The panel is the
 * top section of the privacy hub. Each row links to the Phase 2 person
 * detail page so the consent state can be flipped without leaving the
 * privacy review flow.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import Link from 'next/link';
import { ExternalLink, UserCircle2 } from 'lucide-react';
import { ConsentBadge } from './consent-badge';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';

export interface PrivacyPeoplePanelEntry {
  personId: string;
  canonicalName: string;
  consentState: ConsentState;
  /** How many memories in this book mention the person. */
  memoryCount: number;
}

export interface PrivacyPeoplePanelProps {
  people: PrivacyPeoplePanelEntry[];
}

export function PrivacyPeoplePanel({ people }: PrivacyPeoplePanelProps) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">People in this book</h2>
        <span className="text-xs text-text-secondary">
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </span>
      </div>
      {people.length === 0 ? (
        <p className="text-xs text-[#64748b] italic">
          No people are referenced in the memories linked to this book yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {people.map((p) => (
            <li
              key={p.personId}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border-subtle bg-surface-0"
            >
              <Link
                href={`/dashboard/os/autobiographer/people/${p.personId}`}
                className="inline-flex items-center gap-2 text-sm text-white hover:text-accent transition min-w-0"
              >
                <UserCircle2 className="w-4 h-4 text-text-secondary shrink-0" />
                <span className="truncate">{p.canonicalName}</span>
                <ExternalLink className="w-3 h-3 text-[#64748b] shrink-0" />
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[#64748b]">
                  {p.memoryCount}{' '}
                  {p.memoryCount === 1 ? 'memory' : 'memories'}
                </span>
                <ConsentBadge state={p.consentState} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
