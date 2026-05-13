/**
 * Business OS Phase 4 — invoice detail page.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ArrowLeft, Send, Ban, Plus, Clock, Sparkles } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getInvoice } from '@/lib/agentic-os/business/invoices-repo';
import { listLineItems } from '@/lib/agentic-os/business/line-items-repo';
import { listPayments } from '@/lib/agentic-os/business/payments-repo';
import { getPerson } from '@/lib/agentic-os/business/people-repo';
import { getDeal } from '@/lib/agentic-os/business/deals-repo';
import { getProject } from '@/lib/agentic-os/business/projects-repo';
import { listTimeEntries } from '@/lib/agentic-os/business/time-entries-repo';
import LineItemForm from '@/components/agentic-os/business/line-item-form';
import PaymentForm from '@/components/agentic-os/business/payment-form';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  partial: 'bg-amber-900/40 text-amber-300 border-amber-800',
  paid: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  overdue: 'bg-red-900/40 text-red-300 border-red-800',
  voided: 'bg-slate-900/40 text-slate-500 border-slate-800',
};

const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  check: 'Check',
  cash: 'Cash',
  card: 'Card',
  stripe: 'Stripe',
  paypal: 'PayPal',
  wire: 'Wire',
  other: 'Other',
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function sendInvoiceAction(id: string) {
  'use server';
  const user = await getCurrentBusinessUser();
  if (!user) return;
  await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/tiresias/agentic-os/business/invoices/${id}/send`,
    { method: 'POST' },
  );
  revalidatePath('/dashboard/os/business/invoices/[id]', 'page');
  revalidatePath('/dashboard/os/business/invoices', 'page');
}

async function voidInvoiceAction(id: string) {
  'use server';
  const user = await getCurrentBusinessUser();
  if (!user) return;
  await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/tiresias/agentic-os/business/invoices/${id}/void`,
    { method: 'POST' },
  );
  revalidatePath('/dashboard/os/business/invoices/[id]', 'page');
  revalidatePath('/dashboard/os/business/invoices', 'page');
}

async function billTimeEntriesAction(id: string) {
  'use server';
  const user = await getCurrentBusinessUser();
  if (!user) return;
  await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/tiresias/agentic-os/business/invoices/${id}/from-time-entries`,
    { method: 'POST' },
  );
  revalidatePath('/dashboard/os/business/invoices/[id]', 'page');
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const invoice = await getInvoice(id, user.userId);
  if (!invoice) notFound();

  const [lineItems, payments, contact, deal, project] = await Promise.all([
    listLineItems('invoice', id, user.userId),
    listPayments(user.userId, { invoiceId: id }),
    invoice.contactId ? getPerson(invoice.contactId, user.userId) : null,
    invoice.dealId ? getDeal(invoice.dealId, user.userId) : null,
    invoice.projectId ? getProject(invoice.projectId, user.userId) : null,
  ]);

  // Check for unbilled time entries if project-linked
  let unbilledCount = 0;
  if (invoice.projectId && invoice.status !== 'voided' && invoice.status !== 'paid') {
    const unbilled = await listTimeEntries(user.userId, {
      projectId: invoice.projectId,
      unbilled: true,
      isBillable: true,
      limit: 1,
    });
    unbilledCount = unbilled.length;
  }

  const isDraft = invoice.status === 'draft';
  const canSend = isDraft;
  const canVoid = ['sent', 'partial', 'overdue'].includes(invoice.status);
  const outstanding = invoice.totalCents - invoice.paidCents;

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Invoices
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-semibold text-white truncate">{invoice.title}</h1>
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
              statusColors[invoice.status] ?? statusColors.draft
            }`}
          >
            {invoice.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {invoice.projectId && (
            <Link
              href={`/dashboard/os/business/coach?project_id=${invoice.projectId}&mode=pricing_advisor`}
              className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Coach
            </Link>
          )}
          {canSend && (
            <form action={sendInvoiceAction.bind(null, invoice.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:bg-[#252836] text-[#94a3b8] hover:text-white text-sm font-medium px-4 py-2 transition"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
          )}
          {canVoid && (
            <form action={voidInvoiceAction.bind(null, invoice.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-red-900/50 bg-[#1a1d27] hover:bg-red-900/20 text-red-400 text-sm font-medium px-4 py-2 transition"
              >
                <Ban className="w-4 h-4" />
                Void
              </button>
            </form>
          )}
          <Link
            href={`/api/tiresias/agentic-os/business/invoices/${invoice.id}/export.pdf`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:bg-[#252836] text-[#94a3b8] hover:text-white text-sm font-medium px-4 py-2 transition"
          >
            Export PDF
          </Link>
        </div>
      </div>

      {/* Meta Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <p className="text-xs text-[#64748b] mb-1">Invoice Number</p>
          <p className="text-sm text-white font-mono">{invoice.invoiceNumber}</p>
        </div>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <p className="text-xs text-[#64748b] mb-1">Dates</p>
          <p className="text-xs text-[#94a3b8]">Date: {invoice.invoiceDate}</p>
          <p className="text-xs text-[#94a3b8]">Due: {invoice.dueOn}</p>
        </div>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <p className="text-xs text-[#64748b] mb-1">Terms</p>
          <p className="text-sm text-white">{invoice.terms || 'None'}</p>
        </div>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <p className="text-xs text-[#64748b] mb-1">Totals</p>
          <p className="text-sm text-white font-bold">{fmtCents(invoice.totalCents)}</p>
          <p className="text-xs text-[#94a3b8]">
            {fmtCents(invoice.paidCents)} paid
            {outstanding > 0 && ` / ${fmtCents(outstanding)} due`}
          </p>
        </div>
      </div>

      {/* Linked entities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <p className="text-xs text-[#64748b] mb-1">Contact</p>
          {contact ? (
            <Link href={`/dashboard/os/business/people/${contact.id}`} className="text-sm text-teal-300 hover:underline">
              {contact.firstName} {contact.lastName}
            </Link>
          ) : (
            <p className="text-sm text-[#94a3b8]">None</p>
          )}
        </div>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <p className="text-xs text-[#64748b] mb-1">Deal</p>
          {deal ? (
            <Link href={`/dashboard/os/business/deals/${deal.id}`} className="text-sm text-teal-300 hover:underline">
              {deal.title}
            </Link>
          ) : (
            <p className="text-sm text-[#94a3b8]">None</p>
          )}
        </div>
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <p className="text-xs text-[#64748b] mb-1">Project</p>
          {project ? (
            <Link href={`/dashboard/os/business/projects/${project.id}`} className="text-sm text-teal-300 hover:underline">
              {project.title}
            </Link>
          ) : (
            <p className="text-sm text-[#94a3b8]">None</p>
          )}
        </div>
      </div>

      {/* Description */}
      {invoice.descriptionMd && (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 mb-6">
          <p className="text-xs text-[#64748b] mb-2">Description</p>
          <div className="text-sm text-[#94a3b8] whitespace-pre-wrap leading-relaxed">
            {invoice.descriptionMd}
          </div>
        </div>
      )}

      {/* Bill unbilled time CTA */}
      {unbilledCount > 0 && isDraft && (
        <div className="rounded-xl border border-amber-800 bg-amber-900/10 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-sm text-white font-medium">Unbilled time available</p>
                <p className="text-xs text-[#94a3b8]">
                  This project has unbilled time entries. Roll them into line items.
                </p>
              </div>
            </div>
            <form action={billTimeEntriesAction.bind(null, invoice.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-4 py-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Bill time
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">
            Line Items ({lineItems.length})
          </h2>
        </div>

        {isDraft && (
          <div className="mb-4">
            <LineItemForm parentType="invoice" parentId={id} />
          </div>
        )}

        {lineItems.length > 0 ? (
          <div className="space-y-2">
            {lineItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-4 py-3 flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{item.description}</p>
                  <p className="text-[10px] text-[#64748b]">
                    {item.quantity} x {item.unitLabel || 'unit'} @ {fmtCents(item.unitPriceCents)}
                    {item.taxRateBp > 0 && ` (${(item.taxRateBp / 100).toFixed(1)}% tax)`}
                  </p>
                  {item.timeEntryIds && item.timeEntryIds.length > 0 && (
                    <p className="text-[10px] text-teal-600 mt-0.5">
                      {item.timeEntryIds.length} time entr{item.timeEntryIds.length === 1 ? 'y' : 'ies'}
                    </p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-mono text-white">
                    {fmtCents(item.lineTotalCents)}
                  </p>
                  {item.lineTaxCents > 0 && (
                    <p className="text-[10px] text-[#94a3b8]">
                      +{fmtCents(item.lineTaxCents)} tax
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#94a3b8] text-center py-4">No line items yet.</p>
        )}
      </div>

      {/* Payments */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">
            Payments ({payments.length})
          </h2>
        </div>

        {isDraft && (
          <div className="mb-4">
            <PaymentForm invoiceId={id} />
          </div>
        )}

        {payments.length > 0 ? (
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-4 py-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {paymentMethodLabels[p.method] ?? p.method}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-[#64748b]">{p.receivedOn}</p>
                    {p.reference && (
                      <p className="text-[10px] text-[#64748b]">{p.reference}</p>
                    )}
                    {p.notes && (
                      <p className="text-[10px] text-[#64748b] truncate max-w-[200px]">
                        {p.notes}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm font-mono font-bold text-teal-300">
                  {fmtCents(p.amountCents)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#94a3b8] text-center py-4">No payments recorded.</p>
        )}
      </div>

      {/* Outstanding footer */}
      {outstanding > 0 && invoice.totalCents > 0 && (
        <div className="rounded-xl border border-amber-800/50 bg-[#1a1d27] p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">Outstanding Balance</p>
            <p className="text-xs text-[#94a3b8]">
              {fmtCents(invoice.totalCents)} total - {fmtCents(invoice.paidCents)} paid
            </p>
          </div>
          <p className="text-xl font-bold text-amber-400">{fmtCents(outstanding)}</p>
        </div>
      )}
    </div>
  );
}
