/**
 * Business OS Phase 6 — document templates list page.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listTemplates } from '@/lib/agentic-os/business/doc-templates-repo';
import TemplateList from '@/components/agentic-os/business/template-list';
import type { DocTemplateKind } from '@/lib/agentic-os/business/doc-templates';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

export default async function TemplatesPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const kindFilter = sp.kind as DocTemplateKind | undefined;

  const templates = await listTemplates(user.userId, {
    kind: kindFilter,
    limit: 200,
  });

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Document Templates</h1>
          <p className="text-sm text-text-secondary mt-1">
            Reusable NDA, SOW, MSA, and custom templates with version history.
          </p>
        </div>
        <Link
          href="/dashboard/os/business/templates/new"
          className="rounded-lg bg-accent hover:bg-[#3a56d4] text-white px-4 py-2 text-sm font-medium inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New template
        </Link>
      </div>

      <TemplateList
        templates={templates}
        kindFilter={kindFilter}
        onKindChange={undefined}
      />
    </div>
  );
}
