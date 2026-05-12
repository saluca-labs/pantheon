/**
 * Business OS Phase 2 — deal detail page.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ArrowLeft, Archive, RotateCcw, DollarSign } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getDeal, archiveDeal, restoreDeal } from '@/lib/agentic-os/business/deals-repo';
import { getPerson } from '@/lib/agentic-os/business/people-repo';
import { getOrganization } from '@/lib/agentic-os/business/orgs-repo';
import { listInteractions } from '@/lib/agentic-os/business/interactions-repo';
import DealDetailShell from '@/components/agentic-os/business/deal-detail-shell';
import DealStagePicker from '@/components/agentic-os/business/deal-stage-picker';

export const dynamic = 'force-dynamic';

async function archiveDealAction(id: string) {
  'use server';
  const user = await getCurrentBusinessUser();
  if (!user) return;
  await archiveDeal(id, user.userId);
  revalidatePath('/dashboard/os/business/deals/[id]', 'page');
  revalidatePath('/dashboard/os/business/deals', 'page');
}

async function restoreDealAction(id: string) {
  'use server';
  const user = await getCurrentBusinessUser();
  if (!user) return;
  const result = await restoreDeal(id, user.userId);
  if (result && !result.alreadyActive) {
    revalidatePath('/dashboard/os/business/deals/[id]', 'page');
    revalidatePath('/dashboard/os/business/deals', 'page');
  }
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DealDetailPage({ params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { id } = await params;

  const deal = await getDeal(id, user.userId);
  if (!deal) notFound();

  const [contact, organization, interactions] = await Promise.all([
    deal.contactId ? getPerson(deal.contactId, user.userId) : null,
    deal.organizationId ? getOrganization(deal.organizationId, user.userId) : null,
    listInteractions(user.userId, { dealId: deal.id, limit: 100 }),
  ]);

  const isArchived = !!deal.archivedAt;

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/deals"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Deals
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <DollarSign className="w-6 h-6 text-teal-300 shrink-0" />
          <h1 className="text-2xl font-semibold text-white truncate">{deal.title}</h1>
          <DealStagePicker stage={deal.stage} />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        {isArchived ? (
          <form action={restoreDealAction.bind(null, deal.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:bg-[#252836] text-[#94a3b8] hover:text-white text-sm font-medium px-4 py-2 transition"
            >
              <RotateCcw className="w-4 h-4" />
              Restore
            </button>
          </form>
        ) : (
          <form action={archiveDealAction.bind(null, deal.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:bg-[#252836] text-[#94a3b8] hover:text-red-400 text-sm font-medium px-4 py-2 transition"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </form>
        )}
      </div>

      {isArchived && (
        <div className="mb-6 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 text-center">
          <p className="text-sm text-[#94a3b8]">
            This deal is archived. Restore it to make changes.
          </p>
        </div>
      )}

      <DealDetailShell
        deal={deal}
        contact={contact}
        organization={organization}
        initialInteractions={interactions}
      />
    </div>
  );
}
