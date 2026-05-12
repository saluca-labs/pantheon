'use client';

/**
 * Business OS Phase 1 — single-row card for the people list.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import type { Person } from '@/lib/agentic-os/business/crm';
import { fullName } from '@/lib/agentic-os/business/crm';
import { BusinessTagChip } from './business-tag-chip';

interface Props {
  person: Person;
  orgName?: string | null;
}

export function PersonRow({ person, orgName }: Props) {
  return (
    <Link
      href={`/dashboard/os/business/people/${person.id}`}
      className="block rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-3 hover:border-[#4361EE] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {fullName(person)}
            {person.archivedAt && (
              <span className="ml-2 text-[10px] text-amber-300 font-normal">(archived)</span>
            )}
          </p>
          {person.role && (
            <p className="text-xs text-[#94a3b8] truncate">{person.role}</p>
          )}
          {orgName && (
            <p className="text-[11px] text-[#94a3b8]/80 truncate">{orgName}</p>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-slate-500/15 text-slate-300 border-slate-500/30">
          {person.stage}
        </span>
      </div>
      {person.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {person.tags.map((t) => (
            <BusinessTagChip key={t} tag={t} small />
          ))}
        </div>
      )}
    </Link>
  );
}
