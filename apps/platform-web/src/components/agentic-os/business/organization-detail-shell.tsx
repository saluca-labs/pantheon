'use client';

/**
 * Business OS Phase 1 — organization-detail page client shell.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import type {
  Interaction,
  Organization,
  Person,
} from '@/lib/agentic-os/business/crm';
import { fullName } from '@/lib/agentic-os/business/crm';
import { BusinessTagChip } from './business-tag-chip';
import { InteractionEditor } from './interaction-editor';
import { InteractionTimeline } from './interaction-timeline';

interface Props {
  organization: Organization;
  people: Person[];
  initialInteractions: Interaction[];
}

export function OrganizationDetailShell({
  organization,
  people,
  initialInteractions,
}: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>(initialInteractions);

  return (
    <div className="space-y-6">
      {/* Meta card */}
      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-2">
        <h1 className="text-xl font-semibold text-white">{organization.name}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
          <div>
            <span className="text-text-secondary uppercase tracking-wide mr-1.5">Type</span>
            <span className="text-white">{organization.orgType.replace(/_/g, ' ')}</span>
          </div>
          {organization.industry && (
            <div>
              <span className="text-text-secondary uppercase tracking-wide mr-1.5">Industry</span>
              <span className="text-white">{organization.industry}</span>
            </div>
          )}
          {organization.website && (
            <div className="sm:col-span-2">
              <span className="text-text-secondary uppercase tracking-wide mr-1.5">Website</span>
              <a
                href={organization.website}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline break-all"
              >
                {organization.website}
              </a>
            </div>
          )}
          {organization.address && (
            <div className="sm:col-span-2">
              <span className="text-text-secondary uppercase tracking-wide mr-1.5">Address</span>
              <span className="text-white">{organization.address}</span>
            </div>
          )}
        </div>
        {organization.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {organization.tags.map((t) => (
              <BusinessTagChip key={t} tag={t} />
            ))}
          </div>
        )}
      </section>

      {/* Description */}
      {organization.descriptionMd && organization.descriptionMd.trim() !== '' && (
        <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Description</h2>
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{organization.descriptionMd}</ReactMarkdown>
          </div>
        </section>
      )}

      {/* People */}
      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">
          People <span className="text-text-secondary font-normal">({people.length})</span>
        </h2>
        {people.length === 0 ? (
          <p className="text-xs text-text-secondary">No people linked to this organization yet.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {people.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/os/business/people/${p.id}`}
                  className="block rounded-md border border-border-subtle p-2.5 hover:border-accent transition"
                >
                  <p className="text-sm text-white">{fullName(p)}</p>
                  {p.role && <p className="text-[11px] text-text-secondary">{p.role}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Interactions */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-3">Interactions</h2>
        <InteractionEditor
          defaultOrganizationId={organization.id}
          onCreated={(i) => setInteractions((prev) => [i, ...prev])}
        />
        <div className="mt-4">
          <InteractionTimeline interactions={interactions} />
        </div>
      </section>
    </div>
  );
}
