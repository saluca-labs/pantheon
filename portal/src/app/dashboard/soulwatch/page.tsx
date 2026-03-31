"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useWidgetData } from "@/lib/useWidgetData";

/** SoulWatch overview -- anomaly detection metrics and alert summary. Fetches live data with mock fallback. */

/* ---- Types ---- */

interface Detection {
  id: string;
  rule_id?: string;
  rule_title?: string;
  rule?: string;
  level?: string;
  severity?: string;
  soulkey_id?: string;
  agent?: string;
  created_at?: string;
  timestamp?: string;
  ago?: string;
}

interface Anomaly {
  id: string;
  soulkey_id?: string;
  anomaly_type?: string;
  severity?: string;
  status?: string;
  created_at?: string;
}

interface AgentRisk {
  persona: string;
  soulkey: string;
  riskScore: number;
  trend: string;
  evaluations: number;
  anomalies: number;
  status: "critical" | "warning" | "healthy";
}

interface SoulWatchDashboard {
  detections: Detection[] | null;
  anomalies: Anomaly[] | null;
  quarantines: { id: string }[] | null;
  fetched_at: string;
}

/* ---- Mock Fallback Data ---- */

const MOCK_HOURLY_ANOMALIES = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  count: Math.floor(Math.random() * 18) + (i >= 2 && i <= 5 ? 12 : 2),
}));

const MOCK_TOP_AGENTS: AgentRisk[] = [
  { persona: "analytics-agent", soulkey: "sk_a3f1...", riskScore: 87, trend: "up", evaluations: 3420, anomalies: 12, status: "warning" },
  { persona: "data-pipeline", soulkey: "sk_5c8e...", riskScore: 67, trend: "down", evaluations: 5890, anomalies: 8, status: "warning" },
  { persona: "customer-support-ai", soulkey: "sk_9d2b...", riskScore: 45, trend: "stable", evaluations: 8120, anomalies: 3, status: "healthy" },
  { persona: "compliance-checker", soulkey: "sk_8a1c...", riskScore: 92, trend: "up", evaluations: 1240, anomalies: 15, status: "critical" },
  { persona: "monitoring-agent", soulkey: "sk_b7e4...", riskScore: 12, trend: "stable", evaluations: 9820, anomalies: 0, status: "healthy" },
  { persona: "cost-optimizer", soulkey: "sk_2f9a...", riskScore: 34, trend: "down", evaluations: 2180, anomalies: 2, status: "healthy" },
  { persona: "security-scanner", soulkey: "sk_e1c5...", riskScore: 23, trend: "stable", evaluations: 6100, anomalies: 1, status: "healthy" },
  { persona: "test-agent-beta", soulkey: "sk_f2b9...", riskScore: 98, trend: "up", evaluations: 340, anomalies: 18, status: "critical" },
  { persona: "email-processor", soulkey: "sk_4a7d...", riskScore: 28, trend: "stable", evaluations: 4560, anomalies: 1, status: "healthy" },
  { persona: "report-generator", soulkey: "sk_c3e8...", riskScore: 41, trend: "down", evaluations: 1890, anomalies: 4, status: "healthy" },
];

const MOCK_RECENT_DETECTIONS: Detection[] = [
  { id: "det_001", rule: "Cross-Tenant Access Attempt", agent: "test-agent-beta", severity: "Critical", timestamp: "03:14:22", ago: "12 min ago" },
  { id: "det_002", rule: "Excessive Permission Requests", agent: "compliance-checker", severity: "High", timestamp: "03:08:45", ago: "18 min ago" },
  { id: "det_003", rule: "Off-Hours Activity", agent: "analytics-agent", severity: "Medium", timestamp: "02:55:10", ago: "31 min ago" },
  { id: "det_004", rule: "Unusual Data Volume", agent: "data-pipeline", severity: "Medium", timestamp: "02:41:33", ago: "45 min ago" },
  { id: "det_005", rule: "Rapid Key Rotation", agent: "compliance-checker", severity: "High", timestamp: "02:30:00", ago: "56 min ago" },
  { id: "det_006", rule: "Failed Auth Spike", agent: "test-agent-beta", severity: "High", timestamp: "02:12:18", ago: "1 hour ago" },
  { id: "det_007", rule: "Off-Hours Activity", agent: "data-pipeline", severity: "Medium", timestamp: "01:48:55", ago: "1.4 hours ago" },
  { id: "det_008", rule: "Excessive Permission Requests", agent: "analytics-agent", severity: "High", timestamp: "01:22:40", ago: "1.9 hours ago" },
  { id: "det_009", rule: "Unusual Data Volume", agent: "report-generator", severity: "Medium", timestamp: "00:55:12", ago: "2.3 hours ago" },
  { id: "det_010", rule: "Off-Hours Activity", agent: "cost-optimizer", severity: "Low", timestamp: "00:30:05", ago: "2.8 hours ago" },
];

