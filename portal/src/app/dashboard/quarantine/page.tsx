"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface QuarantinedAgent {
  id: string;
  agentPrefix: string;
  soulkeyFull: string;
  persona: string;
  reason: string;
  reasonDetail: string;
  quarantinedAt: string;
  actionTaken: "Suspended" | "Rate Limited" | "Capabilities Revoked" | "Isolated";
  autoRelease: string | null;
  status: "quarantined" | "escalated";
  anomalyScore: number;
  timeline: { time: string; event: string; severity: "info" | "warning" | "critical" }[];
  recentActivity: { timestamp: string; action: string; resource: string; result: string }[];
}

interface QuarantineThreshold {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  action: string;
  description: string;
}

interface ReleasedAgent {
  persona: string;
  releasedAt: string;
  reason: string;
  conditions: string;
}

const INITIAL_QUARANTINED_AGENTS: QuarantinedAgent[] = [
  {
    id: "1",
    agentPrefix: "sk_8a1c...",
    soulkeyFull: "sk_8a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c",
    persona: "compliance-checker",
    reason: "Anomaly score 92 - attempted write to compliance-reports after clearance revocation",
    reasonDetail: "Agent attempted to write to compliance-reports/q1-draft at 14:32:01 UTC. At this time, the agent's clearance had been revoked 47 minutes earlier due to a policy update. The anomaly detection system flagged the continued write attempts as the agent appeared to be retrying the operation in a loop, generating 14 failed requests in 3 minutes.",
    quarantinedAt: "2026-03-18 14:32:01",
    actionTaken: "Suspended",
    autoRelease: null,
    status: "quarantined",
    anomalyScore: 92,
    timeline: [
      { time: "13:45:00", event: "Clearance revoked by policy update (admin-agents.yaml)", severity: "info" },
      { time: "14:28:55", event: "First write attempt to compliance-reports/q1-draft (DENIED)", severity: "warning" },
      { time: "14:30:12", event: "Rapid retry detected: 14 requests in 3 minutes", severity: "critical" },
      { time: "14:32:01", event: "Auto-quarantine triggered: anomaly score exceeded threshold (92 > 85)", severity: "critical" },
    ],
    recentActivity: [
      { timestamp: "14:32:01", action: "write", resource: "compliance-reports/q1-draft", result: "DENY" },
      { timestamp: "14:31:44", action: "write", resource: "compliance-reports/q1-draft", result: "DENY" },
      { timestamp: "14:31:20", action: "write", resource: "compliance-reports/q1-draft", result: "DENY" },
      { timestamp: "14:30:55", action: "read", resource: "policies/gdpr-v3", result: "ALLOW" },
      { timestamp: "14:28:55", action: "write", resource: "compliance-reports/q1-draft", result: "DENY" },
    ],
  },
  {
    id: "2",
    agentPrefix: "sk_5c8e...",
    soulkeyFull: "sk_5c8e0a2d4f6b8c0e2a4d6f8b0c2e4a6d8f0b2c4e6a8d0f2b4c6e8a0d2f4b6c8",
    persona: "data-pipeline",
    reason: "Unusual data volume - 3x normal read rate on data-lake/raw/events",
    reasonDetail: "Data pipeline agent exceeded its historical baseline data transfer rate by a factor of 3.2x. Normally processes approximately 2.4 GB per hour, but was transferring 7.7 GB per hour over the last 90 minutes. This triggered the data volume throttle threshold. The spike appears correlated with a new ETL job configuration deployed earlier today.",
    quarantinedAt: "2026-03-18 13:45:33",
    actionTaken: "Rate Limited",
    autoRelease: "2026-03-18 19:45:33",
    status: "quarantined",
    anomalyScore: 67,
    timeline: [
      { time: "12:00:00", event: "New ETL configuration deployed (etl/daily-ingest v2.1)", severity: "info" },
      { time: "12:15:33", event: "Data transfer rate increased to 2x baseline", severity: "warning" },
      { time: "13:00:00", event: "Data transfer rate increased to 3x baseline", severity: "warning" },
      { time: "13:45:33", event: "Rate limit applied: data volume threshold exceeded (3.2x > 3x)", severity: "critical" },
    ],
    recentActivity: [
      { timestamp: "13:45:33", action: "read", resource: "data-lake/raw/events/2026-03-18", result: "THROTTLED" },
      { timestamp: "13:40:15", action: "read", resource: "data-lake/raw/events/2026-03-17", result: "ALLOW" },
      { timestamp: "13:35:22", action: "execute", resource: "etl/daily-ingest", result: "ALLOW" },
      { timestamp: "13:20:00", action: "write", resource: "data-lake/processed/events", result: "ALLOW" },
      { timestamp: "12:55:10", action: "read", resource: "data-lake/raw/transactions", result: "ALLOW" },
    ],
  },
  {
    id: "3",
    agentPrefix: "sk_f2b9...",
    soulkeyFull: "sk_f2b93a5c7d1e9f3b5a7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a",
    persona: "test-agent-beta",
    reason: "Cross-tenant access attempt - tried to read resources from tenant: globex-inc",
    reasonDetail: "Test agent attempted to read resources belonging to tenant 'globex-inc' while authenticated under tenant 'acme-corp'. This is a critical isolation violation. The agent's request included a resource path 'globex-inc/customer-data/exports' which is outside its tenant boundary. Investigation suggests a misconfigured resource path in the agent's task queue rather than malicious intent.",
    quarantinedAt: "2026-03-15 09:22:10",
    actionTaken: "Isolated",
    autoRelease: null,
    status: "quarantined",
    anomalyScore: 98,
    timeline: [
      { time: "09:15:00", event: "Agent started batch task from queue (task-id: tsk_4f2a)", severity: "info" },
      { time: "09:18:33", event: "Successfully read acme-corp/test-data/sample-1", severity: "info" },
      { time: "09:22:10", event: "Cross-tenant access attempt: globex-inc/customer-data/exports (BLOCKED)", severity: "critical" },
      { time: "09:22:10", event: "Immediate isolation: all capabilities revoked, soulkey suspended", severity: "critical" },
    ],
    recentActivity: [
      { timestamp: "09:22:10", action: "read", resource: "globex-inc/customer-data/exports", result: "DENY" },
      { timestamp: "09:20:45", action: "read", resource: "acme-corp/test-data/sample-3", result: "ALLOW" },
      { timestamp: "09:19:30", action: "read", resource: "acme-corp/test-data/sample-2", result: "ALLOW" },
      { timestamp: "09:18:33", action: "read", resource: "acme-corp/test-data/sample-1", result: "ALLOW" },
      { timestamp: "09:15:00", action: "execute", resource: "tasks/tsk_4f2a", result: "ALLOW" },
    ],
  },
];

