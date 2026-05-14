/**
 * Business OS Phase 2 — deal detail page.
 *
 * Wave D (UI Depth Wave) specialization: the ad-hoc `<Link href="?tab=">`
 * strip + per-tab `{activeTab === '...' && ...}` blocks are replaced with the
 * shared `CrossEntityTabs` primitive (via the `DealLinkedTabs` client wrapper).
 * Deep-linking is preserved — `DealLinkedTabs` syncs the active tab back to
 * `?tab=`, so existing `?tab=quotes` links and browser back/forward still work.
 * The server still validates the incoming `?tab=` param and fetches every
 * tab's data up front; no routes or queries changed.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ArrowLeft, Archive, RotateCcw, DollarSign, FileText, Receipt, ScrollText, Sparkles } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getDeal, archiveDeal, restoreDeal } from '@/lib/agentic-os/business/deals-repo';
import { getPerson } from '@/lib/agentic-os/business/people-repo';
import { getOrganization } from '@/lib/agentic-os/business/orgs-repo';
import { listInteractions } from '@/lib/agentic-os/business/interactions-repo';
import { listQuotes } from '@/lib/agentic-os/business/quotes-repo';
import { listInvoices } from '@/lib/agentic-os/business/invoices-repo';
import { listDocuments } from '@/lib/agentic-os/business/documents-repo';
import DocumentList from '@/components/agentic-os/business/document-list';
import DealDetailShell from '@/components/agentic-os/business/deal-detail-shell';
import DealStagePicker from '@/components/agentic-os/business/deal-stage-picker';
import DealLinkedTabs from '@/components/agentic-os/business/deal-linked-tabs';
import DealLinkedRecords from '@/components/agentic-os/business/deal-linked-records';
import type { CrossEntityTab } from '@/components/agentic-os/_shared/views';

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

const TABS = ['overview', 'quotes', 'invoices', 'documents'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function DealDetailPage({ params, searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const sp = await searchParams;
  const activeTab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'overview';

  const deal = await getDeal(id, user.userId);
  if (!deal) notFound();

  const [contact, organization, interactions, quotes, invoices, dealDocuments] = await Promise.all([
    deal.contactId ? getPerson(deal.contactId, user.userId) : null,
    deal.organizationId ? getOrganization(deal.organizationId, user.userId) : null,
    listInteractions(user.userId, { dealId: deal.id, limit: 100 }),
    listQuotes(user.userId, { dealId: deal.id, limit: 500 }),
    listInvoices(user.userId, { dealId: deal.id, limit: 500 }),
    listDocuments(user.userId, { dealId: deal.id, limit: 10 }),
  ]);

  const isArchived = !!deal.archivedAt;

  // Pre-render each tab panel on the server; `CrossEntityTabs` (via
  // `DealLinkedTabs`) lazily mounts a panel the first time its tab is opened
  // but the content itself is already computed here — no client fetching.
  const tabs: CrossEntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: () => (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Link
              href={`/dashboard/os/business/coach?deal_id=${deal.id}&mode=sales_coach`}
              className="inline-flex items-center gap-1.5 text-xs text-os-business hover:text-os-business/80 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask AI Coach about this deal
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-6">
            {isArchived ? (
              <form action={restoreDealAction.bind(null, deal.id)}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary text-sm font-medium px-4 py-2 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore
                </button>
              </form>
            ) : (
              <form action={archiveDealAction.bind(null, deal.id)}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-danger text-sm font-medium px-4 py-2 transition"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
              </form>
            )}
          </div>

          {isArchived && (
            <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-4 text-center">
              <p className="text-sm text-text-secondary">
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
        </>
      ),
    },
    {
      key: 'quotes',
      label: 'Quotes',
      count: quotes.length,
      content: () => (
        <DealLinkedRecords
          kind="quote"
          records={quotes.map((q) => ({
            id: q.id,
            title: q.title,
            ref: q.quoteNumber,
            status: q.status,
            totalCents: q.totalCents,
          }))}
        />
      ),
    },
    {
      key: 'invoices',
      label: 'Invoices',
      count: invoices.length,
      content: () => (
        <DealLinkedRecords
          kind="invoice"
          records={invoices.map((inv) => ({
            id: inv.id,
            title: inv.title,
            ref: inv.invoiceNumber,
            status: inv.status,
            totalCents: inv.totalCents,
          }))}
        />
      ),
    },
    {
      key: 'documents',
      label: 'Documents',
      count: dealDocuments.length,
      content: () => (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Documents</h3>
            <Link
              href={`/dashboard/os/business/documents?deal_id=${deal.id}`}
              className="text-xs text-accent hover:underline"
            >
              View all →
            </Link>
          </div>
          <DocumentList documents={dealDocuments} />
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/deals"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Deals
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <DollarSign className="w-6 h-6 text-os-business shrink-0" />
          <h1 className="text-2xl font-semibold text-text-primary truncate">{deal.title}</h1>
          <DealStagePicker stage={deal.stage} />
        </div>
      </div>

      {/*
        Tab navigation — shared `CrossEntityTabs` via the `DealLinkedTabs`
        client wrapper. Deep-linking is preserved: the wrapper seeds its
        active tab from the server-validated `?tab=` param and mirrors tab
        changes back into the URL.
      */}
      <DealLinkedTabs tabs={tabs} activeTab={activeTab} />
    </div>
  );
}
