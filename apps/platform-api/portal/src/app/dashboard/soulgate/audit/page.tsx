"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWidgetData } from "@/lib/useWidgetData";

/** SoulGate audit log -- HTTP request/response trace viewer. Fetches live data from SoulGate backend. */

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

interface AuditResponse {
  entries?: AuditEntry[];
  source?: string;
}

/** Normalize raw SoulGate audit log entries into the AuditEntry shape */
function normalizeEntry(raw: Record<string, unknown>, index: number): AuditEntry {
  const ts = (raw.timestamp as string) || new Date().toISOString();
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const ago =
    diffMin < 1
      ? "just now"
      : diffMin < 60
        ? `${diffMin}m ago`
        : diffMin < 1440
          ? `${Math.floor(diffMin / 60)}h ago`
          : `${Math.floor(diffMin / 1440)}d ago`;

  return {
    id: (raw.id as string) || (raw.request_id as string) || `audit-${index}`,
    method: ((raw.method as string) || "GET").toUpperCase() as AuditEntry["method"],
    path: (raw.path as string) || (raw.url as string) || "/unknown",
    statusCode: (raw.status_code as number) || (raw.statusCode as number) || (raw.status as number) || 200,
    blocked: !!(raw.blocked ?? raw.is_blocked ?? false),
    blockReason: (raw.block_reason as string) || (raw.blockReason as string) || null,
    sourceIp: (raw.source_ip as string) || (raw.sourceIp as string) || (raw.client_ip as string) || "0.0.0.0",
    agentSoulkey: (raw.agent_soulkey as string) || (raw.soulkey as string) || "-",
    agentPersona: (raw.agent_persona as string) || (raw.persona as string) || (raw.agent as string) || "-",
    upstream: (raw.upstream as string) || (raw.target as string) || "-",
    latency: (raw.latency as number) || (raw.latency_ms as number) || (raw.duration_ms as number) || 0,
    timestamp: ts,
    ago,
    requestSize: (raw.request_size as string) || (raw.req_size as string) || "-",
    responseSize: (raw.response_size as string) || (raw.res_size as string) || "-",
    threatFlags: (raw.threat_flags as string[]) || (raw.threatFlags as string[]) || [],
  };
}

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
  const { data, loading, error } = useWidgetData<AuditResponse>({
    endpoint: "/api/soulgate/audit?limit=100",
    refreshInterval: 15000,
  });

  const rawEntries = data?.entries ?? [];
  const entries: AuditEntry[] = rawEntries.map((raw, i) =>
    typeof raw === "object" && raw !== null && "id" in raw && "method" in raw && "path" in raw
      ? (raw as AuditEntry)
      : normalizeEntry(raw as Record<string, unknown>, i)
  );

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
  const avgLatency = totalRequests > 0 ? Math.round(entries.reduce((sum, e) => sum + e.latency, 0) / totalRequests) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Audit Log</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20">
            {blockedCount} blocked
          </span>
          {data?.source === "unavailable" && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
              SoulGate offline
            </span>
          )}
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
          { label: "Total Requests", value: loading ? "-" : totalRequests.toLocaleString(), color: "text-foreground" },
          { label: "Blocked", value: loading ? "-" : blockedCount.toLocaleString(), color: "text-red-400" },
          { label: "Block Rate", value: loading ? "-" : `${blockRate}%`, color: "text-amber-400" },
          { label: "Avg Latency", value: loading ? "-" : `${avgLatency}ms`, color: "text-of-primary" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-4 text-center"
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
          className="px-3 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-xs text-foreground focus:outline-none focus:border-of-primary/50 transition-all"
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
          className="px-3 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-xs text-foreground focus:outline-none focus:border-of-primary/50 transition-all"
        >
          <option value="all">All Requests</option>
          <option value="blocked">Blocked Only</option>
          <option value="allowed">Allowed Only</option>
        </select>
        <select
          value={filterReason}
          onChange={(e) => setFilterReason(e.target.value)}
          className="px-3 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-xs text-foreground focus:outline-none focus:border-of-primary/50 transition-all"
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

      {/* Loading state */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-6 text-center">
          <p className="text-foreground-muted text-sm">Failed to load audit log</p>
          <p className="text-foreground-subtle text-xs mt-1">{error}</p>
        </div>
      )}

      {/* Audit Table */}
      {!loading && (
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
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
                                <div className="px-4 py-5 bg-of-surface-container-high/50 space-y-4">
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* Request Info */}
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Request Info</h4>
                                      <div className="bg-of-surface-container-lowest rounded-lg p-3 border border-white/5 space-y-2">
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
                                      <div className="bg-of-surface-container-lowest rounded-lg p-3 border border-white/5 space-y-2">
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
                                      <div className="bg-of-surface-container-lowest rounded-lg p-3 border border-white/5">
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
                      <p className="text-foreground-muted text-sm">{entries.length === 0 ? "No audit entries yet" : "No entries match your filters"}</p>
                      <p className="text-foreground-subtle text-xs mt-1">{entries.length === 0 ? "Audit entries will appear here once SoulGate processes requests" : "Try adjusting the filter criteria"}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
