"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface QuarantinedAgent {
  id: string;
  agentPrefix: string;
  persona: string;
  reason: string;
  quarantinedAt: string;
  actionTaken: "Suspended" | "Rate Limited" | "Capabilities Revoked" | "Isolated";
  autoRelease: string | null;
  status: "quarantined" | "escalated";
  anomalyScore: number;
}

interface HistoryEntry {
  persona: string;
  releasedAt: string;
  reason: string;
  duration: string;
}

const QUARANTINED_AGENTS: QuarantinedAgent[] = [
  {
    id: "1", agentPrefix: "sk_8a1c...", persona: "compliance-checker",
    reason: "Anomaly score 92 - attempted write to compliance-reports after clearance revocation",
    quarantinedAt: "2026-03-18 14:32:01", actionTaken: "Suspended", autoRelease: null, status: "quarantined", anomalyScore: 92,
  },
  {
    id: "2", agentPrefix: "sk_5c8e...", persona: "data-pipeline",
    reason: "Unusual data volume - 3x normal read rate on data-lake/raw/events",
    quarantinedAt: "2026-03-18 13:45:33", actionTaken: "Rate Limited", autoRelease: "2026-03-18 19:45:33", status: "quarantined", anomalyScore: 67,
  },
  {
    id: "3", agentPrefix: "sk_f2b9...", persona: "test-agent-beta",
    reason: "Cross-tenant access attempt - tried to read resources from tenant: globex-inc",
    quarantinedAt: "2026-03-15 09:22:10", actionTaken: "Isolated", autoRelease: null, status: "quarantined", anomalyScore: 98,
  },
];

const QUARANTINE_HISTORY: HistoryEntry[] = [
  { persona: "monitoring-agent", releasedAt: "2026-03-18 10:15:00", reason: "False positive - off-hours activity was scheduled maintenance", duration: "4h 22m" },
  { persona: "cost-optimizer", releasedAt: "2026-03-18 08:30:00", reason: "Rate limit resolved - normal patterns resumed", duration: "12h 15m" },
  { persona: "email-processor", releasedAt: "2026-03-17 16:45:00", reason: "Excessive permissions resolved after policy update", duration: "2h 10m" },
  { persona: "report-generator", releasedAt: "2026-03-17 09:00:00", reason: "Behavioral drift was expected due to new feature deployment", duration: "6h 30m" },
];

const actionColor: Record<string, string> = {
  Suspended: "bg-red-500/15 text-red-400 border border-red-500/20",
  "Rate Limited": "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  "Capabilities Revoked": "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  Isolated: "bg-red-500/15 text-red-300 border border-red-500/30",
};

function AnimatedCount({ target, className }: { target: number; className?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const steps = 20;
    const inc = target / steps;
    let c = 0;
    const t = setInterval(() => {
      c += inc;
      if (c >= target) { setCount(target); clearInterval(t); } else setCount(Math.floor(c));
    }, 30);
    return () => clearInterval(t);
  }, [target]);
  return <span className={className}>{count}</span>;
}

