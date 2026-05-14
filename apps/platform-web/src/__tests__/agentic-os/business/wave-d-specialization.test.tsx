/**
 * Business OS — Wave D (UI Depth Wave) specialization render tests.
 *
 * Wave D converts the deal-detail tab strip to the shared `CrossEntityTabs`
 * primitive (deep-linking preserved via `?tab=` sync), reframes the P&L
 * summary as a `DashboardWidget` + `ChartCard` grid, and polishes the
 * quote/invoice builders + signature panel onto the visual-language tokens.
 *
 * These tests lock:
 *  - DealLinkedTabs    → CrossEntityTabs renders all four deal tabs + counts,
 *                        seeds the active tab from the `?tab=` param, and
 *                        mirrors a tab change back into the URL.
 *  - DealLinkedRecords → token-styled linked quote/invoice list + EmptyState.
 *  - PnlSummaryPanel   → DashboardWidget trio per currency (after the summary
 *                        API resolves) instead of the ad-hoc stat cards.
 *  - SignaturePanel    → EmptyState gate for non-`sent` documents; the draw
 *                        form for `sent` documents.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DealLinkedTabs from '@/components/agentic-os/business/deal-linked-tabs';
import DealLinkedRecords from '@/components/agentic-os/business/deal-linked-records';
import PnlSummaryPanel from '@/components/agentic-os/business/pnl-summary-panel';
import SignaturePanel from '@/components/agentic-os/business/signature-panel';
import type { CrossEntityTab } from '@/components/agentic-os/_shared/views';
import type { BusinessDocument, DocumentStatus } from '@/lib/agentic-os/business/documents';

// ─── next/navigation mock ───────────────────────────────────────────────────
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/dashboard/os/business/deals/deal-1',
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mkTabs(): CrossEntityTab[] {
  return [
    { key: 'overview', label: 'Overview', content: () => <div>overview body</div> },
    { key: 'quotes', label: 'Quotes', count: 2, content: () => <div>quotes body</div> },
    { key: 'invoices', label: 'Invoices', count: 0, content: () => <div>invoices body</div> },
    { key: 'documents', label: 'Documents', count: 1, content: () => <div>documents body</div> },
  ];
}

describe('DealLinkedTabs — CrossEntityTabs adoption', () => {
  it('renders all four deal tabs with their count badges', () => {
    render(<DealLinkedTabs tabs={mkTabs()} activeTab="overview" />);
    expect(screen.getByTestId('deal-linked-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-quotes')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-invoices')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-documents')).toBeInTheDocument();
    expect(screen.getByTestId('cross-entity-tab-count-quotes')).toHaveTextContent('2');
    expect(screen.getByTestId('cross-entity-tab-count-documents')).toHaveTextContent('1');
  });

  it('seeds the active tab from the server-validated tab prop (deep-link)', () => {
    render(<DealLinkedTabs tabs={mkTabs()} activeTab="quotes" />);
    // The quotes panel is the one shown; overview panel is mounted but hidden.
    expect(screen.getByTestId('cross-entity-tab-quotes')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('quotes body')).toBeInTheDocument();
  });

  it('mirrors a tab change back into the ?tab= URL param', () => {
    render(<DealLinkedTabs tabs={mkTabs()} activeTab="overview" />);
    fireEvent.click(screen.getByTestId('cross-entity-tab-invoices'));
    expect(mockReplace).toHaveBeenCalledWith(
      '/dashboard/os/business/deals/deal-1?tab=invoices',
      { scroll: false },
    );
  });

  it('preserves other existing search params when switching tabs', () => {
    mockSearchParams = new URLSearchParams('ref=email&tab=overview');
    render(<DealLinkedTabs tabs={mkTabs()} activeTab="overview" />);
    fireEvent.click(screen.getByTestId('cross-entity-tab-quotes'));
    const url = mockReplace.mock.calls[0][0] as string;
    expect(url).toContain('ref=email');
    expect(url).toContain('tab=quotes');
  });
});

describe('DealLinkedRecords — token-styled linked record list', () => {
  it('renders a row per linked quote with status + total', () => {
    render(
      <DealLinkedRecords
        kind="quote"
        records={[
          { id: 'q-1', title: 'Website redesign', ref: 'Q-001', status: 'sent', totalCents: 250000 },
          { id: 'q-2', title: 'SEO retainer', ref: 'Q-002', status: 'accepted', totalCents: 90000 },
        ]}
      />,
    );
    expect(screen.getByTestId('deal-linked-quotes')).toBeInTheDocument();
    expect(screen.getByText('Website redesign')).toBeInTheDocument();
    expect(screen.getByText('Q-001')).toBeInTheDocument();
    expect(screen.getByText('$2,500.00')).toBeInTheDocument();
    expect(screen.getByText('2 quotes linked to this deal')).toBeInTheDocument();
  });

  it('renders the EmptyState door when no invoices are linked', () => {
    render(<DealLinkedRecords kind="invoice" records={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No invoices linked to this deal yet')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-cta-primary')).toHaveAttribute(
      'href',
      '/dashboard/os/business/invoices/new',
    );
  });

  it('links each record to its detail route', () => {
    render(
      <DealLinkedRecords
        kind="invoice"
        records={[
          { id: 'inv-9', title: 'March retainer', ref: 'INV-009', status: 'paid', totalCents: 120000 },
        ]}
      />,
    );
    expect(screen.getByText('March retainer').closest('a')).toHaveAttribute(
      'href',
      '/dashboard/os/business/invoices/inv-9',
    );
  });
});

describe('PnlSummaryPanel — DashboardWidget + ChartCard grid', () => {
  it('renders a revenue / expense / margin DashboardWidget trio per currency', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: [
          { currency: 'USD', revenueCents: 1000000, expenseCents: 400000, marginCents: 600000 },
        ],
      }),
    } as Response);

    render(<PnlSummaryPanel userId="u-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('pnl-widget-revenue-USD')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pnl-widget-expenses-USD')).toBeInTheDocument();
    expect(screen.getByTestId('pnl-widget-margin-USD')).toBeInTheDocument();
    expect(screen.getByText('$10,000.00')).toBeInTheDocument();
    expect(screen.getByText('$4,000.00')).toBeInTheDocument();
    expect(screen.getByText('$6,000.00')).toBeInTheDocument();
  });

  it('shows the EmptyState when the summary API returns nothing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ summary: [] }),
    } as Response);

    render(<PnlSummaryPanel userId="u-1" />);

    await waitFor(() => {
      expect(screen.getByText('No P&L data for this range')).toBeInTheDocument();
    });
  });
});

describe('SignaturePanel — EmptyState gate + draw form', () => {
  function mkDoc(status: DocumentStatus): BusinessDocument {
    return {
      id: 'doc-1',
      userId: 'u-1',
      templateId: null,
      projectId: null,
      dealId: null,
      contactId: null,
      title: 'Service agreement',
      bodyMd: '',
      status,
      sentAt: null,
      signedAt: null,
      pdfUrl: null,
      metadata: {},
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
  }

  it('renders the EmptyState gate for a draft document', () => {
    render(<SignaturePanel document={mkDoc('draft')} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Signature capture is locked')).toBeInTheDocument();
  });

  it('renders the EmptyState gate for an already-signed document', () => {
    render(<SignaturePanel document={mkDoc('signed')} />);
    expect(screen.getByText('This document has been signed')).toBeInTheDocument();
  });

  it('renders the draw form for a sent document', () => {
    render(<SignaturePanel document={mkDoc('sent')} />);
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getByLabelText('Signature drawing area')).toBeInTheDocument();
    expect(screen.getByText('Capture Signature')).toBeInTheDocument();
  });
});
