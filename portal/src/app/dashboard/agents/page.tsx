"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useWidgetData } from "@/lib/useWidgetData";
import { tenantName, truncateSoulkey } from "@/lib/display";

/** Agent fleet management -- soulkey generation, agent CRUD, and status controls. */

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

/** Shape returned by SoulAuth GET /v1/soulauth/admin/keys */
interface SoulkeyDetail {
  id: string;
  tenant_id: string;
  persona_id: string;
  label: string | null;
  status: string;
  issued_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  metadata: Record<string, unknown> | null;
}

/** Map a SoulAuth status string to the Agent status union */
function mapStatus(s: string): Agent["status"] {
  const lower = s.toLowerCase();
  if (lower === "active") return "Active";
  if (lower === "trial") return "Trial";
  if (lower === "suspended") return "Suspended";
  if (lower === "revoked") return "Revoked";
  return "Active";
}

/** Format an ISO timestamp to a human-friendly relative string */
function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hour${Math.floor(diff / 3_600_000) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diff / 86_400_000)} day${Math.floor(diff / 86_400_000) > 1 ? "s" : ""} ago`;
}

/** Derive capabilities from metadata fields and persona_id prefix */
function deriveCapabilities(k: SoulkeyDetail): string[] {
  const caps: string[] = [];
  const meta = (k.metadata || {}) as Record<string, unknown>;

  // If metadata explicitly has capabilities, use them
  if (Array.isArray(meta.capabilities) && meta.capabilities.length > 0) {
    return meta.capabilities as string[];
  }

  // Derive from metadata fields
  const mode = (meta.mode as string) || "";
  const type = (meta.type as string) || "";

  if (mode) caps.push(`mode:${mode}`);
  if (type) caps.push(`type:${type}`);

  // Derive from persona_id prefix convention
  const prefix = k.persona_id.split(":")[0];
  const prefixCaps: Record<string, string> = {
    mon: "monitoring",
    admin: "admin",
    svc: "service",
    test: "testing",
    agent: "agent",
  };
  if (prefixCaps[prefix]) caps.push(`role:${prefixCaps[prefix]}`);

  // Add any other metadata keys as informational capabilities
  for (const [key, val] of Object.entries(meta)) {
    if (["mode", "type", "capabilities", "clearance"].includes(key)) continue;
    if (typeof val === "string" || typeof val === "boolean") {
      caps.push(`${key}:${String(val)}`);
    }
  }

  return caps;
}

/** Build recent activity timeline from soulkey lifecycle events */
function buildRecentActivity(k: SoulkeyDetail): Agent["recentActivity"] {
  const events: Agent["recentActivity"] = [];

  if (k.issued_at) {
    events.push({
      timestamp: k.issued_at.replace("T", " ").slice(0, 19),
      action: "issued",
      resource: `soulkey/${k.id.slice(0, 8)}`,
      result: "ALLOW",
    });
  }

  if (k.last_used_at) {
    events.push({
      timestamp: k.last_used_at.replace("T", " ").slice(0, 19),
      action: "last_used",
      resource: `proxy/request`,
      result: "ALLOW",
    });
  }

  if (k.suspended_at) {
    events.push({
      timestamp: k.suspended_at.replace("T", " ").slice(0, 19),
      action: "suspended",
      resource: k.suspended_by || "system",
      result: "DENY",
    });
  }

  if (k.revoked_at) {
    events.push({
      timestamp: k.revoked_at.replace("T", " ").slice(0, 19),
      action: "revoked",
      resource: k.revoked_by || (k.revocation_reason || "admin"),
      result: "DENY",
    });
  }

  // Sort by timestamp descending (most recent first)
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return events;
}

/** Transform a list of SoulkeyDetail into the Agent[] the UI expects */
function transformKeys(raw: unknown): Agent[] {
  const keys = raw as SoulkeyDetail[];
  if (!Array.isArray(keys)) return [];
  return keys.map((k) => ({
    id: k.id,
    soulkeyPrefix: `sk_${k.id.slice(0, 4)}...`,
    soulkeyFull: k.id,
    persona: k.persona_id,
    status: mapStatus(k.status),
    tenant: k.tenant_id,
    created: k.issued_at ? k.issued_at.split("T")[0] : "",
    lastActive: timeAgo(k.last_used_at),
    capabilities: deriveCapabilities(k),
    clearance: ((k.metadata as Record<string, unknown>)?.clearance as string) || "standard",
    description: k.label || k.persona_id,
    recentActivity: buildRecentActivity(k),
  }));
}

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

function AgentsPageInner() {
  const idCounter = useRef(0);
  const searchParams = useSearchParams();
  const expandParam = searchParams.get("expand");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const didAutoExpand = useRef(false);

  // Fetch soulkeys from SoulAuth via the API route
  const { data: apiAgents, loading: agentsLoading, error: agentsError } = useWidgetData<Agent[]>({
    endpoint: "/api/soulauth/agents?all=true",
    transform: transformKeys,
    refreshInterval: 30_000,
  });

  // Sync API data into local state (so local mutations like suspend/rotate still work)
  useEffect(() => {
    if (apiAgents && apiAgents.length > 0) {
      setAgents(apiAgents);
    }
  }, [apiAgents]);

  // Auto-expand and scroll to agent when ?expand=<id> query param is present
  useEffect(() => {
    if (!expandParam || didAutoExpand.current || agents.length === 0) return;
    const match = agents.find((a) => a.id === expandParam || a.soulkeyFull === expandParam);
    if (match) {
      didAutoExpand.current = true;
      setExpandedAgent(match.id);
      // Scroll to the row after a brief delay so the DOM has rendered
      requestAnimationFrame(() => {
        const el = document.getElementById(`agent-row-${match.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [expandParam, agents]);

  // Register modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newPersona, setNewPersona] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newClearance, setNewClearance] = useState("standard");
  const [newCapabilities, setNewCapabilities] = useState<string[]>(["read"]);

  // Action states
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  // When ?expand=<id> is present and not yet cleared, show only that agent with a "Show all" option
  const [expandFilter, setExpandFilter] = useState<string | null>(expandParam);

  const filtered = (() => {
    let list = agents.filter((a) => {
      const matchesSearch =
        !search ||
        a.persona.toLowerCase().includes(search.toLowerCase()) ||
        a.soulkeyPrefix.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "All" || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    // When expand filter is active, move the matching agent to the top
    if (expandFilter) {
      const idx = list.findIndex((a) => a.id === expandFilter || a.soulkeyFull === expandFilter);
      if (idx > 0) {
        const [match] = list.splice(idx, 1);
        list = [match, ...list];
      }
    }

    return list;
  })();

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
      tenant: "",
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

      {/* Expand filter banner */}
      {expandFilter && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20">
          <span className="text-sm text-teal-300">
            Showing agent <span className="font-mono font-semibold">{expandFilter.slice(0, 12)}...</span> at top
          </span>
          <button
            onClick={() => {
              setExpandFilter(null);
              // Clear the URL param without full navigation
              const url = new URL(window.location.href);
              url.searchParams.delete("expand");
              window.history.replaceState({}, "", url.toString());
            }}
            className="px-3 py-1 rounded-md text-xs font-medium text-teal-400 hover:bg-teal-500/15 border border-teal-500/20 transition-colors"
          >
            Show all agents
          </button>
        </div>
      )}

      {/* Agent Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Agent Name</th>
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
                      id={`agent-row-${agent.id}`}
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                      className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all duration-200"
                    >
                      <td className="px-4 py-3">
                        <span className="text-foreground font-medium">{agent.persona}</span>
                        {rotatingId === agent.id && (
                          <span className="ml-2 text-xs text-gold-400 animate-pulse">Rotating key...</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[agent.status]}`}>
                          {agent.status === "Active" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          )}
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted" title={agent.tenant}>{tenantName(agent.tenant)}</td>
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
                          <td colSpan={6} className="p-0">
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
                                    {agent.capabilities.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {agent.capabilities.map((cap) => (
                                          <span key={cap} className="px-2 py-1 rounded-md text-xs font-mono bg-navy-700 text-teal-300 border border-teal-500/15">
                                            {cap}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-foreground-subtle italic">No capabilities configured in metadata</p>
                                    )}
                                  </div>

                                  {/* Recent Activity */}
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Recent Activity</h4>
                                    {agent.recentActivity.length === 0 && (
                                      <p className="text-xs text-foreground-subtle italic">No activity recorded</p>
                                    )}
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
              {/* Loading state */}
              {agentsLoading && agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
                      <p className="text-sm text-foreground-muted">Loading agents from SoulAuth...</p>
                    </div>
                  </td>
                </tr>
              )}
              {/* Error state */}
              {agentsError && agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <p className="text-sm text-red-400">Failed to load agents</p>
                      <p className="text-xs text-foreground-subtle">{agentsError}</p>
                    </div>
                  </td>
                </tr>
              )}
              {/* Empty state */}
              {!agentsLoading && !agentsError && agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-10 h-10 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.25M9.75 7.5a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM3.888 19.128A9.012 9.012 0 013 13.5a9 9 0 0118 0c0 1.988-.643 3.827-1.734 5.322" />
                      </svg>
                      <p className="text-sm text-foreground-muted">No agents registered</p>
                      <p className="text-xs text-foreground-subtle">Register a new agent to get started with soulkey management.</p>
                    </div>
                  </td>
                </tr>
              )}
              {/* No results from filter */}
              {!agentsLoading && agents.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm text-foreground-muted">No agents match the current filters.</p>
                  </td>
                </tr>
              )}
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

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-foreground-muted">Loading agents...</div>}>
      <AgentsPageInner />
    </Suspense>
  );
}
