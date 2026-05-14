/**
 * Business OS Phase 6 — documents list page.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listDocuments } from '@/lib/agentic-os/business/documents-repo';
import { listTemplates } from '@/lib/agentic-os/business/doc-templates-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listDeals } from '@/lib/agentic-os/business/deals-repo';
import { listProjects } from '@/lib/agentic-os/business/projects-repo';
import DocumentList from '@/components/agentic-os/business/document-list';
import DocumentForm from '@/components/agentic-os/business/document-form';
import type { DocumentStatus } from '@/lib/agentic-os/business/documents';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    status?: string;
    project_id?: string;
    deal_id?: string;
    contact_id?: string;
    new?: string;
  }>;
}

export default async function DocumentsPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const statusFilter = sp.status as DocumentStatus | undefined;
  const showNew = sp.new === '1';

  const [documents, templates, people, deals, projects] = await Promise.all([
    listDocuments(user.userId, {
      status: statusFilter,
      projectId: sp.project_id,
      dealId: sp.deal_id,
      contactId: sp.contact_id,
      limit: 200,
    }),
    listTemplates(user.userId, { limit: 500 }),
    listPeople(user.userId, { archived: false, limit: 500 }),
    listDeals(user.userId, { limit: 500 }),
    listProjects(user.userId, { limit: 500 }),
  ]);

  const contacts = people.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
  }));
  const dealsList = deals.map((d) => ({ id: d.id, title: d.title }));
  const projectsList = projects.map((p) => ({ id: p.id, title: p.title }));

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Documents</h1>
          <p className="text-sm text-text-secondary mt-1">
            Per-engagement documents with lifecycle tracking and e-signature.
          </p>
        </div>
        <Link
          href="?new=1"
          className="rounded-lg bg-accent hover:bg-[#3a56d4] text-white px-4 py-2 text-sm font-medium inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New document
        </Link>
      </div>

      {showNew && (
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-6">
          <DocumentForm
            templates={templates}
            contacts={contacts}
            deals={dealsList}
            projects={projectsList}
            onSuccess={() => {}}
          />
        </div>
      )}

      <DocumentList
        documents={documents}
        statusFilter={statusFilter}
        onStatusChange={undefined}
      />
    </div>
  );
}
