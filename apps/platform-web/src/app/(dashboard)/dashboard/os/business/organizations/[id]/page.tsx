/**
 * Business OS Phase 1 — organization detail page.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getOrganization } from '@/lib/agentic-os/business/orgs-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listInteractions } from '@/lib/agentic-os/business/interactions-repo';
import { OrganizationDetailShell } from '@/components/agentic-os/business/organization-detail-shell';
import { OrganizationArchiveButton } from '@/components/agentic-os/business/organization-archive-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrgDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const organization = await getOrganization(id, user.userId);
  if (!organization) notFound();

  const [people, interactions] = await Promise.all([
    listPeople(user.userId, { organizationId: id, archived: false, limit: 500 }),
    listInteractions(user.userId, { organizationId: id, limit: 100 }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Organizations
      </Link>

      <div className="flex items-center justify-end gap-2 mb-4">
        <OrganizationArchiveButton
          organizationId={organization.id}
          archived={organization.archivedAt != null}
        />
      </div>

      <OrganizationDetailShell
        organization={organization}
        people={people}
        initialInteractions={interactions}
      />
    </div>
  );
}
