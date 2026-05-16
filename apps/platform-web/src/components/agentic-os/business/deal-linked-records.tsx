/**
 * Business OS — deal-detail linked quote / invoice record lists.
 *
 * Wave D (UI Depth Wave) specialization: the deal-detail page's quotes and
 * invoices tabs used to be inline JSX with hand-spelled status-color maps and
 * raw tertiary-text literals. This extracts that into a small presentational
 * component aligned to the visual-language tokens, shared by both tabs and the
 * `CrossEntityTabs`-driven deal-detail page. Empty state uses the shared
 * `EmptyState` primitive ("doors, not apologies").
 *
 * Server-rendered, no client hooks — the data still comes from the page's
 * existing `listQuotes` / `listInvoices` queries.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import Link from 'next/link';
import { FileText, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/agentic-os/_shared/views';

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Status → token-mapped pill classes. Maps the legacy per-status hex palette
 * onto the four semantic status tokens + neutral surface tokens.
 */
const STATUS_PILL: Record<string, string> = {
  draft: 'bg-surface-3 text-text-tertiary border-border-subtle',
  sent: 'bg-accent/10 text-accent border-accent/30',
  accepted: 'bg-positive/15 text-positive border-positive/30',
  paid: 'bg-positive/15 text-positive border-positive/30',
  partial: 'bg-warning/15 text-warning border-warning/30',
  expired: 'bg-warning/15 text-warning border-warning/30',
  rejected: 'bg-danger/15 text-danger border-danger/30',
  overdue: 'bg-danger/15 text-danger border-danger/30',
  converted: 'bg-accent/15 text-accent border-accent/30',
  voided: 'bg-surface-3 text-text-tertiary border-border-subtle',
};

interface LinkedRecord {
  id: string;
  title: string;
  /** Quote number or invoice number. */
  ref: string;
  status: string;
  totalCents: number;
}

interface Props {
  kind: 'quote' | 'invoice';
  records: LinkedRecord[];
}

/**
 * Renders a deal's linked quotes or invoices as a token-styled record list.
 * Used by the deal-detail `CrossEntityTabs` panels.
 */
export default function DealLinkedRecords({ kind, records }: Props) {
  const noun = kind === 'quote' ? 'quote' : 'invoice';
  const hrefBase = kind === 'quote' ? 'quotes' : 'invoices';
  const Icon = kind === 'quote' ? FileText : Receipt;

  if (records.length === 0) {
    return (
      <EmptyState
        icon={<Icon className="h-6 w-6" />}
        title={`No ${noun}s linked to this deal yet`}
        description={`${kind === 'quote' ? 'Quotes' : 'Invoices'} created against this deal will show up here.`}
        primaryCta={{
          label: `New ${noun}`,
          href: `/dashboard/os/business/${hrefBase}/new`,
        }}
        variant="bare"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid={`deal-linked-${noun}s`}>
      <p className="text-sm text-text-secondary">
        {records.length} {noun}
        {records.length !== 1 ? 's' : ''} linked to this deal
      </p>
      {records.map((r) => (
        <Link
          key={r.id}
          href={`/dashboard/os/business/${hrefBase}/${r.id}`}
          className="block rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 transition hover:border-os-business/60 hover:bg-surface-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-text-primary">{r.title}</p>
              <p className="font-mono text-2xs text-text-tertiary">{r.ref}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-2xs font-medium ${
                  STATUS_PILL[r.status] ?? STATUS_PILL.draft
                }`}
              >
                {r.status}
              </span>
              <span className="font-mono text-sm tabular-nums text-text-primary">
                {fmtCents(r.totalCents)}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
