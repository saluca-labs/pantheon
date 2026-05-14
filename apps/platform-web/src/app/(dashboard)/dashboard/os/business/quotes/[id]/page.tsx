/**
 * Business OS Phase 4 — quote detail page.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ArrowLeft, Send, ArrowRightLeft, FileText } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getQuote } from '@/lib/agentic-os/business/quotes-repo';
import { listLineItems } from '@/lib/agentic-os/business/line-items-repo';
import { getPerson } from '@/lib/agentic-os/business/people-repo';
import { getDeal } from '@/lib/agentic-os/business/deals-repo';
import { getProject } from '@/lib/agentic-os/business/projects-repo';
import LineItemForm from '@/components/agentic-os/business/line-item-form';

export const dynamic = 'force-dynamic';

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

async function sendQuoteAction(id: string) {
  'use server';
  const user = await getCurrentBusinessUser();
  if (!user) return;
  await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/tiresias/agentic-os/business/quotes/${id}/send`,
    { method: 'POST' },
  );
  revalidatePath('/dashboard/os/business/quotes/[id]', 'page');
  revalidatePath('/dashboard/os/business/quotes', 'page');
}

async function convertQuoteAction(id: string) {
  'use server';
  const user = await getCurrentBusinessUser();
  if (!user) return;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/tiresias/agentic-os/business/quotes/${id}/convert`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  if (res.ok) {
    const data = await res.json();
    revalidatePath('/dashboard/os/business/quotes/[id]', 'page');
    revalidatePath('/dashboard/os/business/quotes', 'page');
    revalidatePath('/dashboard/os/business/invoices', 'page');
  }
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuoteDetailPage({ params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const quote = await getQuote(id, user.userId);
  if (!quote) notFound();

  const [lineItems, contact, deal, project] = await Promise.all([
    listLineItems('quote', id, user.userId),
    quote.contactId ? getPerson(quote.contactId, user.userId) : null,
    quote.dealId ? getDeal(quote.dealId, user.userId) : null,
    quote.projectId ? getProject(quote.projectId, user.userId) : null,
  ]);

  const isDraft = quote.status === 'draft';
  const canConvert = quote.status === 'sent' || quote.status === 'accepted';

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/quotes"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Quotes
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="w-6 h-6 text-teal-300 shrink-0" />
          <h1 className="text-2xl font-semibold text-white truncate">{quote.title}</h1>
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
              statusColors[quote.status] ?? statusColors.draft
            }`}
          >
            {quote.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <form action={sendQuoteAction.bind(null, quote.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 hover:bg-[#252836] text-text-secondary hover:text-white text-sm font-medium px-4 py-2 transition"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
          )}
          {canConvert && (
            <form action={convertQuoteAction.bind(null, quote.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium px-4 py-2 transition-colors"
              >
                <ArrowRightLeft className="w-4 h-4" />
                Convert to Invoice
              </button>
            </form>
          )}
          <Link
            href={`/api/tiresias/agentic-os/business/quotes/${quote.id}/export.pdf`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 hover:bg-[#252836] text-text-secondary hover:text-white text-sm font-medium px-4 py-2 transition"
          >
            Export PDF
          </Link>
        </div>
      </div>

      {/* Meta Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <p className="text-xs text-[#64748b] mb-1">Quote Number</p>
          <p className="text-sm text-white font-mono">{quote.quoteNumber}</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <p className="text-xs text-[#64748b] mb-1">Dates</p>
          <p className="text-xs text-text-secondary">Date: {quote.quoteDate}</p>
          {quote.expiresOn && (
            <p className="text-xs text-text-secondary">Expires: {quote.expiresOn}</p>
          )}
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <p className="text-xs text-[#64748b] mb-1">Totals</p>
          <p className="text-sm text-white font-bold">{fmtCents(quote.totalCents)}</p>
          <p className="text-xs text-text-secondary">
            Sub {fmtCents(quote.subtotalCents)} + Tax {fmtCents(quote.taxCents)}
          </p>
        </div>
      </div>

      {/* Linked entities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <p className="text-xs text-[#64748b] mb-1">Contact</p>
          {contact ? (
            <Link
              href={`/dashboard/os/business/people/${contact.id}`}
              className="text-sm text-teal-300 hover:underline"
            >
              {contact.firstName} {contact.lastName}
            </Link>
          ) : (
            <p className="text-sm text-text-secondary">None</p>
          )}
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <p className="text-xs text-[#64748b] mb-1">Deal</p>
          {deal ? (
            <Link
              href={`/dashboard/os/business/deals/${deal.id}`}
              className="text-sm text-teal-300 hover:underline"
            >
              {deal.title}
            </Link>
          ) : (
            <p className="text-sm text-text-secondary">None</p>
          )}
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <p className="text-xs text-[#64748b] mb-1">Project</p>
          {project ? (
            <Link
              href={`/dashboard/os/business/projects/${project.id}`}
              className="text-sm text-teal-300 hover:underline"
            >
              {project.title}
            </Link>
          ) : (
            <p className="text-sm text-text-secondary">None</p>
          )}
        </div>
      </div>

      {/* Description */}
      {quote.descriptionMd && (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5 mb-6">
          <p className="text-xs text-[#64748b] mb-2">Description</p>
          <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
            {quote.descriptionMd}
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">
            Line Items ({lineItems.length})
          </h2>
        </div>

        {isDraft && (
          <div className="mb-4">
            <LineItemForm parentType="quote" parentId={id} />
          </div>
        )}

        {lineItems.length > 0 ? (
          <div className="space-y-2">
            {lineItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border-subtle bg-surface-0 px-4 py-3 flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{item.description}</p>
                  <p className="text-[10px] text-[#64748b]">
                    {item.quantity} x {item.unitLabel || 'unit'} @ {fmtCents(item.unitPriceCents)}
                    {item.taxRateBp > 0 && ` (${(item.taxRateBp / 100).toFixed(1)}% tax)`}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-mono text-white">
                    {fmtCents(item.lineTotalCents)}
                  </p>
                  {item.lineTaxCents > 0 && (
                    <p className="text-[10px] text-text-secondary">
                      +{fmtCents(item.lineTaxCents)} tax
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary text-center py-4">
            No line items yet.
          </p>
        )}
      </div>
    </div>
  );
}
