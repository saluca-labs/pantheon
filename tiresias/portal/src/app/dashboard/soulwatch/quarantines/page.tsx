"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useWidgetData } from "@/lib/useWidgetData";
import { api } from "@/lib/api";
import { UpgradePrompt, parseErrorStatus } from "@/components/UpgradePrompt";

/** SoulWatch quarantines -- live quarantine list with release controls. */

/* ── Backend shape ─────────────────────────────────────────────── */

interface ApiQuarantine {
  id: string;
  soulkey_id: string;
  tenant_id: string | null;
  persona_id: string | null;
  triggered_by_type: string;
  actions_taken: string[];
  status: "active" | "released" | "expired" | "pending_approval";
  reason: string;
  quarantined_at: string;
  released_at: string | null;
  auto_release_at: string | null;
  released_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

interface ApiQuarantineResponse {
  quarantines: ApiQuarantine[];
  total: number;
  page: number;
  page_size: number;
}

/* ── Display shape ─────────────────────────────────────────────── */

interface QuarantinedAgent {
  id: string;
  soulkeyId: string;
  personaId: string | null;
  reason: string;
  quarantinedAt: string;
  triggeredByType: string;
  actionsTaken: string[];
  autoRelease: string | null;
  status: "active" | "released" | "expired" | "pending_approval";
  isTest: boolean;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 19);
}

