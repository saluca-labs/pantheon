"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AuditEntry {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  statusCode: number;
  blocked: boolean;
  blockReason: string | null;
  sourceIp: string;
  agentSoulkey: string;
  agentPersona: string;
  upstream: string;
  latency: number;
  timestamp: string;
  ago: string;
  requestSize: string;
  responseSize: string;
  threatFlags: string[];
}

const INITIAL_ENTRIES: AuditEntry[] = [
  {
    id: "aud_001", method: "POST", path: "/api/v1/analytics/query", statusCode: 429, blocked: true, blockReason: "rate_limit",
    sourceIp: "10.0.1.45", agentSoulkey: "sk_f2b9...", agentPersona: "test-agent-beta", upstream: "analytics-api",
    latency: 2, timestamp: "2026-03-18 03:26:11", ago: "1 min ago", requestSize: "1.2 KB", responseSize: "0.3 KB", threatFlags: [],
  },
  {
    id: "aud_002", method: "GET", path: "/api/v1/users/export", statusCode: 403, blocked: true, blockReason: "token_invalid",
    sourceIp: "45.227.1.100", agentSoulkey: "sk_0000...", agentPersona: "scraper-unknown", upstream: "auth-service",
    latency: 1, timestamp: "2026-03-18 03:25:45", ago: "2 min ago", requestSize: "0.4 KB", responseSize: "0.2 KB", threatFlags: ["no_valid_token"],
  },
  {
    id: "aud_003", method: "POST", path: "/api/v1/completion", statusCode: 403, blocked: true, blockReason: "injection",
    sourceIp: "198.51.100.23", agentSoulkey: "sk_none...", agentPersona: "external-bot", upstream: "ml-inference",
    latency: 3, timestamp: "2026-03-18 03:24:30", ago: "3 min ago", requestSize: "4.8 KB", responseSize: "0.2 KB", threatFlags: ["prompt_injection", "jailbreak_attempt"],
  },
  {
    id: "aud_004", method: "GET", path: "/api/v1/data/reports/q4", statusCode: 200, blocked: false, blockReason: null,
    sourceIp: "10.0.2.18", agentSoulkey: "sk_a3f1...", agentPersona: "analytics-agent", upstream: "analytics-api",
    latency: 45, timestamp: "2026-03-18 03:24:12", ago: "3 min ago", requestSize: "0.5 KB", responseSize: "12.4 KB", threatFlags: [],
  },
  {
    id: "aud_005", method: "PUT", path: "/api/v1/billing/subscription", statusCode: 200, blocked: false, blockReason: null,
    sourceIp: "10.0.1.30", agentSoulkey: "sk_2f9a...", agentPersona: "cost-optimizer", upstream: "billing-api",
    latency: 68, timestamp: "2026-03-18 03:23:55", ago: "4 min ago", requestSize: "0.8 KB", responseSize: "1.2 KB", threatFlags: [],
  },
  {
    id: "aud_006", method: "POST", path: "/api/v1/auth/evaluate", statusCode: 403, blocked: true, blockReason: "geo_block",
    sourceIp: "103.21.244.5", agentSoulkey: "sk_8a1c...", agentPersona: "compliance-checker", upstream: "auth-service",
    latency: 1, timestamp: "2026-03-18 03:22:40", ago: "5 min ago", requestSize: "0.6 KB", responseSize: "0.2 KB", threatFlags: ["restricted_geo"],
  },
  {
    id: "aud_007", method: "GET", path: "/api/v1/ml/predict", statusCode: 200, blocked: false, blockReason: null,
    sourceIp: "10.0.3.12", agentSoulkey: "sk_b7e4...", agentPersona: "monitoring-agent", upstream: "ml-inference",
    latency: 132, timestamp: "2026-03-18 03:22:18", ago: "5 min ago", requestSize: "2.1 KB", responseSize: "8.7 KB", threatFlags: [],
  },
  {
    id: "aud_008", method: "DELETE", path: "/api/v1/data/cache/stale", statusCode: 200, blocked: false, blockReason: null,
    sourceIp: "10.0.2.18", agentSoulkey: "sk_5c8e...", agentPersona: "data-pipeline", upstream: "data-lake",
    latency: 342, timestamp: "2026-03-18 03:21:45", ago: "6 min ago", requestSize: "0.3 KB", responseSize: "0.1 KB", threatFlags: [],
  },
  {
    id: "aud_009", method: "POST", path: "/api/v1/analytics/ingest", statusCode: 429, blocked: true, blockReason: "rate_limit",
    sourceIp: "10.0.2.18", agentSoulkey: "sk_5c8e...", agentPersona: "data-pipeline", upstream: "analytics-api",
    latency: 1, timestamp: "2026-03-18 03:20:30", ago: "7 min ago", requestSize: "15.2 KB", responseSize: "0.3 KB", threatFlags: [],
  },
  {
    id: "aud_010", method: "GET", path: "/api/v1/notifications/pending", statusCode: 502, blocked: false, blockReason: null,
    sourceIp: "10.0.1.45", agentSoulkey: "sk_f2b9...", agentPersona: "test-agent-beta", upstream: "notification-svc",
    latency: 5001, timestamp: "2026-03-18 03:19:12", ago: "8 min ago", requestSize: "0.4 KB", responseSize: "0 KB", threatFlags: ["upstream_timeout"],
  },
  {
    id: "aud_011", method: "POST", path: "/api/v1/completion", statusCode: 403, blocked: true, blockReason: "ip_block",
    sourceIp: "45.227.12.88", agentSoulkey: "sk_none...", agentPersona: "unknown", upstream: "ml-inference",
    latency: 0, timestamp: "2026-03-18 03:18:50", ago: "9 min ago", requestSize: "3.4 KB", responseSize: "0.2 KB", threatFlags: ["blocked_ip_range"],
  },
  {
    id: "aud_012", method: "GET", path: "/api/v1/data/reports/monthly", statusCode: 200, blocked: false, blockReason: null,
    sourceIp: "10.0.2.22", agentSoulkey: "sk_c3e8...", agentPersona: "report-generator", upstream: "data-lake",
    latency: 289, timestamp: "2026-03-18 03:17:30", ago: "10 min ago", requestSize: "0.6 KB", responseSize: "24.5 KB", threatFlags: [],
  },
];

