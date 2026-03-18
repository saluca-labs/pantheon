"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Agent {
  id: string;
  soulkeyPrefix: string;
  soulkeyFull: string;
  persona: string;
  status: "Active" | "Trial" | "Suspended" | "Revoked";
  tenant: string;
  created: string;
  lastActive: string;
  capabilities: string[];
  clearance: string;
  description: string;
  recentActivity: { timestamp: string; action: string; resource: string; result: string }[];
}

function generateSoulkey(): string {
  const hex = "0123456789abcdef";
  let result = "sk_";
  for (let i = 0; i < 64; i++) {
    result += hex[Math.floor(Math.random() * 16)];
  }
  return result;
}

function soulkeyPrefix(full: string): string {
  return full.slice(0, 7) + "...";
}

const INITIAL_AGENTS: Agent[] = [
  {
    id: "1",
    soulkeyPrefix: "sk_7f3a...",
    soulkeyFull: "sk_7f3a8b2c1d4e5f6a9b0c3d7e8f1a2b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    persona: "analytics-agent",
    status: "Active",
    tenant: "acme-corp",
    created: "2026-01-15",
    lastActive: "2 min ago",
    capabilities: ["read:customer-data", "read:reports", "write:analytics"],
    clearance: "standard",
    description: "Analytics data processing agent",
    recentActivity: [
      { timestamp: "2026-03-18 14:32:01", action: "read", resource: "customer-data/segment-q1", result: "ALLOW" },
      { timestamp: "2026-03-18 14:28:44", action: "read", resource: "reports/monthly-kpi", result: "ALLOW" },
      { timestamp: "2026-03-18 14:15:12", action: "write", resource: "analytics/dashboard-cache", result: "ALLOW" },
      { timestamp: "2026-03-18 13:59:30", action: "read", resource: "customer-data/churn-model", result: "ALLOW" },
      { timestamp: "2026-03-18 13:45:08", action: "read", resource: "reports/revenue-forecast", result: "ALLOW" },
    ],
  },
  {
    id: "2",
    soulkeyPrefix: "sk_9e2b...",
    soulkeyFull: "sk_9e2b4c6d8f0a1b3c5d7e9f1a2b4c6d8e0f2a3b5c7d9e1f3a4b6c8d0e2f4a5b7",
    persona: "security-scanner",
    status: "Active",
    tenant: "acme-corp",
    created: "2026-01-22",
    lastActive: "5 min ago",
    capabilities: ["read:logs", "read:config", "write:alerts", "execute:scan"],
    clearance: "elevated",
    description: "Security scanning and vulnerability detection",
    recentActivity: [
      { timestamp: "2026-03-18 14:29:55", action: "execute", resource: "scan/vulnerability-check", result: "ALLOW" },
      { timestamp: "2026-03-18 14:20:11", action: "read", resource: "logs/auth-events", result: "ALLOW" },
      { timestamp: "2026-03-18 14:10:33", action: "write", resource: "alerts/cve-2026-1234", result: "ALLOW" },
      { timestamp: "2026-03-18 13:55:07", action: "read", resource: "config/firewall-rules", result: "ALLOW" },
      { timestamp: "2026-03-18 13:40:22", action: "execute", resource: "scan/port-sweep", result: "ALLOW" },
    ],
  },
  {
    id: "3",
    soulkeyPrefix: "sk_1d4f...",
    soulkeyFull: "sk_1d4f6a8c0e2b4d6f8a0c2e4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b0d2",
    persona: "deployment-bot",
    status: "Active",
    tenant: "acme-corp",
    created: "2026-02-03",
    lastActive: "18 min ago",
    capabilities: ["read:config", "write:deployments", "execute:pipelines"],
    clearance: "elevated",
    description: "CI/CD deployment automation agent",
    recentActivity: [
      { timestamp: "2026-03-18 14:16:40", action: "execute", resource: "pipelines/staging-deploy", result: "ALLOW" },
      { timestamp: "2026-03-18 14:05:18", action: "read", resource: "config/env-staging", result: "ALLOW" },
      { timestamp: "2026-03-18 13:50:02", action: "write", resource: "deployments/v2.4.1-rc3", result: "ALLOW" },
      { timestamp: "2026-03-18 13:30:55", action: "read", resource: "config/secrets-staging", result: "DENY" },
      { timestamp: "2026-03-18 13:20:11", action: "execute", resource: "pipelines/build-check", result: "ALLOW" },
    ],
  },
  {
    id: "4",
    soulkeyPrefix: "sk_5c8e...",
    soulkeyFull: "sk_5c8e0a2d4f6b8c0e2a4d6f8b0c2e4a6d8f0b2c4e6a8d0f2b4c6e8a0d2f4b6c8",
    persona: "data-pipeline",
    status: "Trial",
    tenant: "acme-corp",
    created: "2026-03-10",
    lastActive: "1 hour ago",
    capabilities: ["read:data-lake", "write:data-lake", "execute:etl"],
    clearance: "standard",
    description: "Data pipeline ETL processing",
    recentActivity: [
      { timestamp: "2026-03-18 13:35:22", action: "execute", resource: "etl/daily-ingest", result: "ALLOW" },
      { timestamp: "2026-03-18 12:00:01", action: "read", resource: "data-lake/raw/events", result: "ALLOW" },
      { timestamp: "2026-03-18 11:45:30", action: "write", resource: "data-lake/processed/events", result: "ALLOW" },
      { timestamp: "2026-03-17 23:00:00", action: "execute", resource: "etl/nightly-batch", result: "ALLOW" },
      { timestamp: "2026-03-17 22:55:12", action: "read", resource: "data-lake/raw/transactions", result: "ALLOW" },
    ],
  },
  {
    id: "5",
    soulkeyPrefix: "sk_3b7d...",
    soulkeyFull: "sk_3b7d9f1c3e5a7b9d1f3c5e7a9b1d3f5c7e9a1b3d5f7c9e1a3b5d7f9c1e3a5b7d",
    persona: "customer-support-ai",
    status: "Active",
    tenant: "acme-corp",
    created: "2026-02-14",
    lastActive: "Just now",
    capabilities: ["read:tickets", "write:responses", "read:knowledge-base"],
    clearance: "standard",
    description: "Customer support automation",
    recentActivity: [
      { timestamp: "2026-03-18 14:34:02", action: "read", resource: "tickets/TKT-8847", result: "ALLOW" },
      { timestamp: "2026-03-18 14:33:45", action: "read", resource: "knowledge-base/billing-faq", result: "ALLOW" },
      { timestamp: "2026-03-18 14:33:12", action: "write", resource: "responses/TKT-8847-draft", result: "ALLOW" },
      { timestamp: "2026-03-18 14:30:01", action: "read", resource: "tickets/TKT-8846", result: "ALLOW" },
      { timestamp: "2026-03-18 14:29:55", action: "write", resource: "responses/TKT-8846-draft", result: "ALLOW" },
    ],
  },
  {
    id: "6",
    soulkeyPrefix: "sk_8a1c...",
    soulkeyFull: "sk_8a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c",
    persona: "compliance-checker",
    status: "Suspended",
    tenant: "acme-corp",
    created: "2026-01-28",
    lastActive: "3 days ago",
    capabilities: ["read:policies", "read:audit-logs", "write:compliance-reports"],
    clearance: "elevated",
    description: "Compliance and audit verification",
    recentActivity: [
      { timestamp: "2026-03-15 09:12:33", action: "read", resource: "audit-logs/march-batch", result: "ALLOW" },
      { timestamp: "2026-03-15 09:10:01", action: "read", resource: "policies/gdpr-v3", result: "ALLOW" },
      { timestamp: "2026-03-15 08:55:44", action: "write", resource: "compliance-reports/q1-draft", result: "DENY" },
      { timestamp: "2026-03-15 08:50:20", action: "read", resource: "audit-logs/february-batch", result: "ALLOW" },
      { timestamp: "2026-03-15 08:45:00", action: "read", resource: "policies/sox-controls", result: "ALLOW" },
    ],
  },
  {
    id: "7",
    soulkeyPrefix: "sk_2e6a...",
    soulkeyFull: "sk_2e6a8c0d2f4b6c8e0a2d4f6b8c0e2a4d6f8b0c2e4a6d8f0b2c4e6a8d0f2b4c6",
    persona: "cost-optimizer",
    status: "Trial",
    tenant: "acme-corp",
    created: "2026-03-12",
    lastActive: "45 min ago",
    capabilities: ["read:billing", "read:usage-metrics", "write:recommendations"],
    clearance: "standard",
    description: "Cloud cost optimization recommendations",
    recentActivity: [
      { timestamp: "2026-03-18 13:49:10", action: "read", resource: "billing/gcp-march", result: "ALLOW" },
      { timestamp: "2026-03-18 13:45:33", action: "read", resource: "usage-metrics/compute-daily", result: "ALLOW" },
      { timestamp: "2026-03-18 13:40:05", action: "write", resource: "recommendations/right-size-batch", result: "ALLOW" },
      { timestamp: "2026-03-18 12:30:00", action: "read", resource: "billing/aws-march", result: "ALLOW" },
      { timestamp: "2026-03-18 12:25:12", action: "read", resource: "usage-metrics/storage-daily", result: "ALLOW" },
    ],
  },
  {
    id: "8",
    soulkeyPrefix: "sk_4f0b...",
    soulkeyFull: "sk_4f0b2d4e6a8c0f2b4d6e8a0c2f4b6d8e0a2c4f6b8d0e2a4c6f8b0d2e4a6c8f0b",
    persona: "legacy-migrator",
    status: "Revoked",
    tenant: "acme-corp",
    created: "2025-11-20",
    lastActive: "2 weeks ago",
    capabilities: ["read:legacy-db", "write:new-db", "execute:migration"],
    clearance: "admin",
    description: "Legacy database migration agent",
    recentActivity: [
      { timestamp: "2026-03-04 16:20:00", action: "execute", resource: "migration/batch-final", result: "ALLOW" },
      { timestamp: "2026-03-04 16:15:30", action: "write", resource: "new-db/customers-v2", result: "ALLOW" },
      { timestamp: "2026-03-04 16:10:00", action: "read", resource: "legacy-db/customers", result: "ALLOW" },
      { timestamp: "2026-03-04 15:50:22", action: "execute", resource: "migration/validation", result: "ALLOW" },
      { timestamp: "2026-03-04 15:45:00", action: "read", resource: "legacy-db/orders", result: "ALLOW" },
    ],
  },
  {
    id: "9",
    soulkeyPrefix: "sk_6d9e...",
    soulkeyFull: "sk_6d9e1a3b5c7f9d1e3a5b7c9f1d3e5a7b9c1f3d5e7a9b1c3f5d7e9a1b3c5f7d9e",
    persona: "monitoring-agent",
    status: "Active",
    tenant: "acme-corp",
    created: "2026-01-05",
    lastActive: "30 sec ago",
    capabilities: ["read:metrics", "read:logs", "write:alerts", "execute:healthchecks"],
    clearance: "standard",
    description: "Infrastructure monitoring and alerting",
    recentActivity: [
      { timestamp: "2026-03-18 14:34:30", action: "execute", resource: "healthchecks/api-gateway", result: "ALLOW" },
      { timestamp: "2026-03-18 14:34:00", action: "read", resource: "metrics/cpu-utilization", result: "ALLOW" },
      { timestamp: "2026-03-18 14:33:30", action: "read", resource: "metrics/memory-usage", result: "ALLOW" },
      { timestamp: "2026-03-18 14:33:00", action: "execute", resource: "healthchecks/database-primary", result: "ALLOW" },
      { timestamp: "2026-03-18 14:32:30", action: "read", resource: "logs/error-stream", result: "ALLOW" },
    ],
  },
];

