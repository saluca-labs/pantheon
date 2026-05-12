/**
 * Business OS Phase 1 — person detail page.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getPerson } from '@/lib/agentic-os/business/people-repo';
import { getOrganization } from '@/lib/agentic-os/business/orgs-repo';
import { listInteractions } from '@/lib/agentic-os/business/interactions-repo';
import { PersonDetailShell } from '@/components/agentic-os/business/person-detail-shell';
import { PersonArchiveButton } from '@/components/agentic-os/business/person-archive-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PersonDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const person = await getPerson(id, user.userId);
  if (!person) notFound();

  const [organization, interactions] = await Promise.all([
    person.organizationId
      ? getOrganization(person.organizationId, user.userId)
      : Promise.resolve(null),
    listInteractions(user.userId, { personId: person.id, limit: 100 }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/people"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to People
      </Link>

      <div className="flex items-center justify-end gap-2 mb-4">
        <PersonArchiveButton personId={person.id} archived={person.archivedAt != null} />
      </div>

      <PersonDetailShell
        person={person}
        organization={organization ? { id: organization.id, name: organization.name } : null}
        initialInteractions={interactions}
      />
    </div>
  );
}
