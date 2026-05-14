'use client';

/**
 * Business OS Phase 1 — person-detail page client shell.
 *
 * Wraps the description renderer + interaction timeline.  The page-level
 * server component owns auth + initial data fetch; this shell handles
 * the post-mount client state.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type {
  Interaction,
  Person,
  Organization,
} from '@/lib/agentic-os/business/crm';
import { fullName } from '@/lib/agentic-os/business/crm';
import { BusinessTagChip } from './business-tag-chip';
import { InteractionEditor } from './interaction-editor';
import { InteractionTimeline } from './interaction-timeline';

interface Props {
  person: Person;
  organization: Pick<Organization, 'id' | 'name'> | null;
  initialInteractions: Interaction[];
}

export function PersonDetailShell({ person, organization, initialInteractions }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>(initialInteractions);

  return (
    <div className="space-y-6">
      {/* Meta card */}
      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-2">
        <h1 className="text-xl font-semibold text-white">{fullName(person)}</h1>
        {person.role && <p className="text-sm text-text-secondary">{person.role}</p>}
        {organization && (
          <p className="text-sm text-text-secondary">
            <span className="text-white">{organization.name}</span>
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
          {person.email && (
            <div>
              <span className="text-text-secondary uppercase tracking-wide mr-1.5">Email</span>
              <span className="text-white">{person.email}</span>
            </div>
          )}
          {person.phone && (
            <div>
              <span className="text-text-secondary uppercase tracking-wide mr-1.5">Phone</span>
              <span className="text-white">{person.phone}</span>
            </div>
          )}
          {person.address && (
            <div className="sm:col-span-2">
              <span className="text-text-secondary uppercase tracking-wide mr-1.5">Address</span>
              <span className="text-white">{person.address}</span>
            </div>
          )}
          <div>
            <span className="text-text-secondary uppercase tracking-wide mr-1.5">Stage / Tier</span>
            <span className="text-white">{person.stage}</span>
          </div>
        </div>
        {person.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {person.tags.map((t) => (
              <BusinessTagChip key={t} tag={t} />
            ))}
          </div>
        )}
      </section>

      {/* Description (markdown — no rehype-raw) */}
      {person.descriptionMd && person.descriptionMd.trim() !== '' && (
        <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Description</h2>
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{person.descriptionMd}</ReactMarkdown>
          </div>
        </section>
      )}

      {/* Interactions */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-3">Interactions</h2>
        <InteractionEditor
          defaultPersonId={person.id}
          defaultOrganizationId={person.organizationId}
          onCreated={(i) => setInteractions((prev) => [i, ...prev])}
        />
        <div className="mt-4">
          <InteractionTimeline interactions={interactions} />
        </div>
      </section>
    </div>
  );
}
