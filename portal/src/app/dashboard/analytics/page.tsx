"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useWidgetData } from "@/lib/useWidgetData";

/** Analytics dashboard -- evaluation trends, latency, and agent activity charts. Wired to live Tiresias unified analytics API. */

/* ---------- API response types ---------- */
interface ByModel {
  model: string;
  provider: string;
  request_count: number;
  cost_usd: number;
}
interface EndpointStat {
  method: string;
  path_pattern: string;
  api_service: string | null;
  request_count: number;
  error_count: number;
  error_rate: number;
  latency_avg_ms: number;
  latency_min_ms: number;
  latency_max_ms: number;
  cost_usd_total: number;
}
interface UnifiedAnalytics {
  tenant_id: string;
  window_hours: number;
  llm: {
    request_count: number;
    error_count: number;
    total_tokens: number;
    cost_usd_total: number;
    by_model: ByModel[];
  };
  api: {
    request_count: number;
    error_count: number;
    cost_usd_total: number;
    endpoints: EndpointStat[];
    error_breakdown: { method: string; path_pattern: string; status_code: number; count: number }[];
  };
  totals: {
    request_count: number;
    cost_usd_total: number;
  };
  /* Optional daily_breakdown field — present when the backend supports it */
  daily_breakdown?: { date: string; request_count: number; cost_usd: number }[];
}

/* ---------- Derived chart data types ---------- */
interface DailyEval { day: string; value: number }
interface NameCount { name: string; count: number }

/* ---------- Transform helpers ---------- */

/** Build 14-day daily breakdown.  If the API provides `daily_breakdown` we use it;
 *  otherwise we synthesize a single-bar chart from the totals. */
function buildDailyEvals(raw: UnifiedAnalytics): DailyEval[] {
  if (raw.daily_breakdown && raw.daily_breakdown.length > 0) {
    return raw.daily_breakdown.map((d) => {
      const dt = new Date(d.date);
      const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return { day: label, value: d.request_count };
    });
  }
  // Fallback: distribute total requests across today
  const today = new Date();
  const label = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return [{ day: label, value: raw.totals.request_count }];
}

/** Top resources = top API endpoint paths by request count */
function buildTopResources(raw: UnifiedAnalytics): NameCount[] {
  return [...raw.api.endpoints]
    .sort((a, b) => b.request_count - a.request_count)
    .slice(0, 5)
    .map((e) => ({ name: `${e.method} ${e.path_pattern}`, count: e.request_count }));
}

/** Top agents = top LLM models by request count */
function buildTopAgents(raw: UnifiedAnalytics): NameCount[] {
  return [...raw.llm.by_model]
    .sort((a, b) => b.request_count - a.request_count)
    .slice(0, 5)
    .map((m) => ({ name: `${m.model} (${m.provider})`, count: m.request_count }));
}

/* ---------- AnimatedNumber component (unchanged) ---------- */

