"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { UsageWidget } from "@/components/dashboard/widgets/UsageWidget";

interface SpendData {
  total_cost: number;
  request_count: number;
  total_tokens: number;
}

interface RequestsData {
  counts: { date: string; count: number }[];
}

interface HealthData {
  providers: {
    name: string;
    status: "UP" | "DOWN" | "DEGRADED";
    consecutive_errors: number;
    p50_ms?: number;
    error_rate?: number;
  }[];
}

function KpiCard({
  label,
  value,
  delta,
  deltaUp,
  sparkline,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  sparkline?: number[];
}) {
  const max = sparkline ? Math.max(...sparkline, 1) : 1;
  return (
    <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] uppercase tracking-wider text-of-on-surface-variant font-bold">
          {label}
        </p>
        {delta && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              deltaUp
                ? "text-emerald-400 bg-emerald-400/10"
                : "text-of-error bg-of-error/10"
            }`}
          >
            {delta}
          </span>
        )}
      </div>
      <h3 className="text-2xl font-black text-of-on-surface tracking-tight tabular-nums">
        {value}
      </h3>
      {sparkline && sparkline.length > 0 && (
        <div className="mt-4 h-8 flex items-end gap-0.5">
          {sparkline.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max((v / max) * 100, 10)}%`,
                background:
                  i === sparkline.length - 1
                    ? "var(--of-primary)"
                    : "rgba(90,218,206,0.25)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OverviewPage() {
  const [timePeriod, setTimePeriod] = useState<"7d" | "30d">("7d");

  const { data: spend, loading: spendLoading } = useWidgetData<SpendData>({
    endpoint: "/dash/v1/spend",
  });

  const { data: requests, loading: reqLoading } = useWidgetData<RequestsData>({
    endpoint: "/dash/v1/requests",
  });

  const { data: health, loading: healthLoading } = useWidgetData<HealthData>({
    endpoint: "/dash/v1/providers/health",
  });

  const { data: usageAlerts } = useWidgetData<{
    alert_level: string;
    max_pct_used: number;
  }>({
    endpoint: "/v1/usage/alerts",
    refreshInterval: 60_000,
  });

  const sparklineCounts = (requests?.counts ?? [])
    .slice(-14)
    .map((d) => d.count);

  const barData = (requests?.counts ?? []).slice(timePeriod === "7d" ? -7 : -30);
  const barMax = Math.max(...barData.map((d) => d.count), 1);

  const avgCostPerReq = spend
    ? spend.total_cost / Math.max(spend.request_count, 1)
    : 0;
  const areaData = (
    requests?.counts ??
    Array.from({ length: 14 }, () => ({ date: "", count: 0 }))
  ).slice(-14);
  const areaMax = areaData.reduce(
    (mx, c) => Math.max(mx, c.count * avgCostPerReq),
    0.001
  );

  return (
    <div className="max-w-7xl space-y-6">
      {/* Usage alert banner — yellow at 80%+, red at 100%+ */}
      {usageAlerts && usageAlerts.alert_level !== "none" && (
        <div
          className={`flex items-center gap-3 rounded-xl px-5 py-3 border text-sm font-medium ${
            usageAlerts.alert_level === "critical"
              ? "bg-of-error/10 border-of-error/20 text-of-error"
              : "bg-amber-400/10 border-amber-400/20 text-amber-400"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>
            {usageAlerts.alert_level === "critical"
              ? `You have reached ${usageAlerts.max_pct_used.toFixed(0)}% of your tier limit. Requests above 110% will be blocked.`
              : `You are at ${usageAlerts.max_pct_used.toFixed(0)}% of your tier limit.`}{" "}
            <a href="/settings/billing" className="underline underline-offset-2 font-bold">Upgrade plan</a>
          </span>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {spendLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-of-surface-container-high rounded-xl h-28"
            />
          ))
        ) : (
          <>
            <KpiCard
              label="Total Spend (30d)"
              value={`$${spend?.total_cost?.toFixed(2) ?? "\u2014"}`}
              sparkline={sparklineCounts}
            />
            <KpiCard
              label="Requests"
              value={spend?.request_count?.toLocaleString() ?? "\u2014"}
              sparkline={sparklineCounts}
            />
            <KpiCard label="Avg Latency (p50)" value="\u2014" />
            <KpiCard label="Error Rate" value="\u2014" />
            <KpiCard
              label="Active Providers"
              value={
                healthLoading
                  ? "\u2014"
                  : `${
                      health?.providers?.filter((p) => p.status === "UP")
                        .length ?? "\u2014"
                    } / ${health?.providers?.length ?? "\u2014"}`
              }
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Requests over Time */}
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-of-on-surface">
              Requests over Time
            </h3>
            <div className="flex gap-1">
              {(["7d", "30d"] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                    timePeriod === period
                      ? "bg-of-primary/20 text-of-primary"
                      : "text-of-on-surface-variant hover:text-of-on-surface"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          {reqLoading ? (
            <div className="h-32 animate-pulse bg-of-surface-container-high rounded" />
          ) : (
            <div className="flex items-end gap-1 h-32">
              {barData.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-of-primary/30 hover:bg-of-primary/60 transition-colors relative group"
                  style={{
                    height: `${Math.max((d.count / barMax) * 100, 4)}%`,
                  }}
                >
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-of-on-surface-variant opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {d.count}
                  </span>
                </div>
              ))}
              {barData.length === 0 && (
                <p className="text-sm text-of-on-surface-variant m-auto">
                  No data
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cost over Time */}
        <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
          <h3 className="text-sm font-bold text-of-on-surface mb-4">
            Cost over Time
          </h3>
          {spendLoading ? (
            <div className="h-32 animate-pulse bg-of-surface-container-high rounded" />
          ) : (
            <div className="flex items-end gap-1 h-32">
              {areaData.map((d, i) => {
                const dayEstimate = d.count * avgCostPerReq;
                return (
                  <div
                    key={i}
                    className="flex-1 relative"
                    style={{
                      height: `${Math.max((dayEstimate / areaMax) * 100, 4)}%`,
                    }}
                  >
                    <div
                      className="absolute inset-0 rounded-t-sm"
                      style={{
                        background: `rgba(90,218,206,${0.15 + (i / 14) * 0.3})`,
                      }}
                    />
                  </div>
                );
              })}
              {areaData.length === 0 && (
                <p className="text-sm text-of-on-surface-variant m-auto">
                  No data
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Usage Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <UsageWidget />
        </div>
      </div>

      {/* Provider Health Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {healthLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-of-surface-container-high rounded-xl h-16"
              />
            ))
          : (health?.providers ?? []).map((p) => (
              <div
                key={p.name}
                className="bg-of-surface-container rounded-xl p-4 border border-of-outline-variant/5 flex items-center gap-3"
              >
                <div
                  className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    p.status === "UP"
                      ? "bg-emerald-400"
                      : p.status === "DEGRADED"
                      ? "bg-warning"
                      : "bg-of-error"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-of-on-surface truncate">
                    {p.name}
                  </p>
                  <p className="text-[10px] text-of-on-surface-variant uppercase font-bold">
                    {p.status}
                  </p>
                </div>
                {p.consecutive_errors > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-of-error">
                    {p.consecutive_errors} err
                  </span>
                )}
              </div>
            ))}
        {!healthLoading && (health?.providers ?? []).length === 0 && (
          <div className="col-span-4 bg-of-surface-container rounded-xl p-4 border border-of-outline-variant/5">
            <p className="text-sm text-of-on-surface-variant text-center">
              No provider data available
            </p>
          </div>
        )}
      </div>

      {/* Recent Activity Stream */}
      <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5">
        <h3 className="text-sm font-bold text-of-on-surface mb-3">
          Recent Activity
        </h3>
        <div className="space-y-2">
          {reqLoading && (
            <div className="animate-pulse bg-of-surface-container-high rounded h-32" />
          )}
          {!reqLoading &&
            (requests?.counts ?? [])
              .slice(-5)
              .reverse()
              .map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-of-outline-variant/5 last:border-0"
                >
                  <span className="text-sm text-of-on-surface-variant font-mono">
                    {d.date}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-of-primary/10 text-of-primary tabular-nums">
                    {d.count} req
                  </span>
                </div>
              ))}
          {!reqLoading &&
            (!requests?.counts || requests.counts.length === 0) && (
              <p className="text-sm text-of-on-surface-variant text-center py-4">
                No recent data
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