/* ---- Helpers ---- */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = (mins / 60).toFixed(1);
  return `${hrs} hours ago`;
}

function mapSeverity(level: string | undefined): string {
  if (!level) return "Medium";
  const l = level.toLowerCase();
  if (l === "critical" || l === "crit") return "Critical";
  if (l === "high") return "High";
  if (l === "low") return "Low";
  return "Medium";
}

/** Build hourly anomaly histogram from live anomaly records. */
function buildHourlyFromAnomalies(anomalies: Anomaly[]): { hour: string; count: number }[] {
  const buckets: Record<number, number> = {};
  for (let i = 0; i < 24; i++) buckets[i] = 0;
  const now = Date.now();
  for (const a of anomalies) {
    if (!a.created_at) continue;
    const dt = new Date(a.created_at);
    if (now - dt.getTime() > 24 * 3600 * 1000) continue;
    buckets[dt.getHours()]++;
  }
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    count: buckets[i],
  }));
}

/** Derive agent risk data from anomalies. */
function buildAgentRisks(anomalies: Anomaly[]): AgentRisk[] {
  const byAgent: Record<string, { count: number; severities: string[] }> = {};
  for (const a of anomalies) {
    const key = a.soulkey_id || "unknown";
    if (!byAgent[key]) byAgent[key] = { count: 0, severities: [] };
    byAgent[key].count++;
    if (a.severity) byAgent[key].severities.push(a.severity);
  }
  return Object.entries(byAgent).map(([key, val]) => {
    const critCount = val.severities.filter((s) => s.toLowerCase() === "critical").length;
    const highCount = val.severities.filter((s) => s.toLowerCase() === "high").length;
    const riskScore = Math.min(100, critCount * 25 + highCount * 15 + val.count * 5);
    return {
      persona: key.substring(0, 20),
      soulkey: `${key.substring(0, 8)}...`,
      riskScore,
      trend: "stable",
      evaluations: 0,
      anomalies: val.count,
      status: (riskScore >= 80 ? "critical" : riskScore >= 50 ? "warning" : "healthy") as "critical" | "warning" | "healthy",
    };
  }).sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
}

/** Normalize a detection record from API or mock. */
function normalizeDetection(d: Detection): { id: string; rule: string; agent: string; severity: string; ago: string } {
  return {
    id: d.id,
    rule: d.rule_title || d.rule || d.rule_id || "Unknown Rule",
    agent: d.agent || d.soulkey_id || "unknown",
    severity: d.severity || mapSeverity(d.level),
    ago: d.ago || (d.created_at ? timeAgo(d.created_at) : "unknown"),
  };
}

const severityColor: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 border border-red-500/20",
  High: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  Medium: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  Low: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const statusColor: Record<string, string> = {
  critical: "text-red-400",
  warning: "text-yellow-400",
  healthy: "text-green-400",
};

const riskBarColor = (score: number) => {
  if (score >= 80) return "bg-gradient-to-r from-red-600 to-red-400";
  if (score >= 50) return "bg-gradient-to-r from-yellow-600 to-yellow-400";
  return "bg-gradient-to-r from-green-600 to-green-400";
};

function AnimatedCount({ target, className }: { target: number; className?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 600;
    const steps = 20;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);

  return <span className={className}>{count}</span>;
}

