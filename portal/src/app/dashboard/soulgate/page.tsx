"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useWidgetData } from "@/lib/useWidgetData";

/** SoulGate overview -- API gateway metrics, routing rules, and rate limit summary. Fetches live data with mock fallback. */

/* ---- Types ---- */

interface GateMetrics {
  requests_per_min?: number;
  blocked_24h?: number;
  active_upstreams?: number;
  circuit_breakers_open?: number;
  hourly_requests?: { hour: string; total: number; blocked: number }[];
  block_reasons?: { reason: string; count: number; pct: number }[];
}

interface Upstream {
  id?: string;
  name: string;
  status: "healthy" | "degraded" | "down";
  base_url?: string;
  timeout_ms?: number;
  circuit_breaker_enabled?: boolean;
  latency?: number;
  circuitBreaker?: "closed" | "open" | "half_open";
}

interface BlockEntry {
  id?: string;
  persona_id?: string;
  agent?: string;
  soulkey_id?: string;
  soulkey?: string;
  block_reason?: string;
  reason?: string;
  blocked_count?: number;
  blocked?: number;
  created_at?: string;
  lastBlocked?: string;
}

interface SoulGateDashboard {
  metrics: GateMetrics | null;
  upstreams: Upstream[] | null;
  blocks: BlockEntry[] | null;
  fetched_at: string;
}

/* ---- Mock Fallback Data ---- */

const MOCK_HOURLY_REQUESTS = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  total: Math.floor(Math.random() * 8000) + 2000 + (i >= 9 && i <= 17 ? 5000 : 0),
  blocked: Math.floor(Math.random() * 400) + 50 + (i >= 2 && i <= 5 ? 200 : 0),
}));

const MOCK_BLOCK_REASONS = [
  { reason: "Rate Limit", count: 1842, color: "bg-amber-500", pct: 42 },
  { reason: "Token Invalid", count: 876, color: "bg-red-500", pct: 20 },
  { reason: "Injection Detected", count: 657, color: "bg-purple-500", pct: 15 },
  { reason: "Geo Blocked", count: 548, color: "bg-blue-500", pct: 13 },
  { reason: "IP Blocked", count: 438, color: "bg-orange-500", pct: 10 },
];

const MOCK_TOP_BLOCKED_AGENTS = [
  { agent: "agent-008", soulkey: "sk_demo_008", blocked: 312, reason: "rate_limit", lastBlocked: "2 min ago" },
  { agent: "agent-011", soulkey: "sk_demo_011", blocked: 287, reason: "token_invalid", lastBlocked: "5 min ago" },
  { agent: "agent-002", soulkey: "sk_demo_002", blocked: 156, reason: "rate_limit", lastBlocked: "12 min ago" },
  { agent: "agent-012", soulkey: "sk_demo_012", blocked: 134, reason: "injection", lastBlocked: "18 min ago" },
  { agent: "agent-004", soulkey: "sk_demo_004", blocked: 89, reason: "geo_block", lastBlocked: "31 min ago" },
];

const MOCK_UPSTREAMS: Upstream[] = [
  { name: "upstream-alpha", status: "healthy", latency: 42, circuitBreaker: "closed" },
  { name: "upstream-bravo", status: "healthy", latency: 18, circuitBreaker: "closed" },
  { name: "upstream-charlie", status: "degraded", latency: 340, circuitBreaker: "closed" },
  { name: "upstream-delta", status: "healthy", latency: 128, circuitBreaker: "closed" },
  { name: "upstream-echo", status: "down", latency: 0, circuitBreaker: "open" },
  { name: "upstream-foxtrot", status: "healthy", latency: 65, circuitBreaker: "closed" },
];

/* ---- Helpers ---- */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = (mins / 60).toFixed(1);
  return `${hrs} hours ago`;
}