export default function QuarantinesPage() {
  const [agents, setAgents] = useState(QUARANTINED_AGENTS);
  const [history, setHistory] = useState(QUARANTINE_HISTORY);
  const [releaseDialogId, setReleaseDialogId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [releaseConditions, setReleaseConditions] = useState("Full release");
  const [releaseConfirmed, setReleaseConfirmed] = useState(false);

  // Manual quarantine modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualAgent, setManualAgent] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualAction, setManualAction] = useState<QuarantinedAgent["actionTaken"]>("Suspended");

  const handleRelease = () => {
    if (!releaseDialogId || !releaseReason.trim() || !releaseConfirmed) return;
    const agent = agents.find((a) => a.id === releaseDialogId);
    if (!agent) return;
    setHistory((prev) => [{
      persona: agent.persona,
      releasedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      reason: releaseReason.trim(),
      duration: "Just now",
    }, ...prev]);
    setAgents((prev) => prev.filter((a) => a.id !== releaseDialogId));
    setReleaseDialogId(null);
    setReleaseReason("");
    setReleaseConfirmed(false);
  };

  const handleManualQuarantine = () => {
    if (!manualAgent.trim() || !manualReason.trim()) return;
    const newAgent: QuarantinedAgent = {
      id: Date.now().toString(),
      agentPrefix: "sk_manual...",
      persona: manualAgent.trim(),
      reason: manualReason.trim(),
      quarantinedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      actionTaken: manualAction,
      autoRelease: null,
      status: "quarantined",
      anomalyScore: 0,
    };
    setAgents((prev) => [newAgent, ...prev]);
    setShowManualModal(false);
    setManualAgent("");
    setManualReason("");
  };

  const handleEscalate = (id: string) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status: "escalated" as const } : a)));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Quarantines</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20">
            {agents.length} active
          </span>
        </div>
        <button
          onClick={() => setShowManualModal(true)}
          className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/30 transition-colors"
        >
          Manual Quarantine
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-5">
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Active Quarantines</p>
          <p className="text-3xl font-bold text-red-400 mt-2"><AnimatedCount target={agents.length} /></p>
          <p className="text-xs text-foreground-muted mt-1">Agents currently quarantined</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-xl p-5">
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Released This Week</p>
          <p className="text-3xl font-bold text-green-400 mt-2"><AnimatedCount target={history.length} /></p>
          <p className="text-xs text-foreground-muted mt-1">Cleared and restored</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-5">
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Avg Quarantine Duration</p>
          <p className="text-3xl font-bold text-gold-400 mt-2">6.3h</p>
          <p className="text-xs text-foreground-muted mt-1">Average time in quarantine</p>
        </motion.div>
      </div>

      {/* Active Quarantines */}
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
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Auto-Release</th>
                <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {agents.map((agent) => (
                  <motion.tr
                    key={agent.id}
                    layout
                    exit={{ opacity: 0, x: -30, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <span className="font-mono text-xs text-teal-400">{agent.agentPrefix}</span>
                          <p className="text-xs text-foreground-muted mt-0.5">{agent.persona}</p>
                        </div>
                        {agent.status === "escalated" && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/15 text-purple-400 border border-purple-500/20">
                            Escalated
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setReleaseDialogId(agent.id); setReleaseReason(""); setReleaseConfirmed(false); }}
                          className="px-3 py-1.5 rounded-lg border border-gold-500/30 text-gold-400 hover:bg-gold-500/10 text-xs font-medium transition-all"
                        >
                          Release
                        </button>
                        {agent.status !== "escalated" && (
                          <button
                            onClick={() => handleEscalate(agent.id)}
                            className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs font-medium transition-all"
                          >
                            Escalate
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
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

      {/* Quarantine History */}
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Quarantine History</h3>
        <div className="space-y-2">
          {history.map((entry, i) => (
            <motion.div
              key={`${entry.persona}-${entry.releasedAt}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-navy-800/50 border border-white/5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.3)]" />
                <span className="text-sm text-foreground">{entry.persona}</span>
                <span className="text-xs text-foreground-subtle truncate">{entry.reason}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className="text-xs text-foreground-muted">{entry.duration}</span>
                <span className="text-xs text-foreground-muted font-mono">{entry.releasedAt}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Release Dialog */}
      <AnimatePresence>
        {releaseDialogId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setReleaseDialogId(null)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Release Agent</h2>
                  <button onClick={() => setReleaseDialogId(null)} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Reason for Release <span className="text-red-400">*</span></label>
                    <textarea value={releaseReason} onChange={(e) => setReleaseReason(e.target.value)}
                      placeholder="Explain why this agent should be released..." rows={3}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Release Conditions</label>
                    <select value={releaseConditions} onChange={(e) => setReleaseConditions(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all">
                      <option value="Full release">Full release</option>
                      <option value="Probationary (monitored)">Probationary (monitored)</option>
                      <option value="Restricted capabilities">Restricted capabilities</option>
                    </select>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="mt-0.5">
                      <input type="checkbox" checked={releaseConfirmed} onChange={(e) => setReleaseConfirmed(e.target.checked)} className="sr-only" />
                      <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
                        releaseConfirmed ? "bg-gold-500 border-gold-500" : "border-white/20 group-hover:border-white/40"
                      }`}>
                        {releaseConfirmed && (
                          <svg className="w-3 h-3 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-foreground-muted">I have reviewed the agent&apos;s activity and confirm release</span>
                  </label>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setReleaseDialogId(null)} className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={handleRelease} disabled={!releaseReason.trim() || !releaseConfirmed}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Confirm Release
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Manual Quarantine Modal */}
      <AnimatePresence>
        {showManualModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowManualModal(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Manual Quarantine</h2>
                  <button onClick={() => setShowManualModal(false)} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Agent Persona</label>
                    <input type="text" value={manualAgent} onChange={(e) => setManualAgent(e.target.value)}
                      placeholder="e.g. analytics-agent"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Reason</label>
                    <textarea value={manualReason} onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Why is this agent being quarantined?" rows={3}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Action</label>
                    <select value={manualAction} onChange={(e) => setManualAction(e.target.value as QuarantinedAgent["actionTaken"])}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all">
                      <option value="Suspended">Suspended</option>
                      <option value="Rate Limited">Rate Limited</option>
                      <option value="Capabilities Revoked">Capabilities Revoked</option>
                      <option value="Isolated">Isolated</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setShowManualModal(false)} className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={handleManualQuarantine} disabled={!manualAgent.trim() || !manualReason.trim()}
                    className="px-5 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Quarantine Agent
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
