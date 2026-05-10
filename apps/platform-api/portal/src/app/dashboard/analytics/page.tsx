"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";

/** Analytics dashboard -- security analytics: anomalies, detections, severity breakdown.
 *  Wired to live SoulAuth analytics + detection APIs. */

/* ---------- API response types ---------- */

interface AnalyticsDashboard {
  period_hours: number;
  total_anomalies: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  top_anomalous_agents: { agent_id?: string; soulkey_id?: string; count: number }[];
  tracked_baselines: number;
}

interface DetectionStatus {
  rules_loaded: number;
  rules_enabled: number;
  rules_by_level: Record<string, number>;
  matches_last_hour: number;
  total_matches_buffered: number;
  playbooks_loaded: number;
  detection_enabled: boolean;
}

interface DetectionMatch {
  rule_id: string;
  rule_title: string;
  level: string;
  timestamp: string;
  matched_fields: Record<string, unknown>;
  response_playbook: string;
}

/* ---------- Derived chart data ---------- */
interface NameCount { name: string; count: number }
interface DayCount { day: string; count: number }

/* ---------- Color helpers ---------- */
const severityColor: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-400",
  info: "bg-slate-400",
};

const severityTextColor: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-blue-400",
  info: "text-slate-400",
};

/* ---------- Build detection timeline from matches ---------- */
function buildTimeline(matches: DetectionMatch[]): DayCount[] {
  const buckets: Record<string, number> = {};
  for (const m of matches) {
    const d = new Date(m.timestamp);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    buckets[label] = (buckets[label] || 0) + 1;
  }
  // Return sorted by date (matches are already reverse-chron from API)
  const entries = Object.entries(buckets).map(([day, count]) => ({ day, count }));
  return entries.length > 0 ? entries : [];
}

/* ---------- Build severity breakdown ---------- */
function buildSeverityBreakdown(
  rulesByLevel: Record<string, number>,
  matches: DetectionMatch[],
): NameCount[] {
  // Count matches by severity
  const counts: Record<string, number> = {};
  for (const m of matches) {
    counts[m.level] = (counts[m.level] || 0) + 1;
  }
  // If no matches, show rules by level
  const source = Object.keys(counts).length > 0 ? counts : rulesByLevel;
  return Object.entries(source)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));
}

/* ---------- AnimatedNumber component ---------- */
function AnimatedNumber({ value, className }: { value: string; className?: string }) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
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

