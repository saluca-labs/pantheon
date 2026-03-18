"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Anomaly {
  id: string;
  type: "behavioral_drift" | "privilege_escalation" | "data_exfiltration" | "temporal_anomaly" | "rate_anomaly" | "cross_tenant";
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  agent: string;
  soulkey: string;
  timestamp: string;
  ago: string;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  riskScore: number;
  baselineValue: string;
  observedValue: string;
  evidence: Record<string, unknown>;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  behavioral_drift: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  privilege_escalation: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
    </svg>
  ),
  data_exfiltration: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  temporal_anomaly: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  rate_anomaly: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  cross_tenant: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
};

const INITIAL_ANOMALIES: Anomaly[] = [
  {
    id: "anom_001", type: "cross_tenant", description: "Cross-tenant resource access attempt - tried to read globex-inc/customer-data", severity: "Critical",
    agent: "test-agent-beta", soulkey: "sk_f2b9...", timestamp: "2026-03-18 03:14:22", ago: "12 min ago", status: "open", riskScore: 98,
    baselineValue: "0 cross-tenant attempts", observedValue: "1 cross-tenant attempt", evidence: { resource_path: "globex-inc/customer-data/exports", source_tenant: "acme-corp", agent_soulkey: "sk_f2b93a5c..." },
  },
  {
    id: "anom_002", type: "rate_anomaly", description: "Excessive permission requests - 67 evaluations in 5 minutes", severity: "High",
    agent: "compliance-checker", soulkey: "sk_8a1c...", timestamp: "2026-03-18 03:08:45", ago: "18 min ago", status: "open", riskScore: 92,
    baselineValue: "8 evals/5min", observedValue: "67 evals/5min", evidence: { action: "evaluate", resource: "compliance-reports/*", window: "5m", count: 67 },
  },
  {
    id: "anom_003", type: "temporal_anomaly", description: "Off-hours activity - analytics queries running at 02:55 UTC", severity: "Medium",
    agent: "analytics-agent", soulkey: "sk_a3f1...", timestamp: "2026-03-18 02:55:10", ago: "31 min ago", status: "open", riskScore: 45,
    baselineValue: "Active 09:00-18:00 UTC", observedValue: "Active at 02:55 UTC", evidence: { action: "read", resource: "customer-data/reports", business_hours: "09:00-18:00" },
  },
  {
    id: "anom_004", type: "data_exfiltration", description: "Unusual data volume - 3.2x baseline transfer rate", severity: "Medium",
    agent: "data-pipeline", soulkey: "sk_5c8e...", timestamp: "2026-03-18 02:41:33", ago: "45 min ago", status: "acknowledged", riskScore: 67,
    baselineValue: "2.4 GB/hour", observedValue: "7.7 GB/hour (3.2x)", evidence: { baseline_rate: "2.4 GB/hr", observed_rate: "7.7 GB/hr", multiplier: 3.2, resource: "data-lake/raw/events" },
  },
  {
    id: "anom_005", type: "privilege_escalation", description: "Rapid key rotation - 4 rotations in 24 hours", severity: "High",
    agent: "compliance-checker", soulkey: "sk_8a1c...", timestamp: "2026-03-18 02:30:00", ago: "56 min ago", status: "open", riskScore: 78,
    baselineValue: "1 rotation/week", observedValue: "4 rotations/24h", evidence: { event_type: "KEY_EVENT", action: "key_rotate", count: 4, window: "24h" },
  },
  {
    id: "anom_006", type: "rate_anomaly", description: "Failed auth spike - 28 denied requests in 5 minutes", severity: "High",
    agent: "test-agent-beta", soulkey: "sk_f2b9...", timestamp: "2026-03-18 02:12:18", ago: "1 hour ago", status: "open", riskScore: 85,
    baselineValue: "2 denials/5min", observedValue: "28 denials/5min", evidence: { event_type: "EVALUATE", result: "DENY", count: 28, window: "5m" },
  },
  {
    id: "anom_007", type: "temporal_anomaly", description: "Off-hours data pipeline activity at 01:48 UTC", severity: "Medium",
    agent: "data-pipeline", soulkey: "sk_5c8e...", timestamp: "2026-03-18 01:48:55", ago: "1.4 hours ago", status: "resolved", riskScore: 32,
    baselineValue: "Active 06:00-22:00 UTC", observedValue: "Active at 01:48 UTC", evidence: { action: "execute", resource: "etl/daily-ingest", business_hours: "06:00-22:00" },
  },
  {
    id: "anom_008", type: "rate_anomaly", description: "Excessive permission requests - analytics agent burst", severity: "High",
    agent: "analytics-agent", soulkey: "sk_a3f1...", timestamp: "2026-03-18 01:22:40", ago: "1.9 hours ago", status: "false_positive", riskScore: 52,
    baselineValue: "12 evals/5min", observedValue: "55 evals/5min", evidence: { action: "evaluate", resource: "reports/*", window: "5m", count: 55, note: "Batch report generation" },
  },
  {
    id: "anom_009", type: "behavioral_drift", description: "Report generator accessing unusual resources", severity: "Medium",
    agent: "report-generator", soulkey: "sk_c3e8...", timestamp: "2026-03-18 00:55:12", ago: "2.3 hours ago", status: "open", riskScore: 41,
    baselineValue: "reports/*, analytics/*", observedValue: "config/secrets, admin/*", evidence: { baseline_resources: ["reports/*", "analytics/*"], observed_resources: ["config/secrets", "admin/users"] },
  },
  {
    id: "anom_010", type: "temporal_anomaly", description: "Cost optimizer running weekend batch at midnight", severity: "Low",
    agent: "cost-optimizer", soulkey: "sk_2f9a...", timestamp: "2026-03-18 00:30:05", ago: "2.8 hours ago", status: "resolved", riskScore: 18,
    baselineValue: "Active weekdays 08:00-20:00", observedValue: "Active Sunday 00:30", evidence: { action: "read", resource: "billing/cost-data", day: "Sunday" },
  },
];

