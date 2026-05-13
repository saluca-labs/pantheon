/**
 * Business OS Phase 2 — deal detail page.
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

const quoteStatusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  accepted: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  rejected: 'bg-red-900/40 text-red-300 border-red-800',
  expired: 'bg-amber-900/40 text-amber-300 border-amber-800',
  converted: 'bg-violet-900/40 text-violet-300 border-violet-800',
};

const invoiceStatusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  partial: 'bg-amber-900/40 text-amber-300 border-amber-800',
  paid: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  overdue: 'bg-red-900/40 text-red-300 border-red-800',
  voided: 'bg-slate-900/40 text-slate-500 border-slate-800',
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-[#2a2d3e]">
        {TABS.map((tab) => {
          const icons: Record<Tab, React.ReactNode> = {
            overview: <DollarSign className="w-3.5 h-3.5" />,
            quotes: <FileText className="w-3.5 h-3.5" />,
            invoices: <Receipt className="w-3.5 h-3.5" />,
            documents: <ScrollText className="w-3.5 h-3.5" />,
          };
          return (
            <Link
              key={tab}
              href={`?tab=${tab}`}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#4361EE] text-white'
                  : 'border-transparent text-[#94a3b8] hover:text-white hover:border-[#2a2d3e]'
              }`}
            >
              {icons[tab]}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Link>
          );
        })}
      </div>

      {/* ─── OVERVIEW TAB ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Link
              href={`/dashboard/os/business/coach?deal_id=${deal.id}&mode=sales_coach`}
              className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors"
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
        </>
      )}

      {/* ─── QUOTES TAB ────────────────────────────────────────────────── */}
      {activeTab === 'quotes' && (
        <div className="space-y-3">
          <p className="text-sm text-[#94a3b8]">
            {quotes.length} quote{quotes.length !== 1 ? 's' : ''} linked to this deal
          </p>
          {quotes.length > 0 ? (
            quotes.map((q) => (
              <Link
                key={q.id}
                href={`/dashboard/os/business/quotes/${q.id}`}
                className="block rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/30 px-4 py-3 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{q.title}</p>
                    <p className="text-[10px] text-[#64748b] font-mono">{q.quoteNumber}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${quoteStatusColors[q.status] ?? quoteStatusColors.draft}`}>
                      {q.status}
                    </span>
                    <span className="text-sm font-mono text-white">{fmtCents(q.totalCents)}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-[#64748b] py-4">No quotes linked to this deal yet.</p>
          )}
        </div>
      )}

      {/* ─── INVOICES TAB ──────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="space-y-3">
          <p className="text-sm text-[#94a3b8]">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} linked to this deal
          </p>
          {invoices.length > 0 ? (
            invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/os/business/invoices/${inv.id}`}
                className="block rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/30 px-4 py-3 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{inv.title}</p>
                    <p className="text-[10px] text-[#64748b] font-mono">{inv.invoiceNumber}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${invoiceStatusColors[inv.status] ?? invoiceStatusColors.draft}`}>
                      {inv.status}
                    </span>
                    <span className="text-sm font-mono text-white">{fmtCents(inv.totalCents)}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-[#64748b] py-4">No invoices linked to this deal yet.</p>
          )}
        </div>
      )}

      {/* ─── DOCUMENTS TAB ─────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Documents</h3>
            <Link href={`/dashboard/os/business/documents?deal_id=${deal.id}`} className="text-xs text-[#4361EE] hover:underline">
              View all →
            </Link>
          </div>
          <DocumentList documents={dealDocuments} />
        </div>
      )}
    </div>
  );
}
