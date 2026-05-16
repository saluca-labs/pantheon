/**
 * Business OS Phase 1 — people list page.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listOrganizations } from '@/lib/agentic-os/business/orgs-repo';
import { PeopleList } from '@/components/agentic-os/business/people-list';
import { PersonForm } from '@/components/agentic-os/business/person-form';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ new?: string }>;
}

export default async function BusinessPeoplePage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const showNew = sp.new === '1';

  // Load active + archived in one shot so the filter-chip toggle has
  // both available without a round-trip.
  const [active, archived, organizations] = await Promise.all([
    listPeople(user.userId, { archived: false, limit: 500 }),
    listPeople(user.userId, { archived: true, limit: 500 }),
    listOrganizations(user.userId, { archived: false, limit: 500 }),
  ]);
  const people = [...active, ...archived];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Business OS
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-os-business" />
          <h1 className="text-2xl font-semibold text-white">People</h1>
        </div>
        <Link
          href="/dashboard/os/business/people?new=1"
          className="rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium px-3 py-1.5 transition"
        >
          + Add person
        </Link>
      </div>

      {showNew && (
        <div className="mb-6">
          <PersonForm
            organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
          />
        </div>
      )}

      <PeopleList
        initialPeople={people}
        organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
      />
    </div>
  );
}
