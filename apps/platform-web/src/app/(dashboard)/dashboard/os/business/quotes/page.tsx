/**
 * Business OS Phase 4 — quotes list page.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listQuotes } from '@/lib/agentic-os/business/quotes-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listDeals } from '@/lib/agentic-os/business/deals-repo';
import { listProjects } from '@/lib/agentic-os/business/projects-repo';
import { getOrCreateSettings } from '@/lib/agentic-os/business/settings-repo';
import QuoteForm from '@/components/agentic-os/business/quote-form';

export const dynamic = 'force-dynamic';

const STATUSES = ['all', 'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'] as const;

const statusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  accepted: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  rejected: 'bg-red-900/40 text-red-300 border-red-800',
  expired: 'bg-amber-900/40 text-amber-300 border-amber-800',
  converted: 'bg-violet-900/40 text-violet-300 border-violet-800',
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Props {
  searchParams: Promise<{ new?: string; status?: string }>;
}

export default async function QuotesPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const showNew = sp.new === '1';
  const activeStatus = STATUSES.includes(sp.status as any) ? sp.status : 'all';

  const [quotes, people, deals, projects, settingsResult] = await Promise.all([
    listQuotes(user.userId, { limit: 500 }),
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

  const filtered = activeStatus === 'all'
    ? quotes
    : quotes.filter((q) => q.status === activeStatus);

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Business OS
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-teal-300" />
          <h1 className="text-2xl font-semibold text-white">Quotes</h1>
        </div>
        <Link
          href="?new=1"
          className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New quote
        </Link>
      </div>

      {showNew && (
        <div className="mb-6 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
          <QuoteForm
            contacts={contacts}
            deals={dealsList}
            projects={projectsList}
            settings={settings}
          />
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '?' : `?status=${s}`}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeStatus === s
                ? 'border-[#4361EE] bg-[#4361EE]/10 text-[#4361EE]'
                : 'border-[#2a2d3e] bg-[#1a1d27] text-[#94a3b8] hover:text-white hover:border-[#4361EE]/50'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      {/* Quote cards */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((q) => {
            const contact = q.contactId ? personMap.get(q.contactId) : null;
            return (
              <Link
                key={q.id}
                href={`/dashboard/os/business/quotes/${q.id}`}
                className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] hover:border-[#4361EE]/30 p-5 transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-[#64748b] font-mono">
                    {q.quoteNumber}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                      statusColors[q.status] ?? statusColors.draft
                    }`}
                  >
                    {q.status}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-white group-hover:text-teal-300 transition-colors mb-1 truncate">
                  {q.title}
                </h3>
                {contact && (
                  <p className="text-xs text-[#94a3b8] mb-2">
                    {contact.firstName} {contact.lastName}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#64748b]">{q.quoteDate}</p>
                  <p className="text-sm font-mono font-bold text-white">
                    {fmtCents(q.totalCents)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-12 text-center">
          <FileText className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
          <p className="text-[#94a3b8] text-sm">
            {quotes.length === 0
              ? 'No quotes yet. Create your first quote to start estimating work.'
              : 'No quotes match the selected filter.'}
          </p>
        </div>
      )}
    </div>
  );
}
