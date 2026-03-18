"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RateLimitPolicy {
  id: string;
  name: string;
  target: "tenant_wide" | "per_soulkey" | "per_ip";
  rpm: number;
  burst: number;
  currentUsage: number;
  enabled: boolean;
  hitCount24h: number;
  lastHit: string;
}

const INITIAL_POLICIES: RateLimitPolicy[] = [
  {
    id: "rl_1", name: "Standard Agent Limit", target: "per_soulkey", rpm: 120, burst: 20,
    currentUsage: 87, enabled: true, hitCount24h: 1842, lastHit: "2 min ago",
  },
  {
    id: "rl_2", name: "Premium Agent Limit", target: "per_soulkey", rpm: 500, burst: 50,
    currentUsage: 234, enabled: true, hitCount24h: 312, lastHit: "15 min ago",
  },
  {
    id: "rl_3", name: "Tenant Global Cap", target: "tenant_wide", rpm: 5000, burst: 500,
    currentUsage: 2847, enabled: true, hitCount24h: 89, lastHit: "1 hour ago",
  },
  {
    id: "rl_4", name: "IP Abuse Prevention", target: "per_ip", rpm: 60, burst: 10,
    currentUsage: 12, enabled: true, hitCount24h: 456, lastHit: "5 min ago",
  },
];

const targetLabel: Record<string, string> = {
  tenant_wide: "Tenant-Wide",
  per_soulkey: "Per Soulkey",
  per_ip: "Per IP",
};

const targetBadge: Record<string, string> = {
  tenant_wide: "bg-purple-500/15 text-purple-400 border border-purple-500/20",
  per_soulkey: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  per_ip: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
};

export default function RateLimitsPage() {
  const idCounter = useRef(0);
  const [policies, setPolicies] = useState(INITIAL_POLICIES);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState<RateLimitPolicy["target"]>("per_soulkey");
  const [newRpm, setNewRpm] = useState("120");
  const [newBurst, setNewBurst] = useState("20");

  const activeCount = policies.filter((p) => p.enabled).length;

  const handleAddPolicy = () => {
    if (!newName.trim()) return;
    const policy: RateLimitPolicy = {
      id: `rl_${++idCounter.current}`,
      name: newName.trim(),
      target: newTarget,
      rpm: parseInt(newRpm) || 120,
      burst: parseInt(newBurst) || 20,
      currentUsage: 0,
      enabled: true,
      hitCount24h: 0,
      lastHit: "Never",
    };
    setPolicies((prev) => [policy, ...prev]);
    resetForm();
    setShowAddModal(false);
  };

  const handleEditPolicy = () => {
    if (!newName.trim() || !editingId) return;
    setPolicies((prev) =>
      prev.map((p) =>
        p.id === editingId
          ? { ...p, name: newName.trim(), target: newTarget, rpm: parseInt(newRpm) || 120, burst: parseInt(newBurst) || 20 }
          : p
      )
    );
    resetForm();
    setEditingId(null);
    setShowAddModal(false);
  };

  const resetForm = () => {
    setNewName("");
    setNewTarget("per_soulkey");
    setNewRpm("120");
    setNewBurst("20");
  };

  const openEditModal = (policy: RateLimitPolicy) => {
    setEditingId(policy.id);
    setNewName(policy.name);
    setNewTarget(policy.target);
    setNewRpm(String(policy.rpm));
    setNewBurst(String(policy.burst));
    setShowAddModal(true);
  };

  const toggleEnabled = (id: string) => {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const deletePolicy = (id: string) => {
    setPolicies((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Rate Limits</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
            {activeCount} active
          </span>
        </div>
        <button
          onClick={() => { resetForm(); setEditingId(null); setShowAddModal(true); }}
          className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
        >
          + Add Policy
        </button>
      </div>

      {/* Policies */}
      <div className="space-y-4">
        {policies.map((policy, i) => {
          const usagePct = Math.min((policy.currentUsage / policy.rpm) * 100, 100);
          const isHot = usagePct > 80;
          const isWarm = usagePct > 50;

          return (
            <motion.div
              key={policy.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`glass-card rounded-xl p-5 transition-all duration-200 ${!policy.enabled ? "opacity-60" : ""}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-foreground">{policy.name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${targetBadge[policy.target]}`}>
                      {targetLabel[policy.target]}
                    </span>
                    {!policy.enabled && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-500/15 text-gray-400 border border-gray-500/20">
                        Disabled
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-6 text-xs">
                    <div>
                      <span className="text-foreground-subtle">RPM: </span>
                      <span className="text-foreground font-mono font-bold">{policy.rpm}</span>
                    </div>
                    <div>
                      <span className="text-foreground-subtle">Burst: </span>
                      <span className="text-foreground font-mono font-bold">{policy.burst}</span>
                    </div>
                    <div>
                      <span className="text-foreground-subtle">Hits (24h): </span>
                      <span className="text-foreground-muted font-mono">{policy.hitCount24h.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-foreground-subtle">Last hit: </span>
                      <span className="text-foreground-muted">{policy.lastHit}</span>
                    </div>
                  </div>

                  {/* Live Usage Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground-subtle">Current usage</span>
                      <span className={`font-mono font-bold ${
                        isHot ? "text-red-400" : isWarm ? "text-yellow-400" : "text-green-400"
                      }`}>
                        {policy.currentUsage} / {policy.rpm} RPM
                      </span>
                    </div>
                    <div className="h-2.5 bg-navy-800 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          isHot ? "bg-gradient-to-r from-red-600 to-red-400" :
                          isWarm ? "bg-gradient-to-r from-yellow-600 to-yellow-400" :
                          "bg-gradient-to-r from-green-600 to-green-400"
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${usagePct}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 lg:flex-col lg:items-end">
                  <button
                    onClick={() => toggleEnabled(policy.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      policy.enabled
                        ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                        : "border-gray-500/30 text-gray-400 hover:bg-gray-500/10"
                    }`}
                  >
                    {policy.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => openEditModal(policy)}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-foreground-muted hover:text-foreground hover:bg-white/5 text-xs font-medium transition-all"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePolicy(policy.id)}
                    className="px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Add/Edit Policy Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowAddModal(false); setEditingId(null); resetForm(); }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">
                    {editingId ? "Edit Policy" : "Add Rate Limit Policy"}
                  </h2>
                  <button onClick={() => { setShowAddModal(false); setEditingId(null); resetForm(); }} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Policy Name</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Standard Agent Limit"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Target</label>
                    <select value={newTarget} onChange={(e) => setNewTarget(e.target.value as RateLimitPolicy["target"])}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all">
                      <option value="per_soulkey">Per Soulkey</option>
                      <option value="tenant_wide">Tenant-Wide</option>
                      <option value="per_ip">Per IP</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Requests Per Minute</label>
                      <input type="number" value={newRpm} onChange={(e) => setNewRpm(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Burst Allowance</label>
                      <input type="number" value={newBurst} onChange={(e) => setNewBurst(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all font-mono" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => { setShowAddModal(false); setEditingId(null); resetForm(); }}
                    className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={editingId ? handleEditPolicy : handleAddPolicy} disabled={!newName.trim()}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {editingId ? "Save Changes" : "Add Policy"}
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
