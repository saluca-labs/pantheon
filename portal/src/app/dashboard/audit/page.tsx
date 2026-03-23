"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

/** Audit log viewer -- filterable event stream with type and severity columns. Uses hardcoded mock data. */

interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: "EVALUATE" | "KEY_EVENT" | "POLICY" | "ANOMALY";
  agentPrefix: string;
  action: string;
  resource: string;
  result: "ALLOW" | "DENY";
  details: string;
}

const MOCK_EVENTS: AuditEvent[] = [
  { id: "1", timestamp: "2026-03-18 14:34:02", eventType: "EVALUATE", agentPrefix: "sk_7f3a...", action: "read", resource: "customer-data/segment-q1", result: "ALLOW", details: "Standard read evaluation -- policy: analytics-team.yaml" },
  { id: "2", timestamp: "2026-03-18 14:33:45", eventType: "EVALUATE", agentPrefix: "sk_3b7d...", action: "read", resource: "tickets/TKT-8847", result: "ALLOW", details: "Support agent ticket access -- policy: custom.yaml" },
  { id: "3", timestamp: "2026-03-18 14:32:01", eventType: "ANOMALY", agentPrefix: "sk_8a1c...", action: "write", resource: "compliance-reports/q1-draft", result: "DENY", details: "Suspended agent attempted write. Anomaly score: 92. Auto-quarantine triggered." },
  { id: "4", timestamp: "2026-03-18 14:29:55", eventType: "EVALUATE", agentPrefix: "sk_9e2b...", action: "execute", resource: "scan/vulnerability-check", result: "ALLOW", details: "Security scanner routine execution -- policy: default.yaml" },
  { id: "5", timestamp: "2026-03-18 14:28:44", eventType: "KEY_EVENT", agentPrefix: "sk_2e6a...", action: "key_rotate", resource: "soulkeys/sk_2e6a...", result: "ALLOW", details: "Scheduled key rotation completed. New key issued with 90-day TTL." },
  { id: "6", timestamp: "2026-03-18 14:20:11", eventType: "EVALUATE", agentPrefix: "sk_9e2b...", action: "read", resource: "logs/auth-events", result: "ALLOW", details: "Log access for security audit -- policy: admin-agents.yaml" },
  { id: "7", timestamp: "2026-03-18 14:16:40", eventType: "EVALUATE", agentPrefix: "sk_1d4f...", action: "execute", resource: "pipelines/staging-deploy", result: "ALLOW", details: "Deployment pipeline triggered -- policy: custom.yaml" },
  { id: "8", timestamp: "2026-03-18 14:10:33", eventType: "EVALUATE", agentPrefix: "sk_9e2b...", action: "write", resource: "alerts/cve-2026-1234", result: "ALLOW", details: "Security alert creation -- policy: default.yaml" },
  { id: "9", timestamp: "2026-03-18 13:59:30", eventType: "POLICY", agentPrefix: "system", action: "sync", resource: "policies/quarantine-rules.yaml", result: "ALLOW", details: "Git sync completed. 1 file updated from main branch." },
  { id: "10", timestamp: "2026-03-18 13:55:07", eventType: "EVALUATE", agentPrefix: "sk_9e2b...", action: "read", resource: "config/firewall-rules", result: "ALLOW", details: "Config read for vulnerability scan correlation -- policy: admin-agents.yaml" },
  { id: "11", timestamp: "2026-03-18 13:49:10", eventType: "EVALUATE", agentPrefix: "sk_2e6a...", action: "read", resource: "billing/gcp-march", result: "ALLOW", details: "Cost optimizer billing data access -- policy: custom.yaml" },
  { id: "12", timestamp: "2026-03-18 13:45:33", eventType: "ANOMALY", agentPrefix: "sk_5c8e...", action: "read", resource: "data-lake/raw/events", result: "ALLOW", details: "Unusual access volume detected. 3x normal read rate. Monitoring escalated." },
  { id: "13", timestamp: "2026-03-18 13:40:05", eventType: "EVALUATE", agentPrefix: "sk_2e6a...", action: "write", resource: "recommendations/right-size-batch", result: "ALLOW", details: "Cost optimization recommendations generated -- policy: custom.yaml" },
  { id: "14", timestamp: "2026-03-18 13:35:22", eventType: "EVALUATE", agentPrefix: "sk_5c8e...", action: "execute", resource: "etl/daily-ingest", result: "ALLOW", details: "ETL pipeline execution -- policy: custom.yaml, time_window condition met" },
  { id: "15", timestamp: "2026-03-18 13:30:55", eventType: "EVALUATE", agentPrefix: "sk_1d4f...", action: "read", resource: "config/secrets-staging", result: "DENY", details: "Secret access denied -- insufficient clearance. Policy: admin-agents.yaml requires elevated clearance." },
  { id: "16", timestamp: "2026-03-18 13:20:11", eventType: "KEY_EVENT", agentPrefix: "sk_4f0b...", action: "key_revoke", resource: "soulkeys/sk_4f0b...", result: "ALLOW", details: "Key revoked for legacy-migrator. Migration project completed." },
  { id: "17", timestamp: "2026-03-18 12:30:00", eventType: "EVALUATE", agentPrefix: "sk_2e6a...", action: "read", resource: "billing/aws-march", result: "ALLOW", details: "Cross-cloud billing access for cost analysis -- policy: custom.yaml" },
  { id: "18", timestamp: "2026-03-18 12:00:01", eventType: "POLICY", agentPrefix: "system", action: "validate", resource: "policies/*", result: "ALLOW", details: "Scheduled policy validation. All 5 policy files validated successfully." },
  { id: "19", timestamp: "2026-03-18 11:45:30", eventType: "EVALUATE", agentPrefix: "sk_5c8e...", action: "write", resource: "data-lake/processed/events", result: "ALLOW", details: "Processed data write to data lake -- policy: custom.yaml" },
  { id: "20", timestamp: "2026-03-18 11:30:15", eventType: "ANOMALY", agentPrefix: "sk_6d9e...", action: "read", resource: "metrics/network-ingress", result: "ALLOW", details: "Off-hours access pattern detected (weekend). Low severity -- monitoring only." },
];

