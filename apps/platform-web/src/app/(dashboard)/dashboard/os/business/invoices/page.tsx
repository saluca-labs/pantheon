/**
 * Business OS Phase 4 — invoices list page.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import { Receipt, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listInvoices } from '@/lib/agentic-os/business/invoices-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listDeals } from '@/lib/agentic-os/business/deals-repo';
import { listProjects } from '@/lib/agentic-os/business/projects-repo';
import { getOrCreateSettings } from '@/lib/agentic-os/business/settings-repo';
import InvoiceForm from '@/components/agentic-os/business/invoice-form';

export const dynamic = 'force-dynamic';

const STATUSES = ['all', 'draft', 'sent', 'partial', 'paid', 'overdue', 'voided'] as const;

const statusColors: Record<string, string> = {
  draft: 'bg-surface-3 text-text-tertiary border-border-subtle',
  sent: 'bg-accent/15 text-accent border-accent/30',
  partial: 'bg-warning/15 text-warning border-warning/30',
  paid: 'bg-positive/15 text-positive border-positive/30',
  overdue: 'bg-danger/15 text-danger border-danger/30',
  voided: 'bg-surface-2 text-text-tertiary border-border-subtle',
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function gaugePct(paid: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((paid / total) * 100));
}

interface Props {
  searchParams: Promise<{
    new?: string;
    status?: string;
    outstanding?: string;
  }>;
}

export default async function InvoicesPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const showNew = sp.new === '1';
  const activeStatus = STATUSES.includes(sp.status as any) ? sp.status : 'all';
  const outstandingOnly = sp.outstanding === '1';

  const [invoices, people, deals, projects, settingsResult] = await Promise.all([
    listInvoices(user.userId, {
      outstanding: outstandingOnly || undefined,
      limit: 500,
    }),
    listPeople(user.userId, { archived: false, limit: 500 }),
    listDeals(user.userId, { limit: 500 }),
    listProjects(user.userId, { limit: 500 }),
    getOrCreateSettings(user.userId),
  ]);
  const { settings } = settingsResult;

  const personMap = new Map(people.map((p) => [p.id, p]));
  const contacts = people.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }));
  const dealsList = deals.map((d) => ({ id: d.id, title: d.title }));
  const projectsList = projects.map((p) => ({ id: p.id, title: p.title }));

  const filtered =
    activeStatus === 'all'
      ? invoices
      : invoices.filter((i) => i.status === activeStatus);

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Business OS
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Receipt className="w-6 h-6 text-os-business" />
          <h1 className="text-2xl font-semibold text-white">Invoices</h1>
        </div>
        <Link
          href="?new=1"
          className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New invoice
        </Link>
      </div>

      {showNew && (
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2 p-6">
          <InvoiceForm
            contacts={contacts}
            deals={dealsList}
            projects={projectsList}
            settings={settings}
          />
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 flex-wrap">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '?' : `?status=${s}`}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeStatus === s
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-subtle bg-surface-2 text-text-secondary hover:text-white hover:border-accent/50'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
        <Link
          href={outstandingOnly ? '?' : '?outstanding=1'}
          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            outstandingOnly
              ? 'border-warning bg-warning/10 text-warning'
              : 'border-border-subtle bg-surface-2 text-text-secondary hover:text-white hover:border-warning/50'
          }`}
        >
          Outstanding only
        </Link>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((inv) => {
            const contact = inv.contactId ? personMap.get(inv.contactId) : null;
            const pct = gaugePct(inv.paidCents, inv.totalCents);

            return (
              <Link
                key={inv.id}
                href={`/dashboard/os/business/invoices/${inv.id}`}
                className="rounded-xl border border-border-subtle bg-surface-2 hover:border-accent/30 p-5 transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-text-tertiary font-mono">
                    {inv.invoiceNumber}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                      statusColors[inv.status] ?? statusColors.draft
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-white group-hover:text-os-business transition-colors mb-1 truncate">
                  {inv.title}
                </h3>
                {contact && (
                  <p className="text-xs text-text-secondary mb-2">
                    {contact.firstName} {contact.lastName}
                  </p>
                )}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-text-tertiary">
                    {inv.invoiceDate}
                    {inv.dueOn && ` — Due ${inv.dueOn}`}
                  </p>
                  <p className="text-sm font-mono font-bold text-white">
                    {fmtCents(inv.totalCents)}
                  </p>
                </div>
                {/* Paid gauge */}
                {inv.totalCents > 0 && (
                  <div>
                    <div className="h-1.5 rounded-full bg-surface-0 border border-border-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full bg-os-business transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1 text-right">
                      {fmtCents(inv.paidCents)} paid ({pct}%)
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-12 text-center">
          <Receipt className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary text-sm">
            {invoices.length === 0
              ? 'No invoices yet. Create your first invoice or convert a quote.'
              : 'No invoices match the selected filter.'}
          </p>
        </div>
      )}
    </div>
  );
}