/* ---------- Export helper ---------- */
function exportReport(
  analytics: AnalyticsDashboard | null,
  detection: DetectionStatus | null,
  matches: DetectionMatch[] | null,
) {
  const now = new Date().toISOString();
  const lines: string[] = [
    "Pantheon Security Analytics Report",
    `Generated: ${now}`,
    `Period: Last ${analytics?.period_hours ?? "N/A"} hours`,
    "",
    "=== Anomaly Summary ===",
    `Total Anomalies: ${analytics?.total_anomalies ?? 0}`,
    `Tracked Baselines: ${analytics?.tracked_baselines ?? 0}`,
  ];

  if (analytics?.by_severity && Object.keys(analytics.by_severity).length > 0) {
    lines.push("", "Anomalies by Severity:");
    for (const [sev, count] of Object.entries(analytics.by_severity)) {
      lines.push(`  ${sev}: ${count}`);
    }
  }

  if (analytics?.by_type && Object.keys(analytics.by_type).length > 0) {
    lines.push("", "Anomalies by Type:");
    for (const [t, count] of Object.entries(analytics.by_type)) {
      lines.push(`  ${t}: ${count}`);
    }
  }

  lines.push(
    "",
    "=== Detection Engine ===",
    `Status: ${detection?.detection_enabled ? "Enabled" : "Disabled"}`,
    `Rules Loaded: ${detection?.rules_loaded ?? 0}`,
    `Rules Enabled: ${detection?.rules_enabled ?? 0}`,
    `Playbooks Loaded: ${detection?.playbooks_loaded ?? 0}`,
    `Matches (last hour): ${detection?.matches_last_hour ?? 0}`,
    `Matches (buffered): ${detection?.total_matches_buffered ?? 0}`,
  );

  if (detection?.rules_by_level && Object.keys(detection.rules_by_level).length > 0) {
    lines.push("", "Rules by Level:");
    for (const [level, count] of Object.entries(detection.rules_by_level)) {
      lines.push(`  ${level}: ${count}`);
    }
  }

  if (matches && matches.length > 0) {
    lines.push("", "=== Recent Detection Matches ===");
    for (const m of matches) {
      lines.push(
        `  [${m.level.toUpperCase()}] ${m.timestamp} - ${m.rule_title}`,
        `    Rule: ${m.rule_id} | Playbook: ${m.response_playbook}`,
      );
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tiresias-analytics-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Page component ---------- */

export default function AnalyticsPage() {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const identityTransform = useCallback((raw: unknown) => raw as AnalyticsDashboard, []);
  const detectionTransform = useCallback((raw: unknown) => raw as DetectionStatus, []);
  const matchesTransform = useCallback((raw: unknown) => raw as DetectionMatch[], []);

  const { data: analytics, loading: loadingAnalytics, error: errorAnalytics } = useWidgetData<AnalyticsDashboard>({
    endpoint: "/v1/analytics/dashboard?hours=168",
    transform: identityTransform,
    refreshInterval: 60000,
  });

  const { data: detection, loading: loadingDetection, error: errorDetection } = useWidgetData<DetectionStatus>({
    endpoint: "/v1/detection/status",
    transform: detectionTransform,
    refreshInterval: 60000,
  });

  const { data: matches, loading: loadingMatches, error: errorMatches } = useWidgetData<DetectionMatch[]>({
    endpoint: "/v1/detection/matches?limit=50",
    transform: matchesTransform,
    refreshInterval: 60000,
  });

  const loading = loadingAnalytics || loadingDetection || loadingMatches;
  const error = errorAnalytics || errorDetection || errorMatches;

  // Derived data
  const timeline = matches ? buildTimeline(matches) : [];
  const severityBreakdown = buildSeverityBreakdown(
    detection?.rules_by_level ?? {},
    matches ?? [],
  );
  const topAgents = analytics?.top_anomalous_agents ?? [];

  const maxTimeline = timeline.length > 0 ? Math.max(...timeline.map((d) => d.count)) : 1;
  const maxSeverity = severityBreakdown.length > 0 ? severityBreakdown[0].count : 1;

  // Summary stats
  const totalAnomalies = analytics?.total_anomalies ?? 0;
  const rulesEnabled = detection?.rules_enabled ?? 0;
  const matchesLastHour = detection?.matches_last_hour ?? 0;
  const totalBuffered = detection?.total_matches_buffered ?? 0;

  return (
    <TierGate requiredTier="pro" featureLabel="Security Analytics">
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
          <button
            onClick={() => exportReport(analytics, detection, matches)}
            className="group px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200 flex items-center gap-2"
          >
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
          { label: "Total Anomalies", value: String(totalAnomalies), color: "text-red-400" },
          { label: "Detection Rules", value: String(rulesEnabled), color: "text-teal-400" },
          { label: "Matches (1h)", value: String(matchesLastHour), color: "text-gold-400" },
          { label: "Buffered Matches", value: String(totalBuffered), color: "text-foreground" },
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
        {/* Detection Timeline Bar Chart */}
        <div className="lg:col-span-2 glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Detection Matches (7 days)
            {timeline.length === 0 && !loading && <span className="text-foreground-subtle font-normal ml-2">No matches</span>}
          </h3>
          <div className="flex items-end gap-1.5 h-48">
            {timeline.length > 0 ? (
              timeline.map((d, i) => {
                const height = (d.count / maxTimeline) * 100;
                const isHovered = hoveredBar === i;
                return (
                  <div
                    key={d.day}
                    className="flex-1 flex flex-col items-center gap-1 group relative"
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute -top-8 px-2 py-1 rounded-md bg-navy-700 border border-white/10 text-[10px] text-foreground font-mono shadow-lg whitespace-nowrap z-10"
                      >
                        {d.count} match{d.count !== 1 ? "es" : ""}
                      </motion.div>
                    )}
                    <motion.div
                      className={`w-full rounded-t-sm cursor-pointer transition-colors duration-200 ${
                        isHovered
                          ? "bg-gradient-to-t from-gold-600 to-gold-400"
                          : "bg-gradient-to-t from-red-600 to-orange-400"
                      }`}
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ duration: 0.5, delay: i * 0.03, ease: "easeOut" }}
                      style={{ minHeight: 4 }}
                    />
                    <span className="text-[9px] text-foreground-subtle mt-1 whitespace-nowrap">{d.day}</span>
                  </div>
                );
              })
            ) : (
              !loading && (
                <div className="w-full h-full flex items-center justify-center text-foreground-subtle text-sm">
                  No detection matches in the last 7 days
                </div>
              )
            )}
          </div>
        </div>

        {/* Severity Breakdown Donut */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Severity Breakdown</h3>
          {severityBreakdown.length > 0 ? (
            <>
              <div className="flex items-center justify-center py-4">
                <div className="relative w-40 h-40">
                  <motion.div
                    className="w-full h-full rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      background: (() => {
                        const total = severityBreakdown.reduce((s, v) => s + v.count, 0);
                        if (total === 0) return "#1e293b";
                        const colors: Record<string, string> = {
                          critical: "#ef4444",
                          high: "#f97316",
                          medium: "#eab308",
                          low: "#60a5fa",
                          info: "#94a3b8",
                        };
                        let angle = 0;
                        const stops = severityBreakdown.map((s) => {
                          const start = angle;
                          angle += (s.count / total) * 360;
                          return `${colors[s.name] || "#64748b"} ${start}deg ${angle}deg`;
                        });
                        return `conic-gradient(${stops.join(", ")})`;
                      })(),
                    }}
                  />
                  <div className="absolute inset-4 rounded-full bg-navy-900 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-xl font-bold text-foreground">
                        <AnimatedNumber value={String(severityBreakdown.reduce((s, v) => s + v.count, 0))} />
                      </p>
                      <p className="text-[10px] text-foreground-subtle">Total</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
                {severityBreakdown.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-sm ${severityColor[s.name] || "bg-slate-500"}`}></div>
                    <span className="text-xs text-foreground-muted capitalize">{s.name} ({s.count})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            !loading && (
              <div className="flex items-center justify-center h-48 text-foreground-subtle text-sm">
                No severity data
              </div>
            )
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Detection Matches */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Recent Detection Matches
            {(!matches || matches.length === 0) && !loading && <span className="text-foreground-subtle font-normal ml-2">None</span>}
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {matches && matches.length > 0 ? (
              matches.slice(0, 10).map((m, i) => (
                <motion.div
                  key={`${m.rule_id}-${m.timestamp}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-navy-800/50 hover:bg-navy-800 transition-colors"
                >
                  <span className={`text-[10px] font-bold uppercase mt-0.5 ${severityTextColor[m.level] || "text-slate-400"}`}>
                    {m.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{m.rule_title}</p>
                    <p className="text-[10px] text-foreground-subtle mt-0.5 font-mono">
                      {new Date(m.timestamp).toLocaleString()} &middot; {m.response_playbook}
                    </p>
                  </div>
                </motion.div>
              ))
            ) : (
              !loading && (
                <div className="text-foreground-subtle text-sm text-center py-6">No recent matches</div>
              )
            )}
          </div>
        </div>

        {/* Detection Rules by Level + Engine Status */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Detection Engine</h3>
          {detection ? (
            <div className="space-y-4">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${detection.detection_enabled ? "bg-green-400" : "bg-red-400"}`} />
                <span className="text-xs text-foreground-muted">
                  {detection.detection_enabled ? "Active" : "Disabled"} &middot; {detection.playbooks_loaded} playbooks
                </span>
              </div>

              {/* Rules by level bars */}
              <div className="space-y-3">
                {Object.entries(detection.rules_by_level)
                  .sort(([, a], [, b]) => b - a)
                  .map(([level, count], i) => {
                    const maxRules = Math.max(...Object.values(detection.rules_by_level));
                    const width = maxRules > 0 ? (count / maxRules) * 100 : 0;
                    return (
                      <div key={level} className="space-y-1 group">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-medium capitalize ${severityTextColor[level] || "text-foreground-muted"}`}>
                            {level}
                          </span>
                          <span className="text-foreground-subtle font-mono">{count} rule{count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${severityColor[level] || "bg-slate-500"}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${width}%` }}
                            transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Top anomalous agents */}
              {topAgents.length > 0 && (
                <div className="pt-2 border-t border-white/5">
                  <p className="text-xs text-foreground-subtle mb-2">Top Anomalous Agents</p>
                  {topAgents.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1">
                      <span className="text-foreground-muted font-mono truncate max-w-[200px]">
                        {a.agent_id || a.soulkey_id || `Agent ${i + 1}`}
                      </span>
                      <span className="text-red-400 font-mono">{a.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            !loading && (
              <div className="text-foreground-subtle text-sm text-center py-6">Detection engine offline</div>
            )
          )}
        </div>
      </div>
    </div>
    </TierGate>
  );
}
