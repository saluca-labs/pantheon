"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/** SoulGate rate limits -- per-tenant, per-key, and per-IP rate policy editor with template policies. */

interface RateLimitPolicy {
  id: string;
  name: string;
  category: "department" | "role" | "agent" | "special";
  target: "tenant_wide" | "per_soulkey" | "per_ip";
  requests_per_hour: number;
  tokens_per_hour: number;
  burst_multiplier: number;
  description: string;
  currentUsage: number;
  enabled: boolean;
  hitCount24h: number;
  lastHit: string;
}

const SEED_POLICIES: RateLimitPolicy[] = [
  // ── Department templates ──
  {
    id: "tmpl_dept_eng",
    name: "Engineering",
    category: "department",
    target: "tenant_wide",
    requests_per_hour: 1000,
    tokens_per_hour: 500_000,
    burst_multiplier: 1.5,
    description: "Standard limit for the engineering department",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_dept_eng_mgmt",
    name: "Engineering Management",
    category: "department",
    target: "tenant_wide",
    requests_per_hour: 500,
    tokens_per_hour: 250_000,
    burst_multiplier: 1.2,
    description: "Management-tier limit for engineering leadership",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_dept_marketing",
    name: "Marketing",
    category: "department",
    target: "tenant_wide",
    requests_per_hour: 200,
    tokens_per_hour: 100_000,
    burst_multiplier: 1.0,
    description: "Standard limit for the marketing department",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_dept_legal",
    name: "Legal",
    category: "department",
    target: "tenant_wide",
    requests_per_hour: 300,
    tokens_per_hour: 150_000,
    burst_multiplier: 1.0,
    description: "Standard limit for the legal department",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_dept_exec",
    name: "Executive",
    category: "department",
    target: "tenant_wide",
    requests_per_hour: 100,
    tokens_per_hour: 50_000,
    burst_multiplier: 1.0,
    description: "Conservative limit for executive-level access",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  // ── Role templates ──
  {
    id: "tmpl_role_sr_eng",
    name: "Senior Engineer",
    category: "role",
    target: "per_soulkey",
    requests_per_hour: 800,
    tokens_per_hour: 400_000,
    burst_multiplier: 1.5,
    description: "Elevated limit for senior individual contributors",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_role_jr_eng",
    name: "Junior Engineer",
    category: "role",
    target: "per_soulkey",
    requests_per_hour: 400,
    tokens_per_hour: 200_000,
    burst_multiplier: 1.0,
    description: "Standard limit for junior engineers",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_role_analyst",
    name: "Analyst",
    category: "role",
    target: "per_soulkey",
    requests_per_hour: 250,
    tokens_per_hour: 125_000,
    burst_multiplier: 1.0,
    description: "Standard limit for analyst roles",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  // ── Agent-specific templates ──
  {
    id: "tmpl_agent_cicd",
    name: "CI/CD Pipeline Agent",
    category: "agent",
    target: "per_soulkey",
    requests_per_hour: 2000,
    tokens_per_hour: 1_000_000,
    burst_multiplier: 3.0,
    description: "High-throughput limit for CI/CD automation with large burst allowance",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_agent_support",
    name: "Customer Support Bot",
    category: "agent",
    target: "per_soulkey",
    requests_per_hour: 500,
    tokens_per_hour: 250_000,
    burst_multiplier: 1.5,
    description: "Moderate limit for customer-facing support agents",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  {
    id: "tmpl_agent_codereview",
    name: "Code Review Agent",
    category: "agent",
    target: "per_soulkey",
    requests_per_hour: 300,
    tokens_per_hour: 150_000,
    burst_multiplier: 1.2,
    description: "Standard limit for automated code review agents",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
  // ── Special ──
  {
    id: "tmpl_special_whitelist",
    name: "Whitelisted (No Limits)",
    category: "special",
    target: "per_soulkey",
    requests_per_hour: 0,
    tokens_per_hour: 0,
    burst_multiplier: 0,
    description: "Exempt from all rate limits -- use sparingly for trusted internal agents",
    currentUsage: 0,
    enabled: false,
    hitCount24h: 0,
    lastHit: "Never",
  },
];

const INITIAL_POLICIES: RateLimitPolicy[] = [...SEED_POLICIES];

const categoryLabel: Record<string, string> = {
  department: "Department",
  role: "Role",
  agent: "Agent",
  special: "Special",
};

const categoryBadge: Record<string, string> = {
  department: "bg-purple-500/15 text-purple-400 border border-purple-500/20",
  role: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20",
  agent: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  special: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
};

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
  const [newCategory, setNewCategory] = useState<RateLimitPolicy["category"]>("department");
  const [newTarget, setNewTarget] = useState<RateLimitPolicy["target"]>("per_soulkey");
  const [newReqPerHour, setNewReqPerHour] = useState("500");
  const [newTokensPerHour, setNewTokensPerHour] = useState("250000");
  const [newBurstMult, setNewBurstMult] = useState("1.0");
  const [newDescription, setNewDescription] = useState("");

  const activeCount = policies.filter((p) => p.enabled).length;

  const handleAddPolicy = () => {
    if (!newName.trim()) return;
    const policy: RateLimitPolicy = {
      id: `rl_${++idCounter.current}`,
      name: newName.trim(),
      category: newCategory,
      target: newTarget,
      requests_per_hour: parseInt(newReqPerHour) || 500,
      tokens_per_hour: parseInt(newTokensPerHour) || 250_000,
      burst_multiplier: parseFloat(newBurstMult) || 1.0,
      description: newDescription.trim(),
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
          ? {
              ...p,
              name: newName.trim(),
              category: newCategory,
              target: newTarget,
              requests_per_hour: parseInt(newReqPerHour) || 500,
              tokens_per_hour: parseInt(newTokensPerHour) || 250_000,
              burst_multiplier: parseFloat(newBurstMult) || 1.0,
              description: newDescription.trim(),
            }
          : p
      )
    );
    resetForm();
    setEditingId(null);
    setShowAddModal(false);
  };

  const resetForm = () => {
    setNewName("");
    setNewCategory("department");
    setNewTarget("per_soulkey");
    setNewReqPerHour("500");
    setNewTokensPerHour("250000");
    setNewBurstMult("1.0");
    setNewDescription("");
  };

  const openEditModal = (policy: RateLimitPolicy) => {
    setEditingId(policy.id);
    setNewName(policy.name);
    setNewCategory(policy.category);
    setNewTarget(policy.target);
    setNewReqPerHour(String(policy.requests_per_hour));
    setNewTokensPerHour(String(policy.tokens_per_hour));
    setNewBurstMult(String(policy.burst_multiplier));
    setNewDescription(policy.description);
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
          className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors"
        >
          + Add Policy
        </button>
      </div>

      {/* Policies */}
      {policies.length === 0 && (
        <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-12 text-center">
          <p className="text-foreground-muted text-sm">No rate limit policies configured</p>
          <p className="text-foreground-subtle text-xs mt-1">Click &quot;+ Add Policy&quot; to create your first rate limit policy</p>
        </div>
      )}
      <div className="space-y-4">
        {policies.map((policy, i) => {
          const rpm = Math.round(policy.requests_per_hour / 60);
          const usagePct = rpm > 0 ? Math.min((policy.currentUsage / rpm) * 100, 100) : 0;
          const isHot = usagePct > 80;
          const isWarm = usagePct > 50;
          const isWhitelisted = policy.category === "special" && policy.requests_per_hour === 0;

          return (
            <motion.div
              key={policy.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 transition-all duration-200 ${!policy.enabled ? "opacity-60" : ""}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{policy.name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${categoryBadge[policy.category]}`}>
                      {categoryLabel[policy.category]}
                    </span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${targetBadge[policy.target]}`}>
                      {targetLabel[policy.target]}
                    </span>
                    {!policy.enabled && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-500/15 text-gray-400 border border-gray-500/20">
                        Disabled
                      </span>
                    )}
                  </div>

                  {policy.description && (
                    <p className="text-xs text-foreground-subtle">{policy.description}</p>
                  )}

                  <div className="flex items-center gap-6 text-xs flex-wrap">
                    <div>
                      <span className="text-foreground-subtle">Req/hr: </span>
                      <span className="text-foreground font-mono font-bold">
                        {isWhitelisted ? "Unlimited" : policy.requests_per_hour.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-foreground-subtle">Tokens/hr: </span>
                      <span className="text-foreground font-mono font-bold">
                        {isWhitelisted ? "Unlimited" : policy.tokens_per_hour.toLocaleString()}
                      </span>
                    </div>
                    {policy.burst_multiplier > 0 && !isWhitelisted && (
                      <div>
                        <span className="text-foreground-subtle">Burst: </span>
                        <span className="text-foreground font-mono font-bold">{policy.burst_multiplier}x</span>
                      </div>
                    )}
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
                  {!isWhitelisted && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground-subtle">Current usage</span>
                        <span className={`font-mono font-bold ${
                          isHot ? "text-red-400" : isWarm ? "text-yellow-400" : "text-green-400"
                        }`}>
                          {policy.currentUsage} / {rpm} RPM
                        </span>
                      </div>
                      <div className="h-2.5 bg-of-surface-container-high rounded-full overflow-hidden">
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
                  )}
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
              <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
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
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-of-primary/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Description</label>
                    <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Brief description of this policy"
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-of-primary/50 transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Category</label>
                      <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as RateLimitPolicy["category"])}
                        className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all">
                        <option value="department">Department</option>
                        <option value="role">Role</option>
                        <option value="agent">Agent</option>
                        <option value="special">Special</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Target</label>
                      <select value={newTarget} onChange={(e) => setNewTarget(e.target.value as RateLimitPolicy["target"])}
                        className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all">
                        <option value="per_soulkey">Per Soulkey</option>
                        <option value="tenant_wide">Tenant-Wide</option>
                        <option value="per_ip">Per IP</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Requests / Hour</label>
                      <input type="number" value={newReqPerHour} onChange={(e) => setNewReqPerHour(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Tokens / Hour</label>
                      <input type="number" value={newTokensPerHour} onChange={(e) => setNewTokensPerHour(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Burst Multiplier</label>
                      <input type="number" step="0.1" value={newBurstMult} onChange={(e) => setNewBurstMult(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all font-mono" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => { setShowAddModal(false); setEditingId(null); resetForm(); }}
                    className="px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={editingId ? handleEditPolicy : handleAddPolicy} disabled={!newName.trim()}
                    className="px-5 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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
