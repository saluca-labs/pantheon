/**
 * Business OS Phase 1 — person detail page.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, FileText, Receipt } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getPerson } from '@/lib/agentic-os/business/people-repo';
import { getOrganization } from '@/lib/agentic-os/business/orgs-repo';
import { listInteractions } from '@/lib/agentic-os/business/interactions-repo';
import { listQuotes } from '@/lib/agentic-os/business/quotes-repo';
import { listInvoices } from '@/lib/agentic-os/business/invoices-repo';
import { PersonDetailShell } from '@/components/agentic-os/business/person-detail-shell';
import { PersonArchiveButton } from '@/components/agentic-os/business/person-archive-button';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'quotes', 'invoices'] as const;
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

export default async function PersonDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const activeTab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'overview';

  const person = await getPerson(id, user.userId);
  if (!person) notFound();

  const [organization, interactions, quotes, invoices] = await Promise.all([
    person.organizationId
      ? getOrganization(person.organizationId, user.userId)
      : Promise.resolve(null),
    listInteractions(user.userId, { personId: person.id, limit: 100 }),
    listQuotes(user.userId, { contactId: id, limit: 500 }),
    listInvoices(user.userId, { contactId: id, limit: 500 }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/people"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to People
      </Link>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-border-subtle">
        {TABS.map((tab) => {
          const icons: Record<Tab, React.ReactNode> = {
            overview: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
            quotes: <FileText className="w-3.5 h-3.5" />,
            invoices: <Receipt className="w-3.5 h-3.5" />,
          };
          return (
            <Link
              key={tab}
              href={tab === 'overview' ? '?' : `?tab=${tab}`}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-accent text-white'
                  : 'border-transparent text-text-secondary hover:text-white hover:border-border-subtle'
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
          <div className="flex items-center justify-end gap-2 mb-4">
            <PersonArchiveButton personId={person.id} archived={person.archivedAt != null} />
          </div>

          <PersonDetailShell
            person={person}
            organization={organization ? { id: organization.id, name: organization.name } : null}
            initialInteractions={interactions}
          />
        </>
      )}

      {/* ─── QUOTES TAB ────────────────────────────────────────────────── */}
      {activeTab === 'quotes' && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {quotes.length} quote{quotes.length !== 1 ? 's' : ''} for this contact
          </p>
          {quotes.length > 0 ? (
            quotes.map((q) => (
              <Link
                key={q.id}
                href={`/dashboard/os/business/quotes/${q.id}`}
                className="block rounded-lg border border-border-subtle bg-surface-0 hover:border-accent/30 px-4 py-3 transition-colors"
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
            <p className="text-sm text-[#64748b] py-4">No quotes for this contact yet.</p>
          )}
        </div>
      )}

      {/* ─── INVOICES TAB ──────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} for this contact
          </p>
          {invoices.length > 0 ? (
            invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/os/business/invoices/${inv.id}`}
                className="block rounded-lg border border-border-subtle bg-surface-0 hover:border-accent/30 px-4 py-3 transition-colors"
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
            <p className="text-sm text-[#64748b] py-4">No invoices for this contact yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