const REASON_COLOR_MAP: Record<string, string> = {
  "Rate Limit": "bg-amber-500",
  "rate_limit": "bg-amber-500",
  "Token Invalid": "bg-red-500",
  "token_invalid": "bg-red-500",
  "Injection Detected": "bg-purple-500",
  "injection": "bg-purple-500",
  "Geo Blocked": "bg-blue-500",
  "geo_block": "bg-blue-500",
  "IP Blocked": "bg-orange-500",
  "ip_block": "bg-orange-500",
  "Scope Violation": "bg-purple-500",
  "scope_violation": "bg-purple-500",
  "No Active Session": "bg-red-500",
  "no_session": "bg-red-500",
  "Key Suspended": "bg-orange-500",
  "key_suspended": "bg-orange-500",
  "Policy Denied": "bg-blue-500",
  "policy_denied": "bg-blue-500",
};

const reasonBadge: Record<string, string> = {
  rate_limit: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  token_invalid: "bg-red-500/15 text-red-400 border border-red-500/20",
  injection: "bg-purple-500/15 text-purple-400 border border-purple-500/20",
  geo_block: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  ip_block: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  scope_violation: "bg-purple-500/15 text-purple-400 border border-purple-500/20",
  no_session: "bg-red-500/15 text-red-400 border border-red-500/20",
  key_suspended: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  policy_denied: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  unknown: "bg-gray-500/15 text-gray-400 border border-gray-500/20",
};

const reasonLabel: Record<string, string> = {
  rate_limit: "Rate Limit",
  token_invalid: "Token Invalid",
  injection: "Injection",
  geo_block: "Geo Block",
  ip_block: "IP Block",
  scope_violation: "Scope Violation",
  no_session: "No Session",
  key_suspended: "Key Suspended",
  policy_denied: "Policy Denied",
  unknown: "Unknown",
};

const statusColor: Record<string, string> = {
  healthy: "text-green-400",
  degraded: "text-yellow-400",
  down: "text-red-400",
};

const statusBg: Record<string, string> = {
  healthy: "bg-green-500/15 border-green-500/20",
  degraded: "bg-yellow-500/15 border-yellow-500/20",
  down: "bg-red-500/15 border-red-500/20",
};

const cbColor: Record<string, string> = {
  closed: "text-green-400",
  open: "text-blue-400",
  half_open: "text-yellow-400",
};

function AnimatedCount({ target, className, suffix = "" }: { target: number; className?: string; suffix?: string }) {
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

  return <span className={className}>{count.toLocaleString()}{suffix}</span>;
}