/** Map the first action to a display label + colour class */
function actionDisplay(actions: string[]): { label: string; className: string } {
  const first = actions[0] ?? "unknown";
  const map: Record<string, { label: string; className: string }> = {
    suspend_key: { label: "Suspended", className: "bg-red-500/15 text-red-400 border border-red-500/20" },
    kill_session: { label: "Session Killed", className: "bg-orange-500/15 text-orange-400 border border-orange-500/20" },
    rate_limit: { label: "Rate Limited", className: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20" },
    isolate: { label: "Isolated", className: "bg-red-500/15 text-red-300 border border-red-500/30" },
    revoke_capabilities: { label: "Capabilities Revoked", className: "bg-orange-500/15 text-orange-400 border border-orange-500/20" },
  };
  return map[first] ?? { label: first.replace(/_/g, " "), className: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20" };
}

function isTestQuarantine(reason: string): boolean {
  return reason.toUpperCase().includes("QUARANTINE TESTING");
}

function transformResponse(raw: unknown): QuarantinedAgent[] {
  const resp = raw as ApiQuarantineResponse;
  return resp.quarantines.map((q) => ({
    id: q.id,
    soulkeyId: q.soulkey_id,
    personaId: q.persona_id,
    reason: q.reason,
    quarantinedAt: formatDate(q.quarantined_at),
    triggeredByType: q.triggered_by_type,
    actionsTaken: q.actions_taken,
    autoRelease: q.auto_release_at ? formatDate(q.auto_release_at) : null,
    status: q.status,
    isTest: isTestQuarantine(q.reason),
  }));
}

/* ── Animated counter ──────────────────────────────────────────── */

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

/* ── Page ──────────────────────────────────────────────────────── */

export default function QuarantinesPage() {
  const { data: allQuarantines, loading, error, refetch } = useWidgetData<QuarantinedAgent[]>({
    endpoint: "/api/watch/v1/quarantines",
    transform: transformResponse,
    refreshInterval: 15_000,
  });

  const agents = (allQuarantines ?? []).filter((a) => a.status === "active" || a.status === "pending_approval");
  const released = (allQuarantines ?? []).filter((a) => a.status === "released" || a.status === "expired");

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [releaseDialogId, setReleaseDialogId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [releaseConditions, setReleaseConditions] = useState("Full release");
  const [releaseConfirmed, setReleaseConfirmed] = useState(false);
  const [releasing, setReleasing] = useState(false);

  // Manual quarantine modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualAgent, setManualAgent] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualAction, setManualAction] = useState("suspend_key");
  const [submittingManual, setSubmittingManual] = useState(false);

  const handleRelease = useCallback(async () => {
    if (!releaseDialogId || !releaseReason.trim() || !releaseConfirmed) return;
    setReleasing(true);
    try {
      await api.post(`/api/watch/v1/quarantines/${releaseDialogId}/release`, {
        released_by: "admin",
      });
      refetch();
      setReleaseDialogId(null);
      setReleaseReason("");
      setReleaseConfirmed(false);
    } catch (err) {
      console.error("Release failed:", err);
    } finally {
      setReleasing(false);
    }
  }, [releaseDialogId, releaseReason, releaseConfirmed, refetch]);

  const handleManualQuarantine = useCallback(async () => {
    if (!manualAgent.trim() || !manualReason.trim()) return;
    setSubmittingManual(true);
    try {
      await api.post("/api/watch/v1/quarantines", {
        persona_id: manualAgent.trim(),
        reason: manualReason.trim(),
        triggered_by_type: "manual",
        actions_taken: [manualAction],
      });
      refetch();
      setShowManualModal(false);
      setManualAgent("");
      setManualReason("");
    } catch (err) {
      console.error("Manual quarantine failed:", err);
    } finally {
      setSubmittingManual(false);
    }
  }, [manualAgent, manualReason, manualAction, refetch]);

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

      {/* Error Banner */}
      {error && (
        parseErrorStatus(error) === 402
          ? <UpgradePrompt feature="quarantine_management" requiredTier="pro" />
          : <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              Failed to load quarantines: {error}
            </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5">
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Active Quarantines</p>
          <p className="text-3xl font-bold text-red-400 mt-2"><AnimatedCount target={agents.length} /></p>
          <p className="text-xs text-foreground-muted mt-1">Agents currently quarantined</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5">
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Released</p>
          <p className="text-3xl font-bold text-green-400 mt-2"><AnimatedCount target={released.length} /></p>
          <p className="text-xs text-foreground-muted mt-1">Cleared and restored</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5">
          <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Total Quarantines</p>
          <p className="text-3xl font-bold text-of-primary mt-2"><AnimatedCount target={(allQuarantines ?? []).length} /></p>
          <p className="text-xs text-foreground-muted mt-1">All time (this page)</p>
        </motion.div>
      </div>

      {/* Active Quarantines */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
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
              {loading && !allQuarantines && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-foreground-muted text-sm">Loading quarantines...</p>
                  </td>
                </tr>
              )}
              <AnimatePresence>
                {agents.map((agent) => {
                  const ad = actionDisplay(agent.actionsTaken);
                  const isExpanded = expandedRowId === agent.id;
                  return (
                    <React.Fragment key={agent.id}>
                      <motion.tr
                        layout
                        exit={{ opacity: 0, x: -30, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200 cursor-pointer"
                        onClick={() => setExpandedRowId(isExpanded ? null : agent.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                            )}
                            <div>
                              <span className="font-mono text-xs text-of-primary">
                                {agent.soulkeyId.slice(0, 12)}...
                              </span>
                              {agent.personaId && (
                                <p className="text-xs text-foreground-muted mt-0.5">{agent.personaId}</p>
                              )}
                            </div>
                            {agent.isTest && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                                TEST
                              </span>
                            )}
                            {agent.status === "pending_approval" && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                                Pending
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground-muted max-w-[300px]">{agent.reason}</td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground-muted whitespace-nowrap">{agent.quarantinedAt}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${ad.className}`}>
                            {ad.label}
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
                              onClick={(e) => { e.stopPropagation(); setReleaseDialogId(agent.id); setReleaseReason(""); setReleaseConfirmed(false); }}
                              className="px-3 py-1.5 rounded-lg border border-of-primary/30 text-of-primary hover:bg-of-primary/10 text-xs font-medium transition-all"
                            >
                              Release
                            </button>
                            {/* Escalate disabled for test quarantines */}
                            {!agent.isTest && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Escalation is a local status indicator for now
                                }}
                                className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs font-medium transition-all"
                              >
                                Escalate
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                      {isExpanded && (
                        <tr className="border-b border-white/5">
                          <td colSpan={6} className="px-0 py-0">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="bg-white/[0.02] border-l-2 border-of-primary/30 px-6 py-4"
                            >
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Reason</p>
                                  <p className="text-xs text-foreground">{agent.reason}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Quarantined At</p>
                                  <p className="font-mono text-xs text-foreground">{agent.quarantinedAt}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Soulkey ID</p>
                                  <p className="font-mono text-xs text-of-primary break-all">{agent.soulkeyId}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Persona</p>
                                  <p className="text-xs text-foreground">{agent.personaId ?? <span className="text-foreground-subtle italic">None</span>}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Triggered By</p>
                                  <p className="text-xs text-foreground capitalize">{agent.triggeredByType.replace(/_/g, " ")}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Status</p>
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    agent.status === "active" ? "bg-red-500/15 text-red-400 border border-red-500/20"
                                      : agent.status === "pending_approval" ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                                      : "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20"
                                  }`}>{agent.status.replace(/_/g, " ")}</span>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Actions Taken</p>
                                  <div className="flex flex-wrap gap-1">
                                    {agent.actionsTaken.map((action) => {
                                      const d = actionDisplay([action]);
                                      return (
                                        <span key={action} className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${d.className}`}>
                                          {d.label}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Auto-Release At</p>
                                  <p className="font-mono text-xs text-foreground">
                                    {agent.autoRelease ?? <span className="text-foreground-subtle italic">Manual only</span>}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setReleaseDialogId(agent.id); setReleaseReason(""); setReleaseConfirmed(false); }}
                                  className="px-4 py-2 rounded-lg bg-of-primary/15 border border-of-primary/30 text-of-primary hover:bg-of-primary/25 text-xs font-semibold transition-all"
                                >
                                  Release Agent
                                </button>
                                {!agent.isTest && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); }}
                                    className="px-4 py-2 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 text-xs font-semibold transition-all"
                                  >
                                    Escalate
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </AnimatePresence>
              {!loading && agents.length === 0 && (
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

      {/* Quarantine History (released / expired) */}
      {released.length > 0 && (
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Quarantine History</h3>
          <div className="space-y-2">
            {released.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-of-surface-container-high/50 border border-white/5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.3)]" />
                  <span className="text-sm text-foreground">{entry.personaId ?? entry.soulkeyId.slice(0, 12)}</span>
                  {entry.isTest && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 shrink-0">
                      TEST
                    </span>
                  )}
                  <span className="text-xs text-foreground-subtle truncate">{entry.reason}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-xs text-foreground-muted capitalize">{entry.status}</span>
                  <span className="text-xs text-foreground-muted font-mono">{entry.quarantinedAt}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

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
              <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
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
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-of-primary/50 transition-all resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Release Conditions</label>
                    <select value={releaseConditions} onChange={(e) => setReleaseConditions(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all">
                      <option value="Full release">Full release</option>
                      <option value="Probationary (monitored)">Probationary (monitored)</option>
                      <option value="Restricted capabilities">Restricted capabilities</option>
                    </select>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="mt-0.5">
                      <input type="checkbox" checked={releaseConfirmed} onChange={(e) => setReleaseConfirmed(e.target.checked)} className="sr-only" />
                      <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
                        releaseConfirmed ? "bg-of-primary border-gold-500" : "border-white/20 group-hover:border-white/40"
                      }`}>
                        {releaseConfirmed && (
                          <svg className="w-3 h-3 text-of-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-foreground-muted">I have reviewed the agent&apos;s activity and confirm release</span>
                  </label>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setReleaseDialogId(null)} className="px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={handleRelease} disabled={!releaseReason.trim() || !releaseConfirmed || releasing}
                    className="px-5 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {releasing ? "Releasing..." : "Confirm Release"}
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
              <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
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
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-of-primary/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Reason</label>
                    <textarea value={manualReason} onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Why is this agent being quarantined?" rows={3}
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-of-primary/50 transition-all resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Action</label>
                    <select value={manualAction} onChange={(e) => setManualAction(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all">
                      <option value="suspend_key">Suspend Key</option>
                      <option value="rate_limit">Rate Limit</option>
                      <option value="revoke_capabilities">Revoke Capabilities</option>
                      <option value="isolate">Isolate</option>
                      <option value="kill_session">Kill Session</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setShowManualModal(false)} className="px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={handleManualQuarantine} disabled={!manualAgent.trim() || !manualReason.trim() || submittingManual}
                    className="px-5 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {submittingManual ? "Quarantining..." : "Quarantine Agent"}
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
