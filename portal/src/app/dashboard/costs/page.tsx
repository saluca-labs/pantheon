"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";

/** Cost analytics -- spend breakdown by model/provider with projections. Uses live API via useWidgetData. */

interface SpendData {
  total_cost: number;
  request_count: number;
  total_tokens: number;
  projected_monthly?: number;
  budget?: number;
  budget_remaining?: number;
  by_model?: { model: string; cost: number }[];
  by_provider?: { provider: string; cost: number }[];
  daily_trend?: { date: string; cost: number }[];
}

interface Session {
  id: string;
  cost: number;
  requests: number;
  tokens: number;
  last_active: string;
  model?: string;
  provider?: string;
}
interface SessionsData { sessions: Session[]; }

export default function CostsPage() {
  const [budgetAlertOpen, setBudgetAlertOpen] = useState(false);
  const { data: spend, loading: spendLoading } = useWidgetData<SpendData>({ endpoint: "/dash/v1/spend" });
  const { data: sessions, loading: sessionsLoading } = useWidgetData<SessionsData>({ endpoint: "/dash/v1/sessions/top" });

  // Derived values — graceful fallback when optional fields absent
  const totalCost = spend?.total_cost ?? 0;
  const projected = spend?.projected_monthly ?? (totalCost / new Date().getDate()) * 30;
  const budget = spend?.budget ?? projected * 1.2;
  const budgetRemaining = spend?.budget_remaining ?? Math.max(0, budget - totalCost);
  const budgetPct = Math.min(totalCost / Math.max(budget, 0.001), 1);

  // Donut chart — use by_model if present, else by_provider, else single segment
  const donutSegments: { label: string; cost: number }[] =
    spend?.by_model?.map(m => ({ label: m.model, cost: m.cost })) ??
    spend?.by_provider?.map(p => ({ label: p.provider, cost: p.cost })) ??
    (totalCost > 0 ? [{ label: "Total", cost: totalCost }] : []);
  const donutTotal = donutSegments.reduce((s, d) => s + d.cost, 0) || 1;

  const donutColors = [
    "var(--of-primary)",
    "var(--of-secondary)",
    "var(--of-tertiary)",
    "rgba(239,100,97,0.8)",
    "rgba(245,176,65,0.8)",
    "rgba(62,207,142,0.8)",
  ];

  // Build conic-gradient string
  const conicParts: string[] = [];
  let cumDeg = 0;
  donutSegments.forEach((seg, i) => {
    const deg = (seg.cost / donutTotal) * 360;
    conicParts.push(`${donutColors[i % donutColors.length]} ${cumDeg}deg ${cumDeg + deg}deg`);
    cumDeg += deg;
  });
  const conicGrad = conicParts.length > 0 ? `conic-gradient(${conicParts.join(", ")})` : "var(--of-surface-container-high)";

  // SVG gauge constants
  const r = 34;
  const circ = 2 * Math.PI * r;

  return (
    <div className="space-y-6 max-w-7xl">

      {/* KPI row (COST-01) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Monthly spend */}
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          <p className="text-[10px] uppercase tracking-wider text-of-on-surface-variant font-bold mb-2">Monthly Spend</p>
          {spendLoading ? (
            <div className="h-8 animate-pulse bg-of-surface-container-high rounded" />
          ) : (
            <h3 className="text-2xl font-black text-of-on-surface tracking-tight tabular-nums">${totalCost.toFixed(2)}</h3>
          )}
          <p className="text-xs text-of-on-surface-variant mt-1">30-day window</p>
        </div>

        {/* Projected end-of-month */}
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          <p className="text-[10px] uppercase tracking-wider text-of-on-surface-variant font-bold mb-2">Projected (EOM)</p>
          {spendLoading ? (
            <div className="h-8 animate-pulse bg-of-surface-container-high rounded" />
          ) : (
            <h3 className="text-2xl font-black text-of-on-surface tracking-tight tabular-nums">${projected.toFixed(2)}</h3>
          )}
          <p className="text-xs text-of-on-surface-variant mt-1">Based on current burn rate</p>
        </div>

        {/* Budget remaining with SVG gauge */}
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-of-on-surface-variant font-bold mb-2">Budget Remaining</p>
              {spendLoading ? (
                <div className="h-8 w-24 animate-pulse bg-of-surface-container-high rounded" />
              ) : (
                <h3 className="text-2xl font-black text-of-on-surface tracking-tight tabular-nums">${budgetRemaining.toFixed(2)}</h3>
              )}
              <p className="text-xs text-of-on-surface-variant mt-1">{(budgetPct * 100).toFixed(0)}% of budget used</p>
            </div>
            <svg viewBox="0 0 80 80" className="w-16 h-16 -rotate-90 shrink-0">
              <circle cx="40" cy="40" r={r} fill="transparent"
                stroke="var(--of-surface-container-highest)" strokeWidth="6" />
              <circle cx="40" cy="40" r={r} fill="transparent"
                stroke={budgetPct > 0.9 ? "var(--of-error)" : budgetPct > 0.7 ? "var(--warning, #f5b041)" : "var(--of-primary)"}
                strokeWidth="6"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - budgetPct)}
                strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Charts row: stacked area + donut (COST-02, COST-03) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Cost over time stacked area (COST-02) */}
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          <h3 className="text-sm font-bold text-of-on-surface mb-4">Cost by Provider — 30 Days</h3>
          {spendLoading ? (
            <div className="h-40 animate-pulse bg-of-surface-container-high rounded" />
          ) : (
            (() => {
              const trend = spend?.daily_trend ?? spend?.by_provider?.map((p, i) => ({
                date: `Day ${i + 1}`,
                cost: p.cost / 30
              })) ?? [];
              if (trend.length === 0) {
                return <p className="text-sm text-of-on-surface-variant text-center py-10">No trend data available</p>;
              }
              const maxCost = Math.max(...trend.map(d => d.cost), 0.001);
              return (
                <div className="flex items-end gap-1 h-40">
                  {trend.slice(-30).map((d, i) => (
                    <div key={i} className="flex-1 relative group"
                      style={{ height: `${Math.max((d.cost / maxCost) * 100, 4)}%` }}>
                      <div className="absolute inset-0 rounded-t-sm" style={{
                        background: `rgba(90,218,206,${0.15 + (i / trend.length) * 0.4})`
                      }} />
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-of-on-surface-variant opacity-0 group-hover:opacity-100 whitespace-nowrap">${d.cost.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>

        {/* Cost by model donut (COST-03) */}
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          <h3 className="text-sm font-bold text-of-on-surface mb-4">Cost by Model</h3>
          {spendLoading ? (
            <div className="h-40 animate-pulse bg-of-surface-container-high rounded" />
          ) : (
            <div className="flex items-center gap-6">
              {/* Donut */}
              <div className="relative w-32 h-32 shrink-0">
                <div className="w-32 h-32 rounded-full" style={{ background: conicGrad }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-of-surface-container flex items-center justify-center">
                    <span className="text-xs font-black text-of-on-surface">${totalCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {/* Legend */}
              <div className="space-y-2 flex-1 min-w-0">
                {donutSegments.slice(0, 6).map((seg, i) => (
                  <div key={seg.label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: donutColors[i % donutColors.length] }} />
                      <span className="text-xs text-of-on-surface-variant truncate">{seg.label}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-bold text-of-on-surface tabular-nums">{((seg.cost / donutTotal) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {donutSegments.length === 0 && (
                  <p className="text-xs text-of-on-surface-variant">No model breakdown available</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top sessions table (COST-04) + Set Budget Alert (COST-05) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-of-on-surface-variant uppercase tracking-wider">Top Sessions by Cost</h2>
          {/* Set Budget Alert button (COST-05) */}
          <button onClick={() => setBudgetAlertOpen(true)}
            className="px-4 h-8 rounded-lg text-xs font-bold border border-of-primary/30 text-of-primary hover:bg-of-primary/10 transition-colors">
            Set Budget Alert
          </button>
        </div>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {sessionsLoading ? (
            <div className="h-48 animate-pulse bg-of-surface-container-high m-4 rounded" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-of-outline-variant/10">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Session</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Cost</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Requests</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Tokens</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Model</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Provider</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {(sessions?.sessions ?? []).map(s => (
                  <tr key={s.id} className="border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-of-on-surface truncate max-w-[160px]">{s.id}</td>
                    <td className="px-4 py-3 text-right text-of-on-surface tabular-nums text-xs font-bold">${s.cost.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-of-on-surface-variant tabular-nums text-xs">{s.requests}</td>
                    <td className="px-4 py-3 text-right text-of-on-surface-variant tabular-nums text-xs">{s.tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-of-on-surface-variant">{s.model ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-of-on-surface-variant">{s.provider ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-of-on-surface-variant">{s.last_active}</td>
                  </tr>
                ))}
                {(!sessions?.sessions || sessions.sessions.length === 0) && !sessionsLoading && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-of-on-surface-variant">No session data available</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Budget Alert modal (COST-05) */}
      {budgetAlertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBudgetAlertOpen(false)}>
          <div className="bg-of-surface-container rounded-2xl p-6 border border-of-outline-variant/10 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black text-of-on-surface mb-4">Set Budget Alert</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-of-on-surface-variant uppercase tracking-wider block mb-1.5">Monthly Budget ($)</label>
                <input type="number" placeholder="e.g. 500" defaultValue={budget.toFixed(2)}
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40" />
              </div>
              <div>
                <label className="text-xs font-bold text-of-on-surface-variant uppercase tracking-wider block mb-1.5">Alert at (%)</label>
                <input type="number" placeholder="80" min="1" max="100" defaultValue="80"
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40" />
              </div>
              <p className="text-xs text-of-on-surface-variant">Alert configuration is UI-only in this version. Backend alert endpoints coming soon.</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setBudgetAlertOpen(false)}
                className="flex-1 h-9 rounded-lg text-sm font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:border-of-outline-variant/40 transition-colors">
                Cancel
              </button>
              <button onClick={() => setBudgetAlertOpen(false)}
                className="flex-1 h-9 rounded-lg text-sm font-bold bg-of-primary text-of-on-primary hover:bg-of-primary-fixed transition-colors">
                Save Alert
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
