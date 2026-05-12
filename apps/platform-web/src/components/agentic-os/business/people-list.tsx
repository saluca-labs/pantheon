'use client';

/**
 * Business OS Phase 1 — people list with filter chips.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useMemo, useState } from 'react';
import type { Organization, Person } from '@/lib/agentic-os/business/crm';
import { personMatchesFilter } from '@/lib/agentic-os/business/people';
import { PersonRow } from './person-row';

interface Props {
  initialPeople: Person[];
  organizations: Pick<Organization, 'id' | 'name'>[];
}

const inputCls =
  'w-full sm:w-auto rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-1.5 text-xs text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export function PeopleList({ initialPeople, organizations }: Props) {
  const [people] = useState<Person[]>(initialPeople);
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [q, setQ] = useState('');

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations],
  );

  const filtered = useMemo(() => {
    return people.filter((p) =>
      personMatchesFilter(p, {
        archived: showArchived,
        tag: tagFilter || undefined,
        organizationId: orgFilter || undefined,
        q: q || undefined,
      }),
    );
  }, [people, showArchived, tagFilter, orgFilter, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / email / role"
          className={inputCls}
        />
        <input
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          placeholder="Filter by tag"
          className={inputCls}
        />
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className={inputCls}
        >
          <option value="">All organizations</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#94a3b8]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <span className="text-xs text-[#94a3b8] ml-auto">
          {filtered.length} of {people.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[#94a3b8] italic">No people match the current filters.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <PersonRow person={p} orgName={p.organizationId ? orgMap.get(p.organizationId) ?? null : null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