function AnimatedNumber({ value, className }: { value: string; className?: string }) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    // Parse the numeric part
    const numericStr = value.replace(/[^0-9.]/g, "");
    const target = parseFloat(numericStr);
    if (isNaN(target)) {
      const t = setTimeout(() => setDisplay(value), 0);
      return () => clearTimeout(t);
    }

    const suffix = value.replace(/[0-9,.]/g, "");
    const hasCommas = value.includes(",");
    const duration = 500;
    const steps = 15;
    let current = 0;

    const timer = setInterval(() => {
      current += target / steps;
      if (current >= target) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        const formatted = hasCommas ? Math.floor(current).toLocaleString() : Math.floor(current).toString();
        setDisplay(formatted + suffix);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span className={className}>{display}</span>;
}

/* ---------- Page component ---------- */

export default function AnalyticsPage() {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Memoize transform to avoid re-creating on every render
  const transform = useCallback((raw: unknown) => raw as UnifiedAnalytics, []);

  const { data, loading, error } = useWidgetData<UnifiedAnalytics>({
    endpoint: "/v1/analytics/unified?hours=336",
    transform,
    refreshInterval: 60000, // refresh every 60s
  });

  // Derive chart data from live response
  const dailyEvals = data ? buildDailyEvals(data) : [];
  const topResources = data ? buildTopResources(data) : [];
  const topAgents = data ? buildTopAgents(data) : [];

  const maxEval = dailyEvals.length > 0 ? Math.max(...dailyEvals.map((d) => d.value)) : 1;
  const maxResource = topResources.length > 0 ? topResources[0].count : 1;
  const maxAgent = topAgents.length > 0 ? topAgents[0].count : 1;

  // Summary stats from live data
  const totalEvals = data?.totals.request_count ?? 0;
  const uniqueModels = data?.llm.by_model.length ?? 0;
  const avgLatency = data?.api.endpoints.length
    ? Math.round(data.api.endpoints.reduce((s, e) => s + e.latency_avg_ms, 0) / data.api.endpoints.length)
    : 0;
  const errorRate = data?.api.request_count
    ? ((1 - data.api.error_count / data.api.request_count) * 100).toFixed(2)
    : "100.00";

  // Allow vs deny derived from error rate
  const allowPct = parseFloat(errorRate);
  const denyPct = parseFloat((100 - allowPct).toFixed(2));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {loading && (
              <span className="text-xs text-foreground-subtle animate-pulse">Loading live data...</span>
            )}
            {error && (
              <span className="text-xs text-red-400" title={error}>API error</span>
            )}
          </div>
          <button className="group px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200 flex items-center gap-2">
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Report
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Requests", value: totalEvals.toLocaleString(), color: "text-foreground" },
          { label: "LLM Models", value: String(uniqueModels), color: "text-teal-400" },
          { label: "Avg Latency", value: avgLatency > 0 ? `${avgLatency}ms` : "--", color: "text-gold-400" },
          { label: "Success Rate", value: `${errorRate}%`, color: "text-green-400" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-5"
          >
            <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">{stat.label}</p>
            <p className={`text-3xl font-bold mt-2 ${stat.color}`}>
              <AnimatedNumber value={stat.value} />
            </p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Evaluations Bar Chart */}
        <div className="lg:col-span-2 glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Daily Requests (14 days)
            {dailyEvals.length === 0 && !loading && <span className="text-foreground-subtle font-normal ml-2">No data yet</span>}
          </h3>
          <div className="flex items-end gap-1.5 h-48">
            {dailyEvals.length > 0 ? (
              dailyEvals.map((d, i) => {
                const height = (d.value / maxEval) * 100;
                const isHovered = hoveredBar === i;
                return (
                  <div
                    key={d.day}
                    className="flex-1 flex flex-col items-center gap-1 group relative"
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute -top-8 px-2 py-1 rounded-md bg-navy-700 border border-white/10 text-[10px] text-foreground font-mono shadow-lg whitespace-nowrap z-10"
                      >
                        {d.value.toLocaleString()}
                      </motion.div>
                    )}
                    <motion.div
                      className={`w-full rounded-t-sm cursor-pointer transition-colors duration-200 ${
                        isHovered
                          ? "bg-gradient-to-t from-gold-600 to-gold-400"
                          : "bg-gradient-to-t from-teal-600 to-teal-400"
                      }`}
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ duration: 0.5, delay: i * 0.03, ease: "easeOut" }}
                      style={{ minHeight: 4 }}
                    />
                    <span className="text-[9px] text-foreground-subtle mt-1 whitespace-nowrap">{d.day.split(" ")[1]}</span>
                  </div>
                );
              })
            ) : (
              !loading && (
                <div className="w-full h-full flex items-center justify-center text-foreground-subtle text-sm">
                  No request data in the last 14 days
                </div>
              )
            )}
          </div>
        </div>

        {/* Allow vs Deny Donut */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Success vs Error</h3>
          <div className="flex items-center justify-center py-4">
            <div className="relative w-40 h-40">
              {/* Animated CSS donut chart */}
              <motion.div
                className="w-full h-full rounded-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  background: `conic-gradient(
                    #22c55e 0deg ${allowPct * 3.6}deg,
                    #ef4444 ${allowPct * 3.6}deg 360deg
                  )`,
                }}
              />
              {/* Center hole */}
              <div className="absolute inset-4 rounded-full bg-navy-900 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">
                    <AnimatedNumber value={`${allowPct}`} />%
                  </p>
                  <p className="text-[10px] text-foreground-subtle">Success</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-green-500"></div>
              <span className="text-xs text-foreground-muted">Success ({allowPct}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-red-500"></div>
              <span className="text-xs text-foreground-muted">Error ({denyPct}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Resources */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top API Endpoints
            {topResources.length === 0 && !loading && <span className="text-foreground-subtle font-normal ml-2">No data yet</span>}
          </h3>
          <div className="space-y-3">
            {topResources.map((r, i) => {
              const width = (r.count / maxResource) * 100;
              return (
                <div key={r.name} className="space-y-1 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted font-mono truncate max-w-[200px] group-hover:text-foreground transition-colors duration-200">{r.name}</span>
                    <span className="text-foreground-subtle font-mono">{r.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
            {topResources.length === 0 && !loading && (
              <div className="text-foreground-subtle text-sm text-center py-6">No endpoint data available</div>
            )}
          </div>
        </div>

        {/* Top Agents (Models) */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top LLM Models by Activity
            {topAgents.length === 0 && !loading && <span className="text-foreground-subtle font-normal ml-2">No data yet</span>}
          </h3>
          <div className="space-y-3">
            {topAgents.map((a, i) => {
              const width = (a.count / maxAgent) * 100;
              return (
                <div key={a.name} className="space-y-1 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted group-hover:text-foreground transition-colors duration-200">{a.name}</span>
                    <span className="text-foreground-subtle font-mono">{a.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-gold-600 to-gold-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
            {topAgents.length === 0 && !loading && (
              <div className="text-foreground-subtle text-sm text-center py-6">No model data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