export default function SoulGateDashboardPage() {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* ---- Live data fetch ---- */
  const { data: dashData, loading } = useWidgetData<SoulGateDashboard>({
    endpoint: "/api/soulgate/dashboard",
    refreshInterval: 30000,
  });

  /* ---- Derived state: live data or mock fallback ---- */
  const isLive = dashData !== null && (
    (dashData.metrics !== null) ||
    (dashData.upstreams && dashData.upstreams.length > 0) ||
    (dashData.blocks && dashData.blocks.length > 0)
  );

  const hourlyRequests = useMemo(() => {
    if (isLive && dashData?.metrics?.hourly_requests && dashData.metrics.hourly_requests.length > 0) {
      return dashData.metrics.hourly_requests;
    }
    return MOCK_HOURLY_REQUESTS;
  }, [isLive, dashData]);

  const blockReasons = useMemo(() => {
    if (isLive && dashData?.metrics?.block_reasons && dashData.metrics.block_reasons.length > 0) {
      return dashData.metrics.block_reasons.map((r) => ({
        ...r,
        color: REASON_COLOR_MAP[r.reason] || "bg-gray-500",
      }));
    }
    return MOCK_BLOCK_REASONS;
  }, [isLive, dashData]);

  const topBlockedAgents = useMemo(() => {
    if (isLive && dashData?.blocks && dashData.blocks.length > 0) {
      return dashData.blocks.map((b) => ({
        agent: b.agent || b.persona_id || "unknown",
        soulkey: b.soulkey || (b.soulkey_id ? `${b.soulkey_id.substring(0, 8)}...` : "unknown"),
        blocked: b.blocked_count || b.blocked || 0,
        reason: b.block_reason || b.reason || "unknown",
        lastBlocked: b.lastBlocked || (b.created_at ? timeAgo(b.created_at) : "unknown"),
      }));
    }
    return MOCK_TOP_BLOCKED_AGENTS;
  }, [isLive, dashData]);

  const upstreams = useMemo(() => {
    if (isLive && dashData?.upstreams && dashData.upstreams.length > 0) {
      return dashData.upstreams.map((u) => ({
        name: u.name,
        status: u.status || "healthy" as const,
        latency: u.latency ?? 0,
        circuitBreaker: u.circuitBreaker || (u.circuit_breaker_enabled ? "closed" : "closed") as "closed" | "open" | "half_open",
      }));
    }
    return MOCK_UPSTREAMS;
  }, [isLive, dashData]);

  const requestsPerMin = dashData?.metrics?.requests_per_min ?? 2847;
  const blocked24h = dashData?.metrics?.blocked_24h ?? 4361;
  const activeUpstreams = dashData?.metrics?.active_upstreams ?? upstreams.filter((u) => u.status !== "down").length;
  const cbOpen = dashData?.metrics?.circuit_breakers_open ?? upstreams.filter((u) => u.circuitBreaker === "open").length;

  const maxRequests = Math.max(...hourlyRequests.map((h) => h.total), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">SoulGate</h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium text-green-400">
              {loading ? "Connecting..." : isLive ? "Live" : "Gateway active"}
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
            href="/dashboard/soulgate/audit"
            className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-white/10 transition-all duration-200"
          >
            View Audit Log
          </Link>
          <Link
            href="/dashboard/soulgate/upstreams"
            className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors"
          >
            Manage Upstreams
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Requests / Min", value: requestsPerMin, color: "text-amber-400", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          )},
          { label: "Blocked (24h)", value: blocked24h, color: "text-red-400", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          )},
          { label: "Active Upstreams", value: activeUpstreams, color: "text-of-primary", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
            </svg>
          )},
          { label: "Circuit Breakers Open", value: cbOpen, color: "text-blue-400", icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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
        {/* Request Volume Chart */}
        <div className="lg:col-span-2 bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Request Volume (Last 24 Hours)</h3>
          <div className="flex items-end gap-1 h-48">
            {!mounted ? <div className="w-full h-full animate-pulse bg-white/5 rounded" /> : hourlyRequests.map((h, i) => {
              const height = maxRequests > 0 ? (h.total / maxRequests) * 100 : 0;
              const blockedHeight = maxRequests > 0 ? (h.blocked / maxRequests) * 100 : 0;
              const isHovered = hoveredBar === i;
              return (
                <div
                  key={h.hour}
                  className="flex-1 flex flex-col items-center gap-0 group relative"
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -top-10 px-2 py-1 rounded-md bg-of-surface-container-highest border border-white/10 text-[10px] text-foreground font-mono shadow-lg whitespace-nowrap z-10"
                    >
                      {h.total.toLocaleString()} req / {h.blocked} blocked
                    </motion.div>
                  )}
                  <div className="w-full flex flex-col items-stretch" style={{ height: `${height}%`, minHeight: 4 }}>
                    <motion.div
                      className={`w-full rounded-t-sm cursor-pointer transition-colors duration-200 ${
                        isHovered
                          ? "bg-gradient-to-t from-amber-600 to-amber-400"
                          : "bg-gradient-to-t from-amber-600/60 to-amber-400/60"
                      }`}
                      initial={{ height: 0 }}
                      animate={{ height: `${((height - blockedHeight) / height) * 100}%` }}
                      transition={{ duration: 0.5, delay: i * 0.02, ease: "easeOut" }}
                      style={{ minHeight: 2 }}
                    />
                    <motion.div
                      className="w-full bg-gradient-to-t from-red-600 to-red-400"
                      initial={{ height: 0 }}
                      animate={{ height: `${(blockedHeight / height) * 100}%` }}
                      transition={{ duration: 0.5, delay: i * 0.02 + 0.1, ease: "easeOut" }}
                      style={{ minHeight: h.blocked > 0 ? 2 : 0 }}
                    />
                  </div>
                  {i % 3 === 0 && (
                    <span className="text-[8px] text-foreground-subtle mt-1 whitespace-nowrap">{h.hour}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-sm bg-amber-500/60" />
              <span className="text-[10px] text-foreground-subtle">Allowed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-sm bg-red-500" />
              <span className="text-[10px] text-foreground-subtle">Blocked</span>
            </div>
          </div>
        </div>

        {/* Block Reasons Breakdown */}
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Block Reasons (24h)</h3>
          <div className="space-y-3">
            {blockReasons.map((item, i) => (
              <motion.div
                key={item.reason}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted">{item.reason}</span>
                  <span className="text-foreground font-mono">{item.count.toLocaleString()} ({item.pct}%)</span>
                </div>
                <div className="h-2 bg-of-surface-container-high rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${item.color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 text-center">
            <span className="text-xs text-foreground-subtle">
              Total blocked: <span className="text-foreground font-mono">{blocked24h.toLocaleString()}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Top Blocked Agents */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-foreground">Top Blocked Agents (24h)</h3>
          <Link href="/dashboard/soulgate/audit" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            View full audit log
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Blocked</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Reason</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Last Blocked</th>
              </tr>
            </thead>
            <tbody>
              {topBlockedAgents.map((agent, i) => (
                <motion.tr
                  key={agent.agent + i}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-foreground font-medium">{agent.agent}</span>
                      <p className="text-[10px] text-foreground-subtle font-mono mt-0.5">{agent.soulkey}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-red-400 font-mono text-xs font-bold">{agent.blocked}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${reasonBadge[agent.reason] || "bg-gray-500/15 text-gray-400 border border-gray-500/20"}`}>
                      {reasonLabel[agent.reason] || agent.reason}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground-muted text-xs">{agent.lastBlocked}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upstream Health Grid */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Upstream Health</h3>
          <Link href="/dashboard/soulgate/upstreams" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            Manage upstreams
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {upstreams.map((upstream, i) => (
            <motion.div
              key={upstream.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`p-4 rounded-lg border ${statusBg[upstream.status]} transition-all duration-200 hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{upstream.name}</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBg[upstream.status]} ${statusColor[upstream.status]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    upstream.status === "healthy" ? "bg-green-400" :
                    upstream.status === "degraded" ? "bg-yellow-400" : "bg-red-400"
                  } ${upstream.status === "healthy" ? "animate-pulse" : ""}`} />
                  {upstream.status === "healthy" ? "Healthy" : upstream.status === "degraded" ? "Degraded" : "Down"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-subtle">Latency</span>
                <span className={`font-mono ${
                  (upstream.latency ?? 0) === 0 ? "text-red-400" :
                  (upstream.latency ?? 0) > 200 ? "text-yellow-400" : "text-foreground-muted"
                }`}>
                  {(upstream.latency ?? 0) === 0 ? "N/A" : `${upstream.latency}ms`}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-foreground-subtle">Circuit Breaker</span>
                <span className={`font-mono capitalize ${cbColor[upstream.circuitBreaker ?? "closed"]}`}>
                  {upstream.circuitBreaker ?? "closed"}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground mb-2">Quick Navigation</h3>
        {[
          { label: "Upstreams", href: "/dashboard/soulgate/upstreams", count: `${upstreams.length} registered`, color: "text-of-primary" },
          { label: "Rate Limits", href: "/dashboard/soulgate/rate-limits", count: `${activeUpstreams} active`, color: "text-amber-400" },
          { label: "Access Rules", href: "/dashboard/soulgate/access", count: `${blockReasons.length} rule types`, color: "text-blue-400" },
          { label: "API Keys", href: "/dashboard/settings?tab=api-keys", count: `${activeUpstreams} active`, color: "text-of-primary" },
          { label: "Audit Log", href: "/dashboard/soulgate/audit", count: `${blocked24h.toLocaleString()} blocked`, color: "text-red-400" },
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
  );
}