const severityColor: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 border border-red-500/20",
  High: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  Medium: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  Low: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
};

const statusColor: Record<string, string> = {
  open: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  acknowledged: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  resolved: "bg-green-500/15 text-green-400 border border-green-500/20",
  false_positive: "bg-gray-500/15 text-gray-400 border border-gray-500/20",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const statusLabel: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  false_positive: "False Positive",
};

const typeLabel: Record<string, string> = {
  behavioral_drift: "Behavioral Drift",
  privilege_escalation: "Privilege Escalation",
  data_exfiltration: "Data Exfiltration",
  temporal_anomaly: "Temporal Anomaly",
  rate_anomaly: "Rate Anomaly",
  cross_tenant: "Cross-Tenant",
};

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState(INITIAL_ANOMALIES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = anomalies.filter((a) => {
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkAction = (newStatus: Anomaly["status"]) => {
    setAnomalies((prev) =>
      prev.map((a) => (selectedIds.has(a.id) ? { ...a, status: newStatus } : a))
    );
    setSelectedIds(new Set());
  };

  const updateStatus = (id: string, newStatus: Anomaly["status"]) => {
    setAnomalies((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Anomalies</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20">
            {anomalies.filter((a) => a.status === "open").length} open
          </span>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-muted">{selectedIds.size} selected</span>
            <button onClick={() => bulkAction("acknowledged")} className="px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs font-medium transition-all">
              Acknowledge
            </button>
            <button onClick={() => bulkAction("resolved")} className="px-3 py-1.5 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs font-medium transition-all">
              Resolve
            </button>
            <button onClick={() => bulkAction("false_positive")} className="px-3 py-1.5 rounded-lg border border-gray-500/30 text-gray-400 hover:bg-gray-500/10 text-xs font-medium transition-all">
              False Positive
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all"
        >
          <option value="all">All Severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all"
        >
          <option value="all">All Types</option>
          <option value="behavioral_drift">Behavioral Drift</option>
          <option value="privilege_escalation">Privilege Escalation</option>
          <option value="data_exfiltration">Data Exfiltration</option>
          <option value="temporal_anomaly">Temporal Anomaly</option>
          <option value="rate_anomaly">Rate Anomaly</option>
          <option value="cross_tenant">Cross-Tenant</option>
        </select>
        <span className="text-xs text-foreground-subtle self-center ml-auto">
          Showing {filtered.length} of {anomalies.length} anomalies
        </span>
      </div>

      {/* Anomaly List */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="w-10 px-3 py-3"></th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Description</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((anomaly) => (
                  <React.Fragment key={anomaly.id}>
                    <motion.tr
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setExpandedId(expandedId === anomaly.id ? null : anomaly.id)}
                      className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all duration-200"
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(anomaly.id)}
                          onChange={() => toggleSelect(anomaly.id)}
                          className="rounded border-white/20 bg-navy-800 text-gold-500 focus:ring-gold-500/30 focus:ring-offset-0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            anomaly.severity === "Critical" ? "bg-red-500/10 text-red-400" :
                            anomaly.severity === "High" ? "bg-orange-500/10 text-orange-400" :
                            anomaly.severity === "Medium" ? "bg-yellow-500/10 text-yellow-400" :
                            "bg-blue-500/10 text-blue-400"
                          }`}>
                            {TYPE_ICONS[anomaly.type]}
                          </div>
                          <span className="text-xs text-foreground-muted">{typeLabel[anomaly.type]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground text-xs max-w-[300px] truncate">{anomaly.description}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${severityColor[anomaly.severity]}`}>
                          {anomaly.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground-muted text-xs">{anomaly.agent}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted text-xs whitespace-nowrap">{anomaly.ago}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={anomaly.status}
                          onChange={(e) => updateStatus(anomaly.id, e.target.value as Anomaly["status"])}
                          className={`px-2 py-1 rounded-full text-[10px] font-medium border focus:outline-none transition-all cursor-pointer ${statusColor[anomaly.status]} bg-transparent`}
                        >
                          <option value="open">Open</option>
                          <option value="acknowledged">Acknowledged</option>
                          <option value="resolved">Resolved</option>
                          <option value="false_positive">False Positive</option>
                        </select>
                      </td>
                    </motion.tr>

                    {/* Expanded Detail */}
                    <AnimatePresence>
                      {expandedId === anomaly.id && (
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
                                  {/* Risk Score */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Risk Score</h4>
                                    <div className="bg-navy-950 rounded-lg p-3 border border-white/5">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-foreground-subtle">Score</span>
                                        <span className={`text-lg font-bold font-mono ${
                                          anomaly.riskScore >= 80 ? "text-red-400" :
                                          anomaly.riskScore >= 50 ? "text-yellow-400" :
                                          "text-green-400"
                                        }`}>{anomaly.riskScore}/100</span>
                                      </div>
                                      <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                                        <motion.div
                                          className={`h-full rounded-full ${
                                            anomaly.riskScore >= 80 ? "bg-gradient-to-r from-red-600 to-red-400" :
                                            anomaly.riskScore >= 50 ? "bg-gradient-to-r from-yellow-600 to-yellow-400" :
                                            "bg-gradient-to-r from-green-600 to-green-400"
                                          }`}
                                          initial={{ width: 0 }}
                                          animate={{ width: `${anomaly.riskScore}%` }}
                                          transition={{ duration: 0.5, ease: "easeOut" }}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Baseline vs Observed */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Baseline vs Observed</h4>
                                    <div className="bg-navy-950 rounded-lg p-3 border border-white/5 space-y-2">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Baseline</span>
                                        <span className="text-green-400 font-mono">{anomaly.baselineValue}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-foreground-subtle">Observed</span>
                                        <span className="text-red-400 font-mono">{anomaly.observedValue}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Evidence JSON */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Evidence</h4>
                                    <pre className="font-mono text-xs leading-relaxed text-teal-300 bg-navy-950 rounded-lg p-3 border border-white/5 overflow-x-auto whitespace-pre max-h-32">
                                      {JSON.stringify(anomaly.evidence, null, 2)}
                                    </pre>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                  <span className="text-[10px] text-foreground-subtle font-mono">ID: {anomaly.id}</span>
                                  <span className="text-[10px] text-foreground-subtle">|</span>
                                  <span className="text-[10px] text-foreground-subtle font-mono">{anomaly.soulkey}</span>
                                  <span className="text-[10px] text-foreground-subtle">|</span>
                                  <span className="text-[10px] text-foreground-subtle font-mono">{anomaly.timestamp}</span>
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
                    <p className="text-foreground-muted text-sm">No anomalies match your filters</p>
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
