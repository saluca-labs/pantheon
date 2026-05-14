'use client';

/**
 * Business OS Phase 1 — single-row card for the orgs list.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import type { Organization } from '@/lib/agentic-os/business/crm';
import { BusinessTagChip } from './business-tag-chip';

export function OrganizationRow({ organization }: { organization: Organization }) {
  return (
    <Link
      href={`/dashboard/os/business/organizations/${organization.id}`}
      className="block rounded-lg border border-border-subtle bg-surface-2 p-3 hover:border-accent transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {organization.name}
            {organization.archivedAt && (
              <span className="ml-2 text-[10px] text-amber-300 font-normal">(archived)</span>
            )}
          </p>
          {organization.industry && (
            <p className="text-xs text-text-secondary truncate">{organization.industry}</p>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-teal-500/15 text-teal-300 border-teal-500/30">
          {organization.orgType.replace(/_/g, ' ')}
        </span>
      </div>
      {organization.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {organization.tags.map((t) => (
            <BusinessTagChip key={t} tag={t} small />
          ))}
        </div>
      )}
    </Link>
  );
}