const eventTypeColor: Record<AuditEvent["eventType"], string> = {
  EVALUATE: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  KEY_EVENT: "bg-gold-500/15 text-gold-400 border border-gold-500/20",
  POLICY: "bg-teal-500/15 text-teal-400 border border-teal-500/20",
  ANOMALY: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
};

const resultColor: Record<AuditEvent["result"], string> = {
  ALLOW: "bg-green-500/15 text-green-400",
  DENY: "bg-red-500/15 text-red-400",
};

export default function AuditPage() {
  const [eventTypeFilter, setEventTypeFilter] = useState("All");
  const [resultFilter, setResultFilter] = useState("All");
  const [agentFilter, setAgentFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const totalEvents = 1247;

  const filtered = MOCK_EVENTS.filter((e) => {
    if (eventTypeFilter !== "All" && e.eventType !== eventTypeFilter) return false;
    if (resultFilter !== "All" && e.result !== resultFilter) return false;
    if (agentFilter && !e.agentPrefix.toLowerCase().includes(agentFilter.toLowerCase())) return false;
    return true;
  });

  const filterChips = [
    eventTypeFilter !== "All" && { label: `Type: ${eventTypeFilter}`, onClear: () => setEventTypeFilter("All") },
    resultFilter !== "All" && { label: `Result: ${resultFilter}`, onClear: () => setResultFilter("All") },
    agentFilter && { label: `Agent: ${agentFilter}`, onClear: () => setAgentFilter("") },
  ].filter(Boolean) as { label: string; onClear: () => void }[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Audit Trail</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
            {totalEvents.toLocaleString()} events
          </span>
        </div>
        <button className="group px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200 flex items-center gap-2">
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="glass-card rounded-xl p-4 flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-subtle whitespace-nowrap">Date Range</label>
          <input type="date" defaultValue="2026-03-18" className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200" />
          <span className="text-foreground-subtle text-xs">to</span>
          <input type="date" defaultValue="2026-03-18" className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200" />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-subtle whitespace-nowrap">Type</label>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
          >
            <option value="All">All Types</option>
            <option value="EVALUATE">EVALUATE</option>
            <option value="KEY_EVENT">KEY_EVENT</option>
            <option value="POLICY">POLICY</option>
            <option value="ANOMALY">ANOMALY</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-subtle whitespace-nowrap">Agent</label>
          <input
            type="text"
            placeholder="sk_..."
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground font-mono placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-subtle whitespace-nowrap">Result</label>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
          >
            <option value="All">All</option>
            <option value="ALLOW">ALLOW</option>
            <option value="DENY">DENY</option>
          </select>
        </div>
      </div>

      {/* Active filter chips */}
      {filterChips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-foreground-subtle">Active filters:</span>
          {filterChips.map((chip) => (
            <button
              key={chip.label}
              onClick={chip.onClear}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-500/10 border border-gold-500/15 text-xs text-gold-400 hover:bg-gold-500/20 transition-all duration-200"
            >
              {chip.label}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Audit Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Timestamp</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Event Type</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Resource</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Result</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event, index) => (
                <motion.tr
                  key={event.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className={`border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200 ${
                    index % 2 === 1 ? "bg-white/[0.01]" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground-muted whitespace-nowrap">{event.timestamp}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${eventTypeColor[event.eventType]}`}>
                      {event.eventType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-teal-400">{event.agentPrefix}</td>
                  <td className="px-4 py-3 text-foreground">{event.action}</td>
                  <td className="px-4 py-3 text-foreground-muted font-mono text-xs max-w-[200px] truncate">{event.resource}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${resultColor[event.result]}`}>
                      {event.result}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-subtle max-w-[250px] truncate">{event.details}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <span className="text-xs text-foreground-subtle">
            Showing 1-{filtered.length} of {totalEvents.toLocaleString()} events
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg bg-navy-800 text-foreground-muted text-xs border border-white/10 hover:text-foreground hover:border-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              Previous
            </button>
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 ${
                  currentPage === p
                    ? "bg-gold-500/15 text-gold-400 border border-gold-500/20"
                    : "bg-navy-800 text-foreground-muted border border-white/10 hover:text-foreground hover:border-white/15"
                }`}
              >
                {p}
              </button>
            ))}
            <span className="text-foreground-subtle text-xs px-1">...</span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              className="px-3 py-1.5 rounded-lg bg-navy-800 text-foreground-muted text-xs border border-white/10 hover:text-foreground hover:border-white/15 transition-all duration-200"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