export default function SoulWatchDashboardPage() {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  /* ---- Live data fetch ---- */
  const { data: dashData, loading } = useWidgetData<SoulWatchDashboard>({
    endpoint: "/api/soulwatch/dashboard",
    refreshInterval: 30000,
  });

  /* ---- Derived state: live data or mock fallback ---- */
  const isLive = dashData !== null && (
    (dashData.anomalies && dashData.anomalies.length > 0) ||
    (dashData.detections && dashData.detections.length > 0)
  );

  const hourlyAnomalies = useMemo(() => {
    if (isLive && dashData?.anomalies && dashData.anomalies.length > 0) {
      return buildHourlyFromAnomalies(dashData.anomalies);
    }
    return MOCK_HOURLY_ANOMALIES;
  }, [isLive, dashData]);

  const topAgents = useMemo(() => {
    if (isLive && dashData?.anomalies && dashData.anomalies.length > 0) {
      return buildAgentRisks(dashData.anomalies);
    }
    return MOCK_TOP_AGENTS;
  }, [isLive, dashData]);

  const recentDetections = useMemo(() => {
    if (isLive && dashData?.detections && dashData.detections.length > 0) {
      return dashData.detections.map(normalizeDetection);
    }
    return MOCK_RECENT_DETECTIONS.map(normalizeDetection);
  }, [isLive, dashData]);

  const openAnomalyCount = useMemo(() => {
    if (dashData?.anomalies && dashData.anomalies.length > 0) {
      return dashData.anomalies.filter((a) => a.status === "open").length;
    }
    return 14;
  }, [dashData]);

  const quarantineCount = useMemo(() => {
    if (dashData?.quarantines && dashData.quarantines.length > 0) {
      return dashData.quarantines.length;
    }
    return 3;
  }, [dashData]);

  const rulesFiring = useMemo(() => {
    if (isLive && dashData?.detections) {
      const rules = new Set(dashData.detections.map((d) => d.rule_id || d.rule));
      return rules.size;
    }
    return 47;
  }, [isLive, dashData]);

  const agentsMonitored = useMemo(() => {
    if (isLive && dashData?.anomalies) {
      const agents = new Set(dashData.anomalies.map((a) => a.soulkey_id));
      return agents.size;
    }
    return 47;
  }, [isLive, dashData]);

  const maxAnomaly = Math.max(...hourlyAnomalies.map((h) => h.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">SoulWatch</h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium text-green-400">
              {loading ? "Connecting..." : isLive ? "Live" : "Monitoring active"}
            </span>
          </div>
          {!isLive && !loading && (
            <span className="text-[10px] text-foreground-subtle px-2 py-0.5 rounded bg-white/5 border border-white/10">
              Demo data
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/soulwatch/anomalies"
            className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-white/10 transition-all duration-200"
          >
            View All Anomalies
          </Link>
          <Link
            href="/dashboard/soulwatch/rules"
            className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors"
          >
            Manage Rules
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Open Anomalies", value: openAnomalyCount, color: "text-red-400", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          )},
          { label: "Active Quarantines", value: quarantineCount, color: "text-orange-400", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          )},
          { label: "Rules Firing (24h)", value: rulesFiring, color: "text-of-primary", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          )},
          { label: "Agents Monitored", value: agentsMonitored, color: "text-of-primary", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
            </svg>
          )},
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">{stat.label}</p>
              <div className={`${stat.color} opacity-50`}>{stat.icon}</div>
            </div>
            <p className={`text-3xl font-bold ${stat.color}`}>
              <AnimatedCount target={stat.value} />
            </p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Anomaly Timeline */}
        <div className="lg:col-span-2 bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Anomaly Timeline (Last 24 Hours)</h3>
          <div className="flex items-end gap-1 h-48">
            {hourlyAnomalies.map((h, i) => {
              const height = maxAnomaly > 0 ? (h.count / maxAnomaly) * 100 : 0;
              const isHovered = hoveredBar === i;
              return (
                <div
                  key={h.hour}
                  className="flex-1 flex flex-col items-center gap-1 group relative"
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -top-8 px-2 py-1 rounded-md bg-of-surface-container-highest border border-white/10 text-[10px] text-foreground font-mono shadow-lg whitespace-nowrap z-10"
                    >
                      {h.count} anomalies
                    </motion.div>
                  )}
                  <motion.div
                    className={`w-full rounded-t-sm cursor-pointer transition-colors duration-200 ${
                      isHovered
                        ? "bg-gradient-to-t from-of-primary to-of-primary"
                        : h.count > 15
                          ? "bg-gradient-to-t from-red-600 to-red-400"
                          : h.count > 8
                            ? "bg-gradient-to-t from-yellow-600 to-yellow-400"
                            : "bg-gradient-to-t from-teal-600 to-teal-400"
                    }`}
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.5, delay: i * 0.02, ease: "easeOut" }}
                    style={{ minHeight: h.count > 0 ? 4 : 0 }}
                  />
                  {i % 3 === 0 && (
                    <span className="text-[8px] text-foreground-subtle mt-1 whitespace-nowrap">{h.hour}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground mb-2">Quick Navigation</h3>
          {[
            { label: "Anomalies", href: "/dashboard/soulwatch/anomalies", count: `${openAnomalyCount} open`, color: "text-red-400" },
            { label: "Detection Rules", href: "/dashboard/soulwatch/rules", count: `${rulesFiring > 0 ? rulesFiring : 6} active`, color: "text-of-primary" },
            { label: "Quarantines", href: "/dashboard/soulwatch/quarantines", count: `${quarantineCount} active`, color: "text-orange-400" },
            { label: "Integrations", href: "/dashboard/soulwatch/integrations", count: "4 connected", color: "text-of-primary" },
            { label: "Reports", href: "/dashboard/soulwatch/reports", count: "3 frameworks", color: "text-blue-400" },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={item.href}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-of-surface-container-high/50 border border-white/5 hover:border-white/10 hover:bg-of-surface-container-high transition-all duration-200 group"
              >
                <span className="text-sm text-foreground-muted group-hover:text-foreground transition-colors">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${item.color}`}>{item.count}</span>
                  <svg className="w-4 h-4 text-foreground-subtle group-hover:text-foreground-muted transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Agent Risk Table */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-foreground">Agent Risk Scores (Top 10)</h3>
          <Link href="/dashboard/soulwatch/anomalies" className="text-xs text-of-primary hover:text-of-primary-fixed transition-colors">
            View all agents
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Risk Score</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Trend</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Evaluations</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Anomalies</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {topAgents.sort((a, b) => b.riskScore - a.riskScore).map((agent, i) => (
                <motion.tr
                  key={agent.persona}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-foreground font-medium">{agent.persona}</span>
                      <p className="text-[10px] text-foreground-subtle font-mono mt-0.5">{agent.soulkey}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-[120px]">
                      <span className={`text-sm font-bold font-mono ${
                        agent.riskScore >= 80 ? "text-red-400" :
                        agent.riskScore >= 50 ? "text-yellow-400" :
                        "text-green-400"
                      }`}>{agent.riskScore}</span>
                      <div className="flex-1 h-1.5 bg-of-surface-container-high rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${riskBarColor(agent.riskScore)}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${agent.riskScore}%` }}
                          transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {agent.trend === "up" && (
                      <span className="text-red-400 text-xs flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                        </svg>
                        Rising
                      </span>
                    )}
                    {agent.trend === "down" && (
                      <span className="text-green-400 text-xs flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
                        </svg>
                        Falling
                      </span>
                    )}
                    {agent.trend === "stable" && (
                      <span className="text-foreground-subtle text-xs flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                        </svg>
                        Stable
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground-muted font-mono text-xs">{agent.evaluations.toLocaleString()}</td>
                  <td className="px-4 py-3 text-foreground-muted font-mono text-xs">{agent.anomalies}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      agent.status === "critical" ? "bg-red-500/15 text-red-400 border border-red-500/20" :
                      agent.status === "warning" ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20" :
                      "bg-green-500/15 text-green-400 border border-green-500/20"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        agent.status === "critical" ? "bg-red-400" :
                        agent.status === "warning" ? "bg-yellow-400" :
                        "bg-green-400"
                      } ${agent.status === "critical" ? "animate-pulse" : ""}`} />
                      {agent.status === "critical" ? "Critical" : agent.status === "warning" ? "Warning" : "Healthy"}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Detections Feed */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-foreground">Recent Detections (Last 10)</h3>
          <Link href="/dashboard/soulwatch/rules" className="text-xs text-of-primary hover:text-of-primary-fixed transition-colors">
            View all rules
          </Link>
        </div>
        <div className="divide-y divide-white/5">
          {recentDetections.map((det, i) => (
            <motion.div
              key={det.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${severityColor[det.severity] || severityColor["Medium"]}`}>
                  {det.severity}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{det.rule}</p>
                  <p className="text-xs text-foreground-subtle mt-0.5">{det.agent}</p>
                </div>
              </div>
              <span className="text-xs text-foreground-subtle font-mono shrink-0 ml-4">{det.ago}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
