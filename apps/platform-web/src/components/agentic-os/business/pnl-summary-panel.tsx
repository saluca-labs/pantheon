/**
 * Business OS Phase 5 — live P&L summary panel.
 *
 * Displays a date range input with computed revenue, expense, and margin
 * totals from the summary API.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import type { PnlSummaryCurrency } from '@/lib/agentic-os/business/pnl-snapshots';

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

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-white">P&L Summary</h2>
        <button
          onClick={handleExportPdf}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-0 hover:bg-border-subtle text-text-secondary hover:text-white text-xs font-medium px-3 py-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export PDF
        </button>
      </div>

      {/* Date range inputs */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <label className="block text-[10px] text-[#64748b] mb-1">From</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#64748b] mb-1">To</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none"
          />
        </div>
        <div className="pt-5">
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      {summary.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summary.map((s) => (
            <React.Fragment key={s.currency}>
              <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] text-[#64748b] uppercase tracking-wider">
                    Revenue ({s.currency})
                  </span>
                </div>
                <p className="text-xl font-bold text-white">{fmtCents(s.revenueCents)}</p>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-[10px] text-[#64748b] uppercase tracking-wider">
                    Expenses ({s.currency})
                  </span>
                </div>
                <p className="text-xl font-bold text-white">{fmtCents(s.expenseCents)}</p>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className={`w-4 h-4 ${s.marginCents >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                  <span className="text-[10px] text-[#64748b] uppercase tracking-wider">
                    Margin ({s.currency})
                  </span>
                </div>
                <p className={`text-xl font-bold ${s.marginCents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtCents(s.marginCents)}
                </p>
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="text-center py-8">
            <p className="text-sm text-[#64748b]">
              Select a date range and click Refresh to compute P&L.
            </p>
          </div>
        )
      )}
    </div>
  );
}

