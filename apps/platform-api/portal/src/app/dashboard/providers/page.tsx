"use client";

import { useWidgetData } from "@/lib/useWidgetData";

/** LLM provider health dashboard -- latency and status for upstream providers. Uses live API via useWidgetData. */

interface ProviderHealth {
  name: string;
  status: "UP" | "DOWN" | "DEGRADED";
  consecutive_errors: number;
  p50_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  error_rate?: number;
  cost_per_1k?: number;
}
interface HealthData { providers: ProviderHealth[]; }

interface LatencyProvider { name: string; p50: number; p95: number; p99: number; }
interface LatencyData { providers: LatencyProvider[]; }

interface ErrorProvider { name: string; error_rate: number; total_requests?: number; status_codes: { code: number; count: number }[]; }
interface ErrorsData { providers: ErrorProvider[]; }

export default function ProvidersPage() {
  const { data: health, loading: healthLoading } = useWidgetData<HealthData>({ endpoint: "/api/dash/v1/providers/health" });
  const { data: latency, loading: latencyLoading } = useWidgetData<LatencyData>({ endpoint: "/api/dash/v1/latency" });
  const { data: errors, loading: errorsLoading } = useWidgetData<ErrorsData>({ endpoint: "/api/dash/v1/errors" });

  const statusStyles: Record<string, string> = {
    UP: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    DEGRADED: "bg-warning/15 text-warning border border-warning/20",
    DOWN: "bg-of-error/15 text-of-error border border-of-error/20",
  };

  // Merge health + latency + errors into enriched provider cards
  const latencyProviders = latency?.providers ?? [];
  const maxLatency = latencyProviders.reduce((mx, p) => Math.max(mx, p.p99), 1);

  const latencyMap = Object.fromEntries(latencyProviders.map(p => [p.name, p]));
  const errorMap = Object.fromEntries((errors?.providers ?? []).map(p => [p.name, p]));

  const enrichedProviders = (health?.providers ?? []).map(p => ({
    ...p,
    p50: latencyMap[p.name]?.p50,
    p95: latencyMap[p.name]?.p95,
    p99: latencyMap[p.name]?.p99,
    error_rate: errorMap[p.name]?.error_rate,
    total_requests: errorMap[p.name]?.total_requests,
  }));

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Provider health cards (PROV-01) */}
      <section>
        <h2 className="text-sm font-bold text-of-on-surface-variant uppercase tracking-wider mb-3">Provider Health</h2>
        {healthLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 rounded-xl bg-of-surface-container animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {enrichedProviders.map(p => {
              const isHealthy = p.status === "UP" && (p.error_rate ?? 0) <= 0.01;
              const borderColor = isHealthy
                ? "border-emerald-500/20"
                : p.status === "DEGRADED"
                ? "border-warning/20"
                : p.status === "DOWN"
                ? "border-of-error/20"
                : "border-of-outline-variant/5";
              return (
                <div key={p.name} className={`bg-of-surface-container rounded-xl p-5 border ${borderColor}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-of-on-surface">{p.name}</p>
                      {p.total_requests !== undefined && (
                        <p className="text-[10px] text-of-on-surface-variant mt-0.5">{p.total_requests.toLocaleString()} requests</p>
                      )}
                      {p.consecutive_errors > 0 && (
                        <p className="text-[10px] text-of-error mt-0.5">{p.consecutive_errors} consecutive errors</p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusStyles[p.status] ?? statusStyles.DOWN}`}>
                      {p.status}
                    </span>
                  </div>
                  {isHealthy && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/15">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">Healthy</span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {p.p50 !== undefined && (
                      <div className="flex justify-between text-xs">
                        <span className="text-of-on-surface-variant">p50</span>
                        <span className={`tabular-nums font-bold ${p.p50 < 2000 ? "text-emerald-400" : p.p50 < 4000 ? "text-warning" : "text-of-error"}`}>{Math.round(p.p50)}ms</span>
                      </div>
                    )}
                    {p.p95 !== undefined && (
                      <div className="flex justify-between text-xs">
                        <span className="text-of-on-surface-variant">p95</span>
                        <span className={`tabular-nums font-bold ${p.p95 < 3000 ? "text-emerald-400" : p.p95 < 5000 ? "text-warning" : "text-of-error"}`}>{Math.round(p.p95)}ms</span>
                      </div>
                    )}
                    {p.error_rate !== undefined && (
                      <div className="flex justify-between text-xs">
                        <span className="text-of-on-surface-variant">Error Rate</span>
                        <span className={`tabular-nums font-bold ${p.error_rate > 0.05 ? "text-of-error" : p.error_rate > 0.01 ? "text-warning" : "text-emerald-400"}`}>
                          {(p.error_rate * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {enrichedProviders.length === 0 && (
              <div className="col-span-4 text-center py-8 text-sm text-of-on-surface-variant">No provider data available</div>
            )}
          </div>
        )}
      </section>

      {/* Latency comparison chart (PROV-02) */}
      <section>
        <h2 className="text-sm font-bold text-of-on-surface-variant uppercase tracking-wider mb-3">Latency Comparison</h2>
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          {latencyLoading ? (
            <div className="h-48 animate-pulse bg-of-surface-container-high rounded" />
          ) : latencyProviders.length === 0 ? (
            <p className="text-sm text-of-on-surface-variant text-center py-8">No latency data available</p>
          ) : (
            <>
              {/* Legend */}
              <div className="flex gap-4 mb-4">
                {[
                  { label: "p50", color: "var(--of-primary)" },
                  { label: "p95", color: "var(--of-secondary)" },
                  { label: "p99", color: "var(--of-error)" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded-sm" style={{ background: l.color }} />
                    <span className="text-[10px] text-of-on-surface-variant font-bold uppercase">{l.label}</span>
                  </div>
                ))}
              </div>
              {/* Grouped bar chart */}
              <div className="flex items-end gap-6 h-40">
                {latencyProviders.map(p => (
                  <div key={p.name} className="flex flex-col items-center gap-2 flex-1">
                    <div className="flex items-end gap-0.5 h-32">
                      {[
                        { val: p.p50, color: "var(--of-primary)" },
                        { val: p.p95, color: "var(--of-secondary)" },
                        { val: p.p99, color: "var(--of-error)" },
                      ].map((bar, i) => (
                        <div key={i} className="w-4 rounded-t-sm relative group transition-opacity hover:opacity-80"
                          style={{ height: `${Math.max((bar.val / maxLatency) * 100, 4)}%`, background: bar.color }}>
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-of-on-surface-variant opacity-0 group-hover:opacity-100 whitespace-nowrap">{bar.val}ms</span>
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] text-of-on-surface-variant font-bold truncate max-w-full">{p.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Error breakdown table (PROV-03) */}
      <section>
        <h2 className="text-sm font-bold text-of-on-surface-variant uppercase tracking-wider mb-3">Error Breakdown</h2>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {errorsLoading ? (
            <div className="h-32 animate-pulse bg-of-surface-container-high m-4 rounded" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-of-outline-variant/10">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Provider</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Error Rate</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Status Codes</th>
                </tr>
              </thead>
              <tbody>
                {(errors?.providers ?? []).map(p => (
                  <tr key={p.name} className="border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors">
                    <td className="px-4 py-3 text-of-on-surface font-bold">{p.name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-bold tabular-nums ${p.error_rate > 0.05 ? "text-of-error" : p.error_rate > 0.01 ? "text-warning" : "text-emerald-400"}`}>
                        {(p.error_rate * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(p.status_codes ?? []).map(sc => (
                          <span key={sc.code}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                              sc.code >= 500 ? "bg-of-error/15 text-of-error border border-of-error/20" :
                              sc.code >= 400 ? "bg-warning/15 text-warning border border-warning/20" :
                              "bg-of-primary/10 text-of-primary border border-of-primary/20"
                            }`}>
                            {sc.code} ({sc.count})
                          </span>
                        ))}
                        {(!p.status_codes || p.status_codes.length === 0) && (
                          <span className="text-xs text-of-on-surface-variant">No errors</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!errors?.providers || errors.providers.length === 0) && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-of-on-surface-variant">No error data available</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

    </div>
  );
}