const INITIAL_RELEASED_AGENTS: ReleasedAgent[] = [
  { persona: "monitoring-agent", releasedAt: "2026-03-18 10:15:00", reason: "False positive - off-hours activity was scheduled maintenance", conditions: "Full release" },
  { persona: "cost-optimizer", releasedAt: "2026-03-18 08:30:00", reason: "Rate limit resolved - normal patterns resumed after batch job completed", conditions: "Full release" },
];

const INITIAL_THRESHOLDS: QuarantineThreshold[] = [
  {
    id: "1",
    name: "Anomaly Score Auto-Quarantine",
    metric: "Anomaly Score",
    threshold: 85,
    action: "Auto-Quarantine",
    description: "Suspend agent when anomaly score exceeds threshold",
  },
  {
    id: "2",
    name: "Failed Evaluation Rate Limit",
    metric: "Failed Evals / min",
    threshold: 10,
    action: "Rate Limit",
    description: "Apply rate limiting when failed evaluations spike",
  },
  {
    id: "3",
    name: "Cross-Tenant Isolation",
    metric: "Cross-Tenant Attempts",
    threshold: 1,
    action: "Isolate",
    description: "Immediately isolate on any cross-tenant access attempt",
  },
  {
    id: "4",
    name: "Data Volume Throttle",
    metric: "Data Volume Multiplier",
    threshold: 3,
    action: "Rate Limit",
    description: "Throttle when data transfer exceeds baseline multiplier",
  },
];

