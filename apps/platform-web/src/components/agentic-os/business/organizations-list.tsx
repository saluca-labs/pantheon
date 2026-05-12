'use client';

/**
 * Business OS Phase 1 — organizations list with filter chips.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useMemo, useState } from 'react';
import type { Organization } from '@/lib/agentic-os/business/crm';
import { ORG_TYPES } from '@/lib/agentic-os/business/crm';
import { orgMatchesFilter } from '@/lib/agentic-os/business/orgs';
import { OrganizationRow } from './organization-row';

interface Props {
  initialOrganizations: Organization[];
}

const inputCls =
  'w-full sm:w-auto rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-1.5 text-xs text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

export function OrganizationsList({ initialOrganizations }: Props) {
  const [orgs] = useState<Organization[]>(initialOrganizations);
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return orgs.filter((o) =>
      orgMatchesFilter(o, {
        archived: showArchived,
        tag: tagFilter || undefined,
        industry: industryFilter || undefined,
        orgType: (typeFilter || undefined) as any,
        q: q || undefined,
      }),
    );
  }, [orgs, showArchived, tagFilter, industryFilter, typeFilter, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / industry"
          className={inputCls}
        />
        <input
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          placeholder="Filter by tag"
          className={inputCls}
        />
        <input
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          placeholder="Industry"
          className={inputCls}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={inputCls}
        >
          <option value="">All types</option>
          {ORG_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
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
          {filtered.length} of {orgs.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[#94a3b8] italic">
          No organizations match the current filters.
        </p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map((o) => (
            <li key={o.id}>
              <OrganizationRow organization={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
