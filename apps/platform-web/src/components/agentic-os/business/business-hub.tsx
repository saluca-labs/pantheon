'use client';

/**
 * Business OS Phase 1 — hub landing.  Renders three cards:
 *   - People        (count of non-archived people)
 *   - Organizations (count of non-archived orgs)
 *   - Recent activity (last 10 interactions)
 *
 * Future phases add Deals / Projects / Quotes & Invoices / Expenses /
 * Documents / Coach cards as those phases ship.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import { Users, Building2, Activity } from 'lucide-react';
import type { Interaction, Person, Organization } from '@/lib/agentic-os/business/crm';
import { InteractionTypePill } from './interaction-type-pill';

interface Props {
  peopleCount: number;
  orgsCount: number;
  recentInteractions: Interaction[];
  recentPeople?: Pick<Person, 'id' | 'firstName' | 'lastName'>[];
  recentOrgs?: Pick<Organization, 'id' | 'name'>[];
}

export function BusinessHub({
  peopleCount,
  orgsCount,
  recentInteractions,
  recentPeople = [],
  recentOrgs = [],
}: Props) {
  const personById = new Map(recentPeople.map((p) => [p.id, p]));
  const orgById = new Map(recentOrgs.map((o) => [o.id, o]));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Link
        href="/dashboard/os/business/people"
        className="group rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 hover:border-[#4361EE] transition"
      >
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-teal-300" />
          <h2 className="text-sm font-semibold text-white">People</h2>
        </div>
        <p className="text-3xl font-semibold text-white mb-1">{peopleCount}</p>
        <p className="text-xs text-[#94a3b8]">Active contacts. Click to browse.</p>
      </Link>

      <Link
        href="/dashboard/os/business/organizations"
        className="group rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 hover:border-[#4361EE] transition"
      >
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-5 h-5 text-teal-300" />
          <h2 className="text-sm font-semibold text-white">Organizations</h2>
        </div>
        <p className="text-3xl font-semibold text-white mb-1">{orgsCount}</p>
        <p className="text-xs text-[#94a3b8]">Active companies + partners.</p>
      </Link>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-teal-300" />
          <h2 className="text-sm font-semibold text-white">Recent activity</h2>
        </div>
        {recentInteractions.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">No interactions logged yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {recentInteractions.slice(0, 10).map((i) => {
              const who = i.personId ? personById.get(i.personId) : null;
              const org = i.organizationId ? orgById.get(i.organizationId) : null;
              const label =
                who ? `${who.firstName} ${who.lastName}` : org ? org.name : '—';
              return (
                <li key={i.id} className="flex items-start gap-2 text-xs">
                  <InteractionTypePill type={i.interactionType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white truncate">
                      <span className="font-medium">{label}</span>
                      {' — '}
                      <span className="text-[#94a3b8]">{i.summary}</span>
                    </p>
                    <p className="text-[10px] text-[#94a3b8]/70">
                      {new Date(i.occurredAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