const methodColor: Record<string, string> = {
  GET: "text-green-400",
  POST: "text-blue-400",
  PUT: "text-amber-400",
  DELETE: "text-red-400",
  PATCH: "text-purple-400",
};

const reasonBadge: Record<string, string> = {
  rate_limit: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  token_invalid: "bg-red-500/15 text-red-400 border border-red-500/20",
  injection: "bg-purple-500/15 text-purple-400 border border-purple-500/20",
  geo_block: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  ip_block: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
};

const reasonLabel: Record<string, string> = {
  rate_limit: "Rate Limit",
  token_invalid: "Token Invalid",
  injection: "Injection",
  geo_block: "Geo Block",
  ip_block: "IP Block",
};

export default function AuditPage() {
  const [entries] = useState(INITIAL_ENTRIES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterBlocked, setFilterBlocked] = useState<string>("all");
  const [filterReason, setFilterReason] = useState<string>("all");

  const filtered = entries.filter((e) => {
    if (filterMethod !== "all" && e.method !== filterMethod) return false;
    if (filterBlocked === "blocked" && !e.blocked) return false;
    if (filterBlocked === "allowed" && e.blocked) return false;
    if (filterReason !== "all" && e.blockReason !== filterReason) return false;
    return true;
  });

  const totalRequests = entries.length;
  const blockedCount = entries.filter((e) => e.blocked).length;
  const blockRate = totalRequests > 0 ? ((blockedCount / totalRequests) * 100).toFixed(1) : "0";
  const avgLatency = Math.round(entries.reduce((sum, e) => sum + e.latency, 0) / totalRequests);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Audit Log</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20">
            {blockedCount} blocked
          </span>
        </div>
        <button
          onClick={() => {
            const csv = "method,path,status,blocked,reason,source_ip,agent,upstream,latency_ms,timestamp\n" +
              filtered.map((e) => `${e.method},${e.path},${e.statusCode},${e.blocked},${e.blockReason || ""},${e.sourceIp},${e.agentPersona},${e.upstream},${e.latency},${e.timestamp}`).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "soulgate-audit.csv";
            a.click();
          }}
          className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-white/10 transition-all duration-200"
        >
          Export CSV
        </button>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Requests", value: totalRequests.toLocaleString(), color: "text-foreground" },
          { label: "Blocked", value: blockedCount.toLocaleString(), color: "text-red-400" },
          { label: "Block Rate", value: `${blockRate}%`, color: "text-amber-400" },
          { label: "Avg Latency", value: `${avgLatency}ms`, color: "text-teal-400" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-4 text-center"
          >
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-medium mb-1">{stat.label}</p>
            <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
          className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all"
        >
          <option value="all">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
        <select
          value={filterBlocked}
          onChange={(e) => setFilterBlocked(e.target.value)}
          className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all"
        >
          <option value="all">All Requests</option>
          <option value="blocked">Blocked Only</option>
          <option value="allowed">Allowed Only</option>
        </select>
        <select
          value={filterReason}
          onChange={(e) => setFilterReason(e.target.value)}
          className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all"
        >
          <option value="all">All Reasons</option>
          <option value="rate_limit">Rate Limit</option>
          <option value="token_invalid">Token Invalid</option>
          <option value="injection">Injection</option>
          <option value="geo_block">Geo Block</option>
          <option value="ip_block">IP Block</option>
        </select>
        <span className="text-xs text-foreground-subtle self-center ml-auto">
          Showing {filtered.length} of {entries.length} entries
        </span>
      </div>

      {/* Audit Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Method</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Path</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Block Reason</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Latency</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((entry) => (
                  <React.Fragment key={entry.id}>
                    <motion.tr
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className={`border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all duration-200 ${
                        entry.blocked ? "bg-red-500/[0.02]" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className={`font-mono text-xs font-bold ${methodColor[entry.method]}`}>{entry.method}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground text-xs font-mono truncate max-w-[250px] block">{entry.path}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-xs font-bold ${
                          entry.statusCode >= 500 ? "text-red-400" :
                          entry.statusCode >= 400 ? "text-amber-400" :
                          "text-green-400"
                        }`}>{entry.statusCode}</span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.blockReason ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${reasonBadge[entry.blockReason]}`}>
                            {reasonLabel[entry.blockReason]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-foreground-subtle">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground-muted text-xs">{entry.agentPersona}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-xs ${
                          entry.latency > 1000 ? "text-red-400" :
                          entry.latency > 200 ? "text-yellow-400" : "text-foreground-muted"
                        }`}>{entry.latency}ms</span>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted text-xs whitespace-nowrap">{entry.ago}</td>
                    </motion.tr>

                    {/* Expanded Detail */}
                    <AnimatePresence>
                      {expandedId === entry.id && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-5 bg-navy-800/50 space-y-4">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                  {/* Request Info */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Request Info</h4>
                                    <div className="bg-navy-950 rounded-lg p-3 border border-white/5 space-y-2">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Source IP</span>
                                        <span className="text-foreground font-mono">{entry.sourceIp}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Agent Soulkey</span>
                                        <span className="text-foreground font-mono">{entry.agentSoulkey}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Request Size</span>
                                        <span className="text-foreground-muted font-mono">{entry.requestSize}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Response Size</span>
                                        <span className="text-foreground-muted font-mono">{entry.responseSize}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Upstream Info */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Upstream</h4>
                                    <div className="bg-navy-950 rounded-lg p-3 border border-white/5 space-y-2">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Upstream</span>
                                        <span className="text-foreground font-mono">{entry.upstream}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Latency</span>
                                        <span className={`font-mono ${
                                          entry.latency > 1000 ? "text-red-400" :
                                          entry.latency > 200 ? "text-yellow-400" : "text-green-400"
                                        }`}>{entry.latency}ms</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Status Code</span>
                                        <span className={`font-mono font-bold ${
                                          entry.statusCode >= 500 ? "text-red-400" :
                                          entry.statusCode >= 400 ? "text-amber-400" : "text-green-400"
                                        }`}>{entry.statusCode}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Threat Flags */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Threat Flags</h4>
                                    <div className="bg-navy-950 rounded-lg p-3 border border-white/5">
                                      {entry.threatFlags.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          {entry.threatFlags.map((flag) => (
                                            <span key={flag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20">
                                              {flag.replace(/_/g, " ")}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-foreground-subtle">No threat flags</p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                  <span className="text-[10px] text-foreground-subtle font-mono">ID: {entry.id}</span>
                                  <span className="text-[10px] text-foreground-subtle">|</span>
                                  <span className="text-[10px] text-foreground-subtle font-mono">{entry.timestamp}</span>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-foreground-muted text-sm">No entries match your filters</p>
                    <p className="text-foreground-subtle text-xs mt-1">Try adjusting the filter criteria</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