const actionColor: Record<QuarantinedAgent["actionTaken"], string> = {
  Suspended: "bg-red-500/15 text-red-400 border border-red-500/20",
  "Rate Limited": "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  "Capabilities Revoked": "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  Isolated: "bg-red-500/15 text-red-300 border border-red-500/30",
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

export default function QuarantinePage() {
  const [thresholds, setThresholds] = useState(INITIAL_THRESHOLDS);
  const [agents, setAgents] = useState(INITIAL_QUARANTINED_AGENTS);
  const [releasedAgents, setReleasedAgents] = useState(INITIAL_RELEASED_AGENTS);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Release dialog state
  const [releaseDialogId, setReleaseDialogId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [releaseConditions, setReleaseConditions] = useState("Full release");
  const [releaseConfirmed, setReleaseConfirmed] = useState(false);

  const updateThreshold = (id: string, value: number) => {
    setThresholds((prev) =>
      prev.map((t) => (t.id === id ? { ...t, threshold: value } : t))
    );
  };

  const handleEscalate = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "escalated" as const } : a))
    );
  };

  const openReleaseDialog = (id: string) => {
    setReleaseDialogId(id);
    setReleaseReason("");
    setReleaseConditions("Full release");
    setReleaseConfirmed(false);
  };

  const handleRelease = () => {
    if (!releaseDialogId || !releaseReason.trim() || !releaseConfirmed) return;
    const agent = agents.find((a) => a.id === releaseDialogId);
    if (!agent) return;

    setReleasedAgents((prev) => [
      {
        persona: agent.persona,
        releasedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        reason: releaseReason.trim(),
        conditions: releaseConditions,
      },
      ...prev,
    ]);
    setAgents((prev) => prev.filter((a) => a.id !== releaseDialogId));
    setReleaseDialogId(null);
    setExpandedAgent(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Quarantine</h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20">
          {agents.length} active
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="glass-card rounded-xl p-5"
        >
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Active Quarantines</p>
          <p className="text-3xl font-bold text-red-400 mt-2">
            <AnimatedCount target={agents.length} />
          </p>
          <p className="text-xs text-foreground-muted mt-1">Agents currently quarantined</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-5"
        >
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Released Today</p>
          <p className="text-3xl font-bold text-green-400 mt-2">
            <AnimatedCount target={releasedAgents.length} />
          </p>
          <p className="text-xs text-foreground-muted mt-1">Cleared and restored</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-xl p-5"
        >
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Total This Week</p>
          <p className="text-3xl font-bold text-gold-400 mt-2">
            <AnimatedCount target={agents.length + releasedAgents.length + 3} />
          </p>
          <p className="text-xs text-foreground-muted mt-1">Quarantine events since Monday</p>
        </motion.div>
      </div>

      {/* Quarantined Agents Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-foreground">Active Quarantines</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Reason</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Quarantined At</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Action Taken</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Auto-Release</th>
                <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {agents.map((agent) => (
                  <React.Fragment key={agent.id}>
                    <motion.tr
                      layout
                      exit={{ opacity: 0, x: -30, height: 0 }}
                      transition={{ duration: 0.3 }}
                      onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                      className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all duration-200"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-mono text-xs text-teal-400">{agent.agentPrefix}</span>
                            <p className="text-xs text-foreground-muted mt-0.5">{agent.persona}</p>
                          </div>
                          {agent.status === "escalated" && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/15 text-purple-400 border border-purple-500/20">
                              Escalated to SOC
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground-muted max-w-[300px]">{agent.reason}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground-muted whitespace-nowrap">{agent.quarantinedAt}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${actionColor[agent.actionTaken]}`}>
                          {agent.actionTaken}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground-muted">
                        {agent.autoRelease ? (
                          <span className="font-mono">{agent.autoRelease}</span>
                        ) : (
                          <span className="text-foreground-subtle italic">Manual only</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openReleaseDialog(agent.id)}
                            className="px-3 py-1.5 rounded-lg border border-gold-500/30 text-gold-400 hover:bg-gold-500/10 text-xs font-medium transition-all duration-200"
                          >
                            Review & Release
                          </button>
                          {agent.status !== "escalated" && (
                            <button
                              onClick={() => handleEscalate(agent.id)}
                              className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs font-medium transition-all duration-200"
                            >
                              Escalate
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>

                    {/* Expanded detail panel */}
                    <AnimatePresence>
                      {expandedAgent === agent.id && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-5 bg-navy-800/50 border-b border-white/5 space-y-5">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                  {/* Column 1: Agent details */}
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Full Soulkey Hash</h4>
                                      <p className="font-mono text-xs text-teal-400 break-all bg-navy-950 rounded-lg p-3 border border-white/5">
                                        {agent.soulkeyFull}
                                      </p>
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Quarantine Reason (Detailed)</h4>
                                      <p className="text-xs text-foreground-muted leading-relaxed bg-navy-950 rounded-lg p-3 border border-white/5">
                                        {agent.reasonDetail}
                                      </p>
                                    </div>
                                    {/* Risk Assessment */}
                                    <div>
                                      <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Risk Assessment</h4>
                                      <div className="bg-navy-950 rounded-lg p-3 border border-white/5 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs text-foreground-subtle">Anomaly Score</span>
                                          <span className={`text-sm font-bold font-mono ${
                                            agent.anomalyScore >= 90 ? "text-red-400" :
                                            agent.anomalyScore >= 70 ? "text-orange-400" :
                                            agent.anomalyScore >= 50 ? "text-yellow-400" : "text-green-400"
                                          }`}>{agent.anomalyScore}/100</span>
                                        </div>
                                        <div className="relative h-2.5 bg-navy-800 rounded-full overflow-hidden">
                                          <motion.div
                                            className={`h-full rounded-full ${
                                              agent.anomalyScore >= 90 ? "bg-gradient-to-r from-red-600 to-red-400" :
                                              agent.anomalyScore >= 70 ? "bg-gradient-to-r from-orange-600 to-orange-400" :
                                              agent.anomalyScore >= 50 ? "bg-gradient-to-r from-yellow-600 to-yellow-400" :
                                              "bg-gradient-to-r from-green-600 to-green-400"
                                            }`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${agent.anomalyScore}%` }}
                                            transition={{ duration: 0.6, ease: "easeOut" }}
                                          />
                                        </div>
                                        <p className="text-[10px] text-foreground-subtle">
                                          {agent.anomalyScore >= 90 ? "Critical risk - immediate review required" :
                                           agent.anomalyScore >= 70 ? "High risk - review recommended" :
                                           agent.anomalyScore >= 50 ? "Moderate risk - monitor closely" :
                                           "Low risk - likely false positive"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Column 2: Timeline */}
                                  <div>
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Event Timeline</h4>
                                    <div className="space-y-0 relative">
                                      <div className="absolute left-[7px] top-4 bottom-4 w-px bg-white/10" />
                                      {agent.timeline.map((event, i) => (
                                        <motion.div
                                          key={i}
                                          initial={{ opacity: 0, x: -8 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: i * 0.1 }}
                                          className="flex items-start gap-3 py-2 relative"
                                        >
                                          <div className={`relative z-10 w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 border-2 ${
                                            event.severity === "critical" ? "bg-red-500 border-red-400 shadow-[0_0_6px_rgba(239,68,68,0.4)]" :
                                            event.severity === "warning" ? "bg-yellow-500 border-yellow-400" :
                                            "bg-blue-500/50 border-blue-400/50"
                                          }`} />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs text-foreground-muted leading-relaxed">{event.event}</p>
                                            <p className="text-[10px] text-foreground-subtle font-mono mt-0.5">{event.time}</p>
                                          </div>
                                        </motion.div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Column 3: Recent Activity */}
                                  <div>
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Recent Activity Log</h4>
                                    <div className="space-y-1.5">
                                      {agent.recentActivity.map((event, i) => (
                                        <motion.div
                                          key={i}
                                          initial={{ opacity: 0, x: 8 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: i * 0.05 }}
                                          className="flex items-center justify-between text-xs bg-navy-950 rounded-lg px-3 py-2 border border-white/5"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-foreground-subtle font-mono shrink-0">{event.timestamp}</span>
                                            <span className="text-foreground-muted shrink-0">{event.action}</span>
                                            <span className="text-foreground truncate">{event.resource}</span>
                                          </div>
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ml-2 ${
                                            event.result === "ALLOW" ? "text-green-400 bg-green-500/10" :
                                            event.result === "THROTTLED" ? "text-yellow-400 bg-yellow-500/10" :
                                            "text-red-400 bg-red-500/10"
                                          }`}>
                                            {event.result}
                                          </span>
                                        </motion.div>
                                      ))}
                                    </div>
                                  </div>
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
              {agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-foreground-muted text-sm">No agents currently in quarantine</p>
                    <p className="text-foreground-subtle text-xs mt-1">All agents are operating within normal parameters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recently Released */}
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Recently Released</h3>
        <div className="space-y-2 relative">
          {/* Timeline connector */}
          {releasedAgents.length > 0 && (
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-green-500/15" />
          )}
          <AnimatePresence>
            {releasedAgents.map((agent, i) => (
              <motion.div
                key={`${agent.persona}-${agent.releasedAt}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-navy-800/50 border border-white/5 relative"
              >
                <div className="flex items-center gap-3">
                  <div className="relative z-10 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.3)]" />
                  <span className="text-sm text-foreground">{agent.persona}</span>
                  <span className="text-xs text-foreground-subtle">{agent.reason}</span>
                  {agent.conditions && agent.conditions !== "Full release" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                      {agent.conditions}
                    </span>
                  )}
                </div>
                <span className="text-xs text-foreground-muted font-mono">{agent.releasedAt}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {releasedAgents.length === 0 && (
            <p className="text-xs text-foreground-subtle italic px-3 py-2">No agents released yet</p>
          )}
        </div>
      </div>

      {/* Quarantine Policies / Thresholds */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Quarantine Policies</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {thresholds.map((t) => {
            const maxVal = t.id === "1" ? 100 : t.id === "2" ? 50 : t.id === "3" ? 5 : 10;
            const pct = Math.min((t.threshold / maxVal) * 100, 100);
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-5 space-y-3"
              >
                <h4 className="text-sm font-semibold text-foreground">{t.name}</h4>
                <p className="text-xs text-foreground-muted">{t.description}</p>

                {/* Slider-style visual */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground-subtle">{t.metric}</span>
                    <span className="font-mono text-foreground">{t.threshold}</span>
                  </div>
                  <div className="relative h-2 bg-navy-800 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        t.action === "Auto-Quarantine" || t.action === "Isolate"
                          ? "bg-gradient-to-r from-red-600 to-red-400"
                          : "bg-gradient-to-r from-yellow-600 to-yellow-400"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-foreground-subtle whitespace-nowrap">{t.metric} &gt;</label>
                  <input
                    type="number"
                    value={t.threshold}
                    onChange={(e) => updateThreshold(t.id, Number(e.target.value))}
                    className="w-20 px-3 py-1.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground font-mono focus:outline-none focus:border-gold-500/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200"
                  />
                  <svg className="w-4 h-4 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    t.action === "Auto-Quarantine" ? "bg-red-500/15 text-red-400 border border-red-500/20"
                    : t.action === "Rate Limit" ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                    : "bg-red-500/15 text-red-300 border border-red-500/30"
                  }`}>
                    {t.action}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Release Confirmation Dialog */}
      <AnimatePresence>
        {releaseDialogId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReleaseDialogId(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Review & Release Agent</h2>
                  <button
                    onClick={() => setReleaseDialogId(null)}
                    className="text-foreground-subtle hover:text-foreground transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Agent info */}
                  {(() => {
                    const agent = agents.find((a) => a.id === releaseDialogId);
                    if (!agent) return null;
                    return (
                      <div className="bg-navy-950 rounded-lg p-3 border border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-teal-400">{agent.agentPrefix}</span>
                          <span className="text-xs text-foreground-muted">{agent.persona}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${actionColor[agent.actionTaken]}`}>
                            {agent.actionTaken}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Reason for release */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
                      Reason for Release <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={releaseReason}
                      onChange={(e) => setReleaseReason(e.target.value)}
                      placeholder="Explain why this agent should be released from quarantine..."
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 resize-none"
                    />
                  </div>

                  {/* Release conditions */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Release Conditions</label>
                    <select
                      value={releaseConditions}
                      onChange={(e) => setReleaseConditions(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                    >
                      <option value="Full release">Full release</option>
                      <option value="Probationary (monitored)">Probationary (monitored)</option>
                      <option value="Restricted capabilities">Restricted capabilities</option>
                    </select>
                  </div>

                  {/* Confirmation checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="mt-0.5">
                      <input
                        type="checkbox"
                        checked={releaseConfirmed}
                        onChange={(e) => setReleaseConfirmed(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                        releaseConfirmed
                          ? "bg-gold-500 border-gold-500"
                          : "border-white/20 group-hover:border-white/40"
                      }`}>
                        {releaseConfirmed && (
                          <svg className="w-3 h-3 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-foreground-muted leading-relaxed">
                      I have reviewed the agent&apos;s activity and confirm release
                    </span>
                  </label>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button
                    onClick={() => setReleaseDialogId(null)}
                    className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRelease}
                    disabled={!releaseReason.trim() || !releaseConfirmed}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm Release
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
