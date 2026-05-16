/**
 * Business OS Phase 5 — live P&L summary panel.
 *
 * Wave D (UI Depth Wave) specialization: the ad-hoc `rounded-xl border` stat
 * cards are replaced with the shared `DashboardWidget` grid (revenue / expense
 * / margin per currency, status-tinted by margin sign), and a `ChartCard` bar
 * chart visualizes the revenue-vs-expense-vs-margin breakdown. Same summary
 * API, same date-range controls, same PDF export — presentation only.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import { useId, useState, useCallback, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Download, BarChart3 } from 'lucide-react';
import type { PnlSummaryCurrency } from '@/lib/agentic-os/business/pnl-snapshots';
import {
  ChartCard,
  DashboardWidget,
  EmptyState,
  Spinner,
  type ChartSeries,
} from '@/components/agentic-os/_shared/views';

function fmtCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Props {
  userId: string;
}

export default function PnlSummaryPanel({ userId: _userId }: Props) {
  const today = new Date();
  const defaultStart = `${today.getFullYear()}-01-01`;
  const defaultEnd = today.toISOString().slice(0, 10);

  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [summary, setSummary] = useState<PnlSummaryCurrency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fromId = useId();
  const toId = useId();

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/business/pnl/summary?period_start=${periodStart}&period_end=${periodEnd}&group_by=category`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to load summary');
        return;
      }
      const data = await res.json();
      setSummary(data.summary ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleExportPdf = () => {
    window.open(
      `/api/tiresias/agentic-os/business/pnl/export.pdf?period_start=${periodStart}&period_end=${periodEnd}`,
      '_blank',
    );
  };

  // One bar series per currency: revenue / expense / margin grouped per axis.
  const chartSeries: ChartSeries[] = summary.map((s) => ({
    key: s.currency,
    label: s.currency,
    data: [
      { x: 'Revenue', y: s.revenueCents / 100 },
      { x: 'Expenses', y: s.expenseCents / 100 },
      { x: 'Margin', y: s.marginCents / 100 },
    ],
  }));

  return (
    <div className="space-y-4" data-testid="pnl-summary-panel">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-medium text-text-primary">P&L Summary</h2>
        <button
          onClick={handleExportPdf}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-0 hover:bg-surface-3 text-text-secondary hover:text-text-primary text-xs font-medium px-3 py-1.5 transition"
        >
          <Download className="w-3.5 h-3.5" />
          Export PDF
        </button>
      </div>

      {/* Date range inputs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label htmlFor={fromId} className="block text-2xs text-text-tertiary mb-1">From</label>
          <input
            id={fromId}
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none transition"
          />
        </div>
        <div>
          <label htmlFor={toId} className="block text-2xs text-text-tertiary mb-1">To</label>
          <input
            id={toId}
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none transition"
          />
        </div>
        <div className="pt-5">
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition"
          >
            {loading && <Spinner size="xs" />}
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Widget grid — one revenue / expense / margin trio per currency */}
      {summary.length > 0 ? (
        <div className="space-y-4">
          {summary.map((s) => (
            <div
              key={s.currency}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
              data-testid={`pnl-summary-currency-${s.currency}`}
            >
              <DashboardWidget
                title={`Revenue (${s.currency})`}
                icon={<DollarSign className="h-4 w-4" />}
                variant="positive"
                data-testid={`pnl-widget-revenue-${s.currency}`}
              >
                <p className="text-2xl font-semibold text-text-primary tabular-nums">
                  {fmtCents(s.revenueCents)}
                </p>
              </DashboardWidget>
              <DashboardWidget
                title={`Expenses (${s.currency})`}
                icon={<TrendingDown className="h-4 w-4" />}
                variant="danger"
                data-testid={`pnl-widget-expenses-${s.currency}`}
              >
                <p className="text-2xl font-semibold text-text-primary tabular-nums">
                  {fmtCents(s.expenseCents)}
                </p>
              </DashboardWidget>
              <DashboardWidget
                title={`Margin (${s.currency})`}
                icon={<TrendingUp className="h-4 w-4" />}
                variant={s.marginCents >= 0 ? 'positive' : 'danger'}
                data-testid={`pnl-widget-margin-${s.currency}`}
              >
                <p
                  className={`text-2xl font-semibold tabular-nums ${
                    s.marginCents >= 0 ? 'text-positive' : 'text-danger'
                  }`}
                >
                  {s.marginCents < 0 ? '-' : ''}
                  {fmtCents(s.marginCents)}
                </p>
              </DashboardWidget>
            </div>
          ))}

          {/* Breakdown chart — revenue vs expenses vs margin per currency */}
          <ChartCard
            title="P&L breakdown"
            icon={<BarChart3 className="h-4 w-4" />}
            kind="bar"
            series={chartSeries}
            height={220}
            osSlug="business"
            loading={loading}
          />
        </div>
      ) : (
        !loading && (
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="No P&L data for this range"
            description="Pick a date range and refresh to compute revenue, expenses, and margin."
            primaryCta={{ label: 'Refresh', onClick: fetchSummary }}
            variant="bare"
          />
        )
      )}
    </div>
  );
}