const statusColor: Record<Agent["status"], string> = {
  Active: "bg-green-500/15 text-green-400 border border-green-500/20",
  Trial: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  Suspended: "bg-red-500/15 text-red-400 border border-red-500/20",
  Revoked: "bg-gray-500/15 text-gray-400 border border-gray-500/20",
};

const ALL_CAPABILITIES = [
  { label: "Read", value: "read" },
  { label: "Write", value: "write" },
  { label: "Execute", value: "execute" },
  { label: "Admin", value: "admin" },
];

export default function AgentsPage() {
  const idCounter = useRef(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);

  // Register modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newPersona, setNewPersona] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newClearance, setNewClearance] = useState("standard");
  const [newCapabilities, setNewCapabilities] = useState<string[]>(["read"]);

  // Action states
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  const filtered = agents.filter((a) => {
    const matchesSearch =
      !search ||
      a.persona.toLowerCase().includes(search.toLowerCase()) ||
      a.soulkeyPrefix.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    all: agents.length,
    active: agents.filter((a) => a.status === "Active").length,
  };

  const toggleCapability = (cap: string) => {
    setNewCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleRegister = () => {
    if (!newPersona.trim()) return;
    const fullKey = generateSoulkey();
    const capList = newCapabilities.map((c) => `${c}:*`);
    const newAgent: Agent = {
      id: `agent_${++idCounter.current}`,
      soulkeyPrefix: soulkeyPrefix(fullKey),
      soulkeyFull: fullKey,
      persona: newPersona.trim(),
      status: "Active",
      tenant: "acme-corp",
      created: new Date().toISOString().split("T")[0],
      lastActive: "Just now",
      capabilities: capList,
      clearance: newClearance,
      description: newDescription.trim() || "New agent",
      recentActivity: [
        { timestamp: new Date().toISOString().replace("T", " ").slice(0, 19), action: "register", resource: "agents/self", result: "ALLOW" },
      ],
    };
    setAgents((prev) => [newAgent, ...prev]);
    setShowRegisterModal(false);
    resetRegisterForm();
  };

  const resetRegisterForm = () => {
    setNewPersona("");
    setNewDescription("");
    setNewClearance("standard");
    setNewCapabilities(["read"]);
  };

  const handleSuspend = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        if (a.status === "Suspended") {
          return { ...a, status: "Active" as const, lastActive: "Just now" };
        }
        return { ...a, status: "Suspended" as const };
      })
    );
  };

  const handleRotateKey = (id: string) => {
    setRotatingId(id);
    setTimeout(() => {
      const newKey = generateSoulkey();
      setAgents((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, soulkeyFull: newKey, soulkeyPrefix: soulkeyPrefix(newKey), lastActive: "Just now" }
            : a
        )
      );
      setRotatingId(null);
    }, 1200);
  };

  const handleRevoke = (id: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: "Revoked" as const } : a
      )
    );
    setRevokeConfirmId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Agent Fleet</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold-500/15 text-gold-400 border border-gold-500/20">
            {counts.all} agents
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/20">
            {counts.active} active
          </span>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
        >
          + Register New Agent
        </button>
      </div>

      {/* Search / Filter bar */}
      <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by persona or soulkey..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {["All", "Active", "Trial", "Suspended", "Revoked"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`relative px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                statusFilter === s
                  ? "bg-gold-500/15 text-gold-400 border border-gold-500/30"
                  : "bg-navy-800 text-foreground-muted border border-white/10 hover:text-foreground hover:border-white/15"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Soulkey</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Persona</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Tenant</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Created</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Last Active</th>
                <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((agent) => (
                  <React.Fragment key={agent.id}>
                    <motion.tr
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                      className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all duration-200"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-teal-400">
                        <span className={rotatingId === agent.id ? "animate-pulse text-gold-400" : ""}>
                          {rotatingId === agent.id ? "Rotating..." : agent.soulkeyPrefix}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground font-medium">{agent.persona}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[agent.status]}`}>
                          {agent.status === "Active" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          )}
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted">{agent.tenant}</td>
                      <td className="px-4 py-3 text-foreground-muted">{agent.created}</td>
                      <td className="px-4 py-3 text-foreground-muted">{agent.lastActive}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                            className="px-2 py-1 rounded text-xs text-teal-400 hover:bg-teal-500/10 transition-all duration-200"
                          >
                            Details
                          </button>
                          {agent.status !== "Revoked" && (
                            <button
                              onClick={() => handleSuspend(agent.id)}
                              className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
                                agent.status === "Suspended"
                                  ? "text-green-400 hover:bg-green-500/10"
                                  : "text-yellow-400 hover:bg-yellow-500/10"
                              }`}
                            >
                              {agent.status === "Suspended" ? "Unsuspend" : "Suspend"}
                            </button>
                          )}
                          {agent.status !== "Revoked" && (
                            <button
                              onClick={() => handleRotateKey(agent.id)}
                              disabled={rotatingId === agent.id}
                              className="px-2 py-1 rounded text-xs text-gold-400 hover:bg-gold-500/10 transition-all duration-200 disabled:opacity-50"
                            >
                              {rotatingId === agent.id ? "Rotating..." : "Rotate"}
                            </button>
                          )}
                          {agent.status !== "Revoked" ? (
                            revokeConfirmId === agent.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleRevoke(agent.id)}
                                  className="px-2 py-1 rounded text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all duration-200"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setRevokeConfirmId(null)}
                                  className="px-2 py-1 rounded text-xs text-foreground-muted hover:bg-white/5 transition-all duration-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setRevokeConfirmId(agent.id)}
                                className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition-all duration-200"
                              >
                                Revoke
                              </button>
                            )
                          ) : (
                            <span className="px-2 py-1 text-xs text-gray-500 italic">Revoked</span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                    {/* Expanded detail panel */}
                    <AnimatePresence>
                      {expandedAgent === agent.id && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-4 bg-navy-800/50 border-b border-white/5">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                  {/* Soulkey & Persona */}
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Soulkey Hash</h4>
                                    <p className="font-mono text-xs text-teal-400 break-all bg-navy-950 rounded-lg p-3 border border-white/5">
                                      {agent.soulkeyFull}
                                    </p>
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mt-4">Persona</h4>
                                    <p className="text-sm text-foreground">{agent.persona}</p>
                                    {agent.description && (
                                      <p className="text-xs text-foreground-muted">{agent.description}</p>
                                    )}
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mt-4">Clearance</h4>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                      agent.clearance === "admin" ? "bg-red-500/15 text-red-400 border border-red-500/20" :
                                      agent.clearance === "elevated" ? "bg-orange-500/15 text-orange-400 border border-orange-500/20" :
                                      "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                    }`}>{agent.clearance}</span>
                                  </div>

                                  {/* Capabilities */}
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Capabilities</h4>
                                    <div className="flex flex-wrap gap-2">
                                      {agent.capabilities.map((cap) => (
                                        <span key={cap} className="px-2 py-1 rounded-md text-xs font-mono bg-navy-700 text-teal-300 border border-teal-500/15">
                                          {cap}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Recent Activity */}
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Recent Activity</h4>
                                    <div className="space-y-2">
                                      {agent.recentActivity.map((event, i) => (
                                        <motion.div
                                          key={i}
                                          initial={{ opacity: 0, x: 8 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: i * 0.05 }}
                                          className="flex items-center justify-between text-xs bg-navy-950 rounded-lg px-3 py-2 border border-white/5"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-foreground-subtle font-mono">{event.timestamp.split(" ")[1]}</span>
                                            <span className="text-foreground-muted">{event.action}</span>
                                            <span className="text-foreground truncate max-w-[150px]">{event.resource}</span>
                                          </div>
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            event.result === "ALLOW" ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
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
            </tbody>
          </table>
        </div>
      </div>

      {/* Register New Agent Modal */}
      <AnimatePresence>
        {showRegisterModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowRegisterModal(false); resetRegisterForm(); }}
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
                  <h2 className="text-lg font-semibold text-foreground">Register New Agent</h2>
                  <button
                    onClick={() => { setShowRegisterModal(false); resetRegisterForm(); }}
                    className="text-foreground-subtle hover:text-foreground transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Persona name */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Persona Name</label>
                    <input
                      type="text"
                      value={newPersona}
                      onChange={(e) => setNewPersona(e.target.value)}
                      placeholder="e.g. reporting-agent"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Description</label>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="What does this agent do?"
                      rows={2}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 resize-none"
                    />
                  </div>

                  {/* Clearance level */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Clearance Level</label>
                    <select
                      value={newClearance}
                      onChange={(e) => setNewClearance(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                    >
                      <option value="standard">Standard</option>
                      <option value="elevated">Elevated</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  {/* Capabilities */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Capabilities</label>
                    <div className="flex flex-wrap gap-3">
                      {ALL_CAPABILITIES.map((cap) => (
                        <label
                          key={cap.value}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-200 ${
                            newCapabilities.includes(cap.value)
                              ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                              : "bg-navy-800 border-white/10 text-foreground-muted hover:border-white/20"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={newCapabilities.includes(cap.value)}
                            onChange={() => toggleCapability(cap.value)}
                            className="sr-only"
                          />
                          <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all ${
                            newCapabilities.includes(cap.value)
                              ? "bg-teal-500 border-teal-500"
                              : "border-white/20"
                          }`}>
                            {newCapabilities.includes(cap.value) && (
                              <svg className="w-2.5 h-2.5 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs font-medium">{cap.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-navy-950 rounded-lg p-3 border border-white/5">
                    <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mb-1">Soulkey will be generated on creation</p>
                    <p className="font-mono text-xs text-teal-400">sk_{"<"}auto-generated{">"}...</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button
                    onClick={() => { setShowRegisterModal(false); resetRegisterForm(); }}
                    className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRegister}
                    disabled={!newPersona.trim() || newCapabilities.length === 0}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Register Agent
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
