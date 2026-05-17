"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useWidgetData } from "@/lib/useWidgetData";
import { tenantName, timeAgo } from "@/lib/display";
import { api, ApiError, getStoredTenantId } from "@/lib/api";

/**
 * Agent fleet management (Wave H.2.d).
 *
 * Switched from "list of SoulKeys masquerading as agents" (W-H.1) to first-class
 * agents from /v1/agents, with SoulKeys correlated by persona_id. CRUD goes
 * through the new /api/agents/* and /api/prompts/* proxy routes shipped earlier
 * in this wave; SoulKey lifecycle ops (suspend/rotate/revoke) stay on the
 * /v1/soulauth/admin/keys endpoints from W-H.1 — those are credential ops, not
 * agent ops, and they apply per-key.
 */

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

/** Wire shape returned by GET /v1/agents (from crud_router.AgentResponse). */
interface AgentRow {
  id: string;
  tenant_id: string | null;
  persona_id: string;
  name: string;
  description: string | null;
  prompt_id: string | null;
  metadata: Record<string, unknown>;
  status: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

/** Wire shape returned by GET /v1/prompts. */
interface PromptRow {
  id: string;
  tenant_id: string | null;
  name: string;
  body: string;
  version: number;
  supersedes_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}

/** Wire shape returned by POST /v1/soulauth/admin/keys (and /rotate). */
interface IssueSoulkeyResponse {
  soulkey_id: string;
  raw_key: string;
  persona_id: string;
  tenant_id: string;
  status: string;
  issued_at: string | null;
  expires_at: string | null;
}

/** Wire shape returned by GET /v1/soulauth/admin/keys (via /api/soulauth/agents). */
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

const statusBadgeClass = (status: string): string => {
  const lower = status.toLowerCase();
  if (lower === "active") return "bg-green-500/15 text-green-400 border border-green-500/20";
  if (lower === "draft") return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20";
  if (lower === "archived") return "bg-gray-500/15 text-gray-400 border border-gray-500/20";
  return "bg-blue-500/15 text-blue-400 border border-blue-500/20";
};

const keyStatusBadgeClass = (status: string): string => {
  const lower = status.toLowerCase();
  if (lower === "active") return "bg-green-500/15 text-green-400 border border-green-500/20";
  if (lower === "suspended") return "bg-red-500/15 text-red-400 border border-red-500/20";
  if (lower === "revoked") return "bg-gray-500/15 text-gray-400 border border-gray-500/20";
  return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20";
};

// ---------------------------------------------------------------------------
// Policy panel (read-only; carried forward from W-H.1)
// ---------------------------------------------------------------------------

function PolicyPanel({
  tenantId,
  personaId,
  policy,
  loading,
  error,
}: {
  tenantId: string;
  personaId: string;
  policy: Record<string, unknown> | null | undefined;
  loading: boolean;
  error: string | null;
}) {
  const tenantShort = tenantId ? tenantId.slice(0, 8) : "?";
  return (
    <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
          Persona Policy <span className="text-foreground-subtle normal-case">(read-only)</span>
        </h4>
        <span className="text-[10px] text-foreground-subtle font-mono">
          tenant {tenantShort}... / persona {personaId}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-foreground-muted">
          <div className="w-3 h-3 border border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
          Loading policy from cache...
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && policy === null && (
        <div className="px-3 py-3 rounded-lg bg-navy-950 border border-white/5 text-xs text-foreground-muted">
          <p className="text-foreground">No cached policy for this persona.</p>
          <p className="mt-1 text-foreground-subtle">
            Persona policies are managed in git. Create one at
            <code className="mx-1 px-1.5 py-0.5 rounded bg-navy-800 text-teal-400 font-mono">
              policies/tenants/&lt;slug&gt;/personas/{personaId}.yaml
            </code>
            then trigger
            <code className="mx-1 px-1.5 py-0.5 rounded bg-navy-800 text-teal-400 font-mono">
              POST /v1/soulauth/admin/policy/sync
            </code>
            to load it into the cache.
          </p>
        </div>
      )}

      {!loading && !error && policy && (
        <pre className="text-[11px] leading-relaxed font-mono text-foreground bg-navy-950 rounded-lg p-3 border border-white/5 overflow-x-auto max-h-96 overflow-y-auto">
          {JSON.stringify(policy, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const expandParam = searchParams.get("expand");

  // --- list state ---
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const didAutoExpand = useRef(false);

  // Agents (first-class objects from /v1/agents)
  const {
    data: agentsData,
    loading: agentsLoading,
    error: agentsError,
    refetch: refetchAgents,
  } = useWidgetData<AgentRow[]>({
    endpoint: "/api/agents?include_global=true",
    refreshInterval: 30_000,
  });
  const agents = useMemo(() => agentsData ?? [], [agentsData]);

  // SoulKeys (joined by persona_id for the linked-keys list per agent)
  const {
    data: soulkeysData,
    loading: soulkeysLoading,
    refetch: refetchSoulkeys,
  } = useWidgetData<SoulkeyDetail[]>({
    endpoint: "/api/soulauth/agents?all=true",
    refreshInterval: 30_000,
  });
  const soulkeys = useMemo(() => soulkeysData ?? [], [soulkeysData]);

  // Active prompts (for the prompt-picker dropdown in the detail panel)
  const { data: promptsData, refetch: refetchPrompts } = useWidgetData<PromptRow[]>({
    endpoint: "/api/prompts?status=active&include_global=true",
    refreshInterval: 60_000,
  });
  const prompts = useMemo(() => promptsData ?? [], [promptsData]);

  // Build a persona_id → SoulKey[] index for the linked-keys section
  const keysByPersona = useMemo(() => {
    const map = new Map<string, SoulkeyDetail[]>();
    for (const k of soulkeys) {
      const list = map.get(k.persona_id) ?? [];
      list.push(k);
      map.set(k.persona_id, list);
    }
    return map;
  }, [soulkeys]);

  // Build a prompt_id → PromptRow index for the agent-list prompt-name column
  const promptsById = useMemo(() => {
    const m = new Map<string, PromptRow>();
    for (const p of prompts) m.set(p.id, p);
    return m;
  }, [prompts]);

  // --- create modal state ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPersona, setNewPersona] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPromptId, setNewPromptId] = useState<string>("");
  const [issueKey, setIssueKey] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // --- raw-key reveal modal (post-create or post-rotate) ---
  const [newRawKey, setNewRawKey] = useState<IssueSoulkeyResponse | null>(null);
  const [rawKeyCopied, setRawKeyCopied] = useState(false);
  const [rawKeyAction, setRawKeyAction] = useState<"created" | "rotated">("created");

  // --- per-key action states ---
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // --- per-agent edit state ---
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPromptId, setEditPromptId] = useState<string>("");
  const [savingAgent, setSavingAgent] = useState(false);
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<string | null>(null);

  // --- per-agent policy cache (lazy-loaded on expand) ---
  const [policyCache, setPolicyCache] = useState<Record<string, Record<string, unknown> | null>>({});
  const [policyLoading, setPolicyLoading] = useState<Record<string, boolean>>({});
  const [policyError, setPolicyError] = useState<Record<string, string | null>>({});
  const policyCacheRef = useRef(policyCache);
  const policyLoadingRef = useRef(policyLoading);
  useEffect(() => { policyCacheRef.current = policyCache; }, [policyCache]);
  useEffect(() => { policyLoadingRef.current = policyLoading; }, [policyLoading]);

  // Banner shown when ?expand=<id> filters the list
  const [expandFilter, setExpandFilter] = useState<string | null>(expandParam);

  // 404 refresh toast — shown briefly when any per-id fetch reports a cross-
  // tenant 404 (item was deleted by someone else or never existed for us).
  const [refreshToast, setRefreshToast] = useState<string | null>(null);
  const triggerRefreshToast = useCallback((msg: string) => {
    setRefreshToast(msg);
    setTimeout(() => setRefreshToast(null), 3500);
    refetchAgents();
    refetchSoulkeys();
    refetchPrompts();
  }, [refetchAgents, refetchSoulkeys, refetchPrompts]);

  const loadPolicyFor = useCallback(async (tenantId: string | null, personaId: string) => {
    if (!personaId) return;
    const tidKey = tenantId ?? "__global__";
    const key = `${tidKey}::${personaId}`;
    if (policyCacheRef.current[key] !== undefined || policyLoadingRef.current[key]) return;
    setPolicyLoading((prev) => ({ ...prev, [key]: true }));
    setPolicyError((prev) => ({ ...prev, [key]: null }));
    try {
      // Globals have no tenant policy to fetch; the SoulAuth endpoint requires a
      // concrete tenant_id, so for globals we just record "no policy" and move on.
      if (!tenantId) {
        setPolicyCache((prev) => ({ ...prev, [key]: null }));
        return;
      }
      const policy = await api.get<Record<string, unknown>>(
        `/v1/soulauth/admin/policy/current?tenant_id=${encodeURIComponent(tenantId)}&persona_id=${encodeURIComponent(personaId)}`,
      );
      setPolicyCache((prev) => ({ ...prev, [key]: policy }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setPolicyCache((prev) => ({ ...prev, [key]: null }));
      } else {
        setPolicyError((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : "Failed to load policy",
        }));
      }
    } finally {
      setPolicyLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  // Expand a row → seed edit form, kick off policy load
  const handleToggleExpand = useCallback((agent: AgentRow) => {
    if (expandedAgent === agent.id) {
      setExpandedAgent(null);
      setEditingAgent(null);
      return;
    }
    setExpandedAgent(agent.id);
    setEditingAgent(null);
    setEditName(agent.name);
    setEditDescription(agent.description ?? "");
    setEditPromptId(agent.prompt_id ?? "");
    loadPolicyFor(agent.tenant_id, agent.persona_id);
  }, [expandedAgent, loadPolicyFor]);

  // Auto-expand from ?expand=<id> query param
  useEffect(() => {
    if (!expandParam || didAutoExpand.current || agents.length === 0) return;
    const match = agents.find((a) => a.id === expandParam || a.persona_id === expandParam);
    if (match) {
      didAutoExpand.current = true;
      setExpandedAgent(match.id);
      setEditName(match.name);
      setEditDescription(match.description ?? "");
      setEditPromptId(match.prompt_id ?? "");
      loadPolicyFor(match.tenant_id, match.persona_id);
      requestAnimationFrame(() => {
        const el = document.getElementById(`agent-row-${match.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [expandParam, agents, loadPolicyFor]);

  // --- filter + sort ---
  const filtered = useMemo(() => {
    let list = agents.filter((a) => {
      const matchesSearch =
        !search ||
        a.persona_id.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "All" || a.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
    if (expandFilter) {
      const idx = list.findIndex((a) => a.id === expandFilter || a.persona_id === expandFilter);
      if (idx > 0) {
        const [match] = list.splice(idx, 1);
        list = [match, ...list];
      }
    }
    return list;
  }, [agents, search, statusFilter, expandFilter]);

  const counts = useMemo(() => ({
    all: agents.length,
    active: agents.filter((a) => a.status.toLowerCase() === "active").length,
  }), [agents]);

  // --- create flow (chained: agent + optional SoulKey) ---
  const resetCreateForm = () => {
    setNewPersona("");
    setNewName("");
    setNewDescription("");
    setNewPromptId("");
    setIssueKey(true);
    setCreateError(null);
  };

  const handleCreateAgent = async () => {
    if (!newPersona.trim() || creating) return;
    const tenantId = getStoredTenantId();
    if (!tenantId) {
      setCreateError("No tenant context — please re-authenticate.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // Step 1: create the agent row
      const agent = await api.post<AgentRow>("/api/agents", {
        persona_id: newPersona.trim(),
        name: (newName.trim() || newPersona.trim()),
        description: newDescription.trim() || null,
        prompt_id: newPromptId || null,
        metadata: {},
        status: "active",
      });

      // Step 2: optionally chain a SoulKey for the same persona_id
      if (issueKey) {
        try {
          const key = await api.post<IssueSoulkeyResponse>(
            "/v1/soulauth/admin/keys",
            {
              tenant_id: tenantId,
              persona_id: agent.persona_id,
              label: agent.name,
              metadata: { agent_id: agent.id },
            },
          );
          setNewRawKey(key);
          setRawKeyAction("created");
        } catch (err) {
          // Agent already exists at this point; surface the partial-failure but
          // don't roll back — the user can re-issue a key from the detail panel.
          setActionError(
            "Agent created, but SoulKey issuance failed: " +
              (err instanceof ApiError ? err.message : "unknown error"),
          );
        }
      }

      setShowCreateModal(false);
      resetCreateForm();
      refetchAgents();
      refetchSoulkeys();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  };

  const copyRawKey = () => {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey.raw_key);
    setRawKeyCopied(true);
    setTimeout(() => setRawKeyCopied(false), 2000);
  };

  // --- per-agent edit save ---
  const handleSaveAgent = async (agent: AgentRow) => {
    if (savingAgent) return;
    setSavingAgent(true);
    setActionError(null);
    try {
      await api.patch(`/api/agents/${agent.id}`, {
        name: editName,
        description: editDescription || null,
        prompt_id: editPromptId || null,
      });
      setEditingAgent(null);
      refetchAgents();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        triggerRefreshToast("Agent was deleted; refreshing list");
        setEditingAgent(null);
      } else {
        setActionError(err instanceof ApiError ? err.message : "Failed to save agent");
      }
    } finally {
      setSavingAgent(false);
    }
  };

  // --- delete (soft → archived) ---
  const handleDeleteAgent = async (id: string) => {
    setActionError(null);
    try {
      await api.delete(`/api/agents/${id}`);
      setDeleteConfirmAgent(null);
      setExpandedAgent(null);
      refetchAgents();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        triggerRefreshToast("Agent was deleted; refreshing list");
        setDeleteConfirmAgent(null);
      } else {
        setActionError(err instanceof ApiError ? err.message : "Failed to delete agent");
      }
    }
  };

  // --- per-SoulKey lifecycle (unchanged from H.1, just scoped to a key id) ---
  const handleSuspendKey = async (key: SoulkeyDetail) => {
    if (suspendingId) return;
    setSuspendingId(key.id);
    setActionError(null);
    try {
      if (key.status === "suspended") {
        await api.post(`/v1/soulauth/admin/keys/${key.id}/reinstate`);
      } else {
        await api.post(`/v1/soulauth/admin/keys/${key.id}/suspend`, {
          suspended_by: "portal-admin",
          reason: "Suspended via Agents page",
        });
      }
      refetchSoulkeys();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to suspend/reinstate key");
    } finally {
      setSuspendingId(null);
    }
  };

  const handleRotateKey = async (id: string) => {
    if (rotatingId) return;
    setRotatingId(id);
    setActionError(null);
    try {
      const resp = await api.post<IssueSoulkeyResponse>(
        `/v1/soulauth/admin/keys/${id}/rotate`,
      );
      setNewRawKey(resp);
      setRawKeyAction("rotated");
      refetchSoulkeys();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to rotate key");
    } finally {
      setRotatingId(null);
    }
  };

  const handleRevokeKey = async (id: string) => {
    setActionError(null);
    try {
      await api.post(`/v1/soulauth/admin/keys/${id}/revoke`, {
        revoked_by: "portal-admin",
        reason: "Revoked via Agents page",
      });
      setRevokeConfirmId(null);
      refetchSoulkeys();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to revoke key");
    }
  };

  // --- issue a new SoulKey for an existing agent (when none exists yet) ---
  const [issuingForAgent, setIssuingForAgent] = useState<string | null>(null);
  const handleIssueKeyForAgent = async (agent: AgentRow) => {
    if (issuingForAgent) return;
    const tenantId = getStoredTenantId();
    if (!tenantId) {
      setActionError("No tenant context — please re-authenticate.");
      return;
    }
    setIssuingForAgent(agent.id);
    setActionError(null);
    try {
      const key = await api.post<IssueSoulkeyResponse>(
        "/v1/soulauth/admin/keys",
        {
          tenant_id: tenantId,
          persona_id: agent.persona_id,
          label: agent.name,
          metadata: { agent_id: agent.id },
        },
      );
      setNewRawKey(key);
      setRawKeyAction("created");
      refetchSoulkeys();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to issue key");
    } finally {
      setIssuingForAgent(null);
    }
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
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
        >
          + Create Agent
        </button>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span className="text-sm text-red-300">{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 404 refresh toast */}
      <AnimatePresence>
        {refreshToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-4 py-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-sm text-teal-300"
          >
            {refreshToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search / Filter bar */}
      <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by persona or name..."
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
          {["All", "Active", "Draft", "Archived"].map((s) => (
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
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Persona</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Prompt</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Keys</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Tenant</th>
                <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((agent) => {
                  const isGlobal = agent.tenant_id === null;
                  const linkedKeys = keysByPersona.get(agent.persona_id) ?? [];
                  const promptName = agent.prompt_id
                    ? promptsById.get(agent.prompt_id)?.name ?? "(unknown)"
                    : "—";
                  return (
                    <React.Fragment key={agent.id}>
                      <motion.tr
                        id={`agent-row-${agent.id}`}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        onClick={() => handleToggleExpand(agent)}
                        className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all duration-200"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground font-medium">{agent.name}</span>
                            {isGlobal && (
                              <span
                                title="Global template (read-only)"
                                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-purple-500/15 text-purple-300 border border-purple-500/20"
                              >
                                Global
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground-muted font-mono text-xs">{agent.persona_id}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(agent.status)}`}>
                            {agent.status.toLowerCase() === "active" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            )}
                            {STATUS_LABELS[agent.status.toLowerCase()] ?? agent.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground-muted text-xs">{promptName}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-500/15 text-teal-400 border border-teal-500/20">
                            {linkedKeys.length}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground-muted text-xs" title={agent.tenant_id ?? "global"}>
                          {agent.tenant_id ? tenantName(agent.tenant_id) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleToggleExpand(agent)}
                              className="px-2 py-1 rounded text-xs text-teal-400 hover:bg-teal-500/10 transition-all duration-200"
                            >
                              {expandedAgent === agent.id ? "Hide" : "Details"}
                            </button>
                            {!isGlobal && agent.status !== "archived" && (
                              deleteConfirmAgent === agent.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDeleteAgent(agent.id)}
                                    className="px-2 py-1 rounded text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all duration-200"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmAgent(null)}
                                    className="px-2 py-1 rounded text-xs text-foreground-muted hover:bg-white/5 transition-all duration-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmAgent(agent.id)}
                                  className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition-all duration-200"
                                >
                                  Archive
                                </button>
                              )
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
                                  {isGlobal && (
                                    <div className="mb-4 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200">
                                      This is a global template (tenant_id IS NULL). Edits and deletes are blocked at the API layer.
                                      To customise it for your tenant, create a new agent with the same persona_id.
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Left: editable fields */}
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Agent Details</h4>
                                        {!isGlobal && (
                                          editingAgent === agent.id ? (
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={() => handleSaveAgent(agent)}
                                                disabled={savingAgent}
                                                className="px-2.5 py-1 rounded text-xs font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-all duration-200 disabled:opacity-50"
                                              >
                                                {savingAgent ? "Saving..." : "Save"}
                                              </button>
                                              <button
                                                onClick={() => setEditingAgent(null)}
                                                className="px-2.5 py-1 rounded text-xs text-foreground-muted hover:bg-white/5 transition-all duration-200"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                setEditingAgent(agent.id);
                                                setEditName(agent.name);
                                                setEditDescription(agent.description ?? "");
                                                setEditPromptId(agent.prompt_id ?? "");
                                              }}
                                              className="px-2.5 py-1 rounded text-xs text-teal-400 hover:bg-teal-500/10 transition-all duration-200"
                                            >
                                              Edit
                                            </button>
                                          )
                                        )}
                                      </div>

                                      <div>
                                        <label className="block text-[10px] uppercase tracking-wider text-foreground-subtle mb-1">Name</label>
                                        {editingAgent === agent.id ? (
                                          <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-navy-900 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                                          />
                                        ) : (
                                          <p className="text-sm text-foreground">{agent.name}</p>
                                        )}
                                      </div>

                                      <div>
                                        <label className="block text-[10px] uppercase tracking-wider text-foreground-subtle mb-1">Description</label>
                                        {editingAgent === agent.id ? (
                                          <textarea
                                            value={editDescription}
                                            onChange={(e) => setEditDescription(e.target.value)}
                                            rows={2}
                                            className="w-full px-3 py-2 rounded-lg bg-navy-900 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200 resize-none"
                                          />
                                        ) : (
                                          <p className="text-sm text-foreground-muted">{agent.description || <span className="text-foreground-subtle italic">none</span>}</p>
                                        )}
                                      </div>

                                      <div>
                                        <label className="block text-[10px] uppercase tracking-wider text-foreground-subtle mb-1">Prompt</label>
                                        {editingAgent === agent.id ? (
                                          <select
                                            value={editPromptId}
                                            onChange={(e) => setEditPromptId(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-navy-900 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                                          >
                                            <option value="">— none —</option>
                                            {prompts.map((p) => (
                                              <option key={p.id} value={p.id}>
                                                {p.name} (v{p.version}){p.tenant_id === null ? " — global" : ""}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <p className="text-sm text-foreground-muted">
                                            {agent.prompt_id ? (
                                              <span className="font-mono">{promptsById.get(agent.prompt_id)?.name ?? agent.prompt_id.slice(0, 8) + "..."}</span>
                                            ) : (
                                              <span className="text-foreground-subtle italic">none</span>
                                            )}
                                          </p>
                                        )}
                                      </div>

                                      <div>
                                        <label className="block text-[10px] uppercase tracking-wider text-foreground-subtle mb-1">Agent ID</label>
                                        <p className="font-mono text-[11px] text-foreground-muted break-all">{agent.id}</p>
                                      </div>
                                    </div>

                                    {/* Right: linked SoulKeys */}
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Linked SoulKeys ({linkedKeys.length})</h4>
                                        {!isGlobal && (
                                          <button
                                            onClick={() => handleIssueKeyForAgent(agent)}
                                            disabled={issuingForAgent === agent.id}
                                            className="px-2.5 py-1 rounded text-xs font-medium text-gold-400 hover:bg-gold-500/10 transition-all duration-200 disabled:opacity-50"
                                          >
                                            {issuingForAgent === agent.id ? "Issuing..." : "+ Issue Key"}
                                          </button>
                                        )}
                                      </div>

                                      {linkedKeys.length === 0 && (
                                        <p className="text-xs text-foreground-subtle italic px-3 py-3 rounded-lg bg-navy-950 border border-white/5">
                                          No SoulKeys for this persona yet.
                                          {!isGlobal && " Click + Issue Key to create one."}
                                        </p>
                                      )}

                                      <div className="space-y-2">
                                        {linkedKeys.map((k) => (
                                          <div
                                            key={k.id}
                                            className="px-3 py-2 rounded-lg bg-navy-950 border border-white/5 space-y-1.5"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-mono text-[11px] text-teal-400 break-all">
                                                {k.id.slice(0, 8)}...
                                              </span>
                                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${keyStatusBadgeClass(k.status)}`}>
                                                {k.status}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-[10px] text-foreground-subtle">
                                              <span>{k.label || "—"}</span>
                                              <span>last used {timeAgo(k.last_used_at)}</span>
                                            </div>
                                            {k.status !== "revoked" && (
                                              <div className="flex items-center gap-1.5 pt-1">
                                                <button
                                                  onClick={() => handleSuspendKey(k)}
                                                  disabled={suspendingId === k.id}
                                                  className={`px-2 py-0.5 rounded text-[10px] transition-all duration-200 disabled:opacity-50 ${
                                                    k.status === "suspended"
                                                      ? "text-green-400 hover:bg-green-500/10"
                                                      : "text-yellow-400 hover:bg-yellow-500/10"
                                                  }`}
                                                >
                                                  {k.status === "suspended" ? "Unsuspend" : "Suspend"}
                                                </button>
                                                <button
                                                  onClick={() => handleRotateKey(k.id)}
                                                  disabled={rotatingId === k.id}
                                                  className="px-2 py-0.5 rounded text-[10px] text-gold-400 hover:bg-gold-500/10 transition-all duration-200 disabled:opacity-50"
                                                >
                                                  {rotatingId === k.id ? "Rotating..." : "Rotate"}
                                                </button>
                                                {revokeConfirmId === k.id ? (
                                                  <div className="flex items-center gap-1">
                                                    <button
                                                      onClick={() => handleRevokeKey(k.id)}
                                                      className="px-2 py-0.5 rounded text-[10px] text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all duration-200"
                                                    >
                                                      Confirm
                                                    </button>
                                                    <button
                                                      onClick={() => setRevokeConfirmId(null)}
                                                      className="px-2 py-0.5 rounded text-[10px] text-foreground-muted hover:bg-white/5 transition-all duration-200"
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <button
                                                    onClick={() => setRevokeConfirmId(k.id)}
                                                    className="px-2 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-500/10 transition-all duration-200"
                                                  >
                                                    Revoke
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Persona policy (carried from H.1, read-only) */}
                                  <PolicyPanel
                                    tenantId={agent.tenant_id ?? ""}
                                    personaId={agent.persona_id}
                                    policy={policyCache[`${agent.tenant_id ?? "__global__"}::${agent.persona_id}`]}
                                    loading={!!policyLoading[`${agent.tenant_id ?? "__global__"}::${agent.persona_id}`]}
                                    error={policyError[`${agent.tenant_id ?? "__global__"}::${agent.persona_id}`] ?? null}
                                  />
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </AnimatePresence>

              {/* Loading state */}
              {(agentsLoading || soulkeysLoading) && agents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
                      <p className="text-sm text-foreground-muted">Loading agents...</p>
                    </div>
                  </td>
                </tr>
              )}

              {/* Error state */}
              {agentsError && agents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
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
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-10 h-10 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.25M9.75 7.5a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM3.888 19.128A9.012 9.012 0 013 13.5a9 9 0 0118 0c0 1.988-.643 3.827-1.734 5.322" />
                      </svg>
                      <p className="text-sm text-foreground-muted">No agents yet</p>
                      <p className="text-xs text-foreground-subtle">Click + Create Agent to register your first one.</p>
                    </div>
                  </td>
                </tr>
              )}

              {/* No filter results */}
              {!agentsLoading && agents.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm text-foreground-muted">No agents match the current filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Agent Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
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
                  <h2 className="text-lg font-semibold text-foreground">Create Agent</h2>
                  <button
                    onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                    className="text-foreground-subtle hover:text-foreground transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Persona ID *</label>
                    <input
                      type="text"
                      value={newPersona}
                      onChange={(e) => setNewPersona(e.target.value)}
                      placeholder="e.g. alfred"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 font-mono"
                    />
                    <p className="text-[10px] text-foreground-subtle mt-1">Natural key joining the agent to SoulKeys and persona policies. Unique per tenant.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Display Name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={newPersona || "Falls back to persona ID"}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                    />
                  </div>

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

                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Prompt (optional)</label>
                    <select
                      value={newPromptId}
                      onChange={(e) => setNewPromptId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                    >
                      <option value="">— none (attach later) —</option>
                      {prompts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (v{p.version}){p.tenant_id === null ? " — global" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-foreground-subtle mt-1">
                      Manage prompts at <a href="/dashboard/prompts" className="underline text-teal-400 hover:text-teal-300">Dashboard → Prompts</a>.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-navy-800 border border-white/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={issueKey}
                      onChange={(e) => setIssueKey(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm text-foreground font-medium">Also issue a SoulKey for this agent</p>
                      <p className="text-[10px] text-foreground-subtle mt-0.5">Recommended. The raw key is shown once and cannot be recovered.</p>
                    </div>
                  </label>

                  {createError && (
                    <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                      {createError}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button
                    onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                    className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAgent}
                    disabled={!newPersona.trim() || creating}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {creating ? "Creating..." : "Create Agent"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Raw-key reveal modal (post-create / post-rotate) */}
      <AnimatePresence>
        {newRawKey && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-lg border border-gold-500/30 shadow-2xl shadow-black/50">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">
                    {rawKeyAction === "rotated" ? "Key Rotated" : "SoulKey Issued"}
                  </h2>
                  <p className="text-xs text-foreground-muted mt-1">
                    Persona: <span className="font-mono text-teal-400">{newRawKey.persona_id}</span>
                  </p>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
                    <p className="text-xs font-semibold text-amber-300">Save this key now</p>
                    <p className="text-[11px] text-amber-400/80 mt-0.5">
                      This raw SoulKey is shown exactly once. It is hashed with SHA-512 server-side and cannot be recovered.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Raw SoulKey</label>
                    <div className="flex items-stretch gap-2">
                      <code className="flex-1 font-mono text-xs text-teal-400 break-all bg-navy-950 rounded-lg p-3 border border-white/5">
                        {newRawKey.raw_key}
                      </code>
                      <button
                        onClick={copyRawKey}
                        className="px-3 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-xs font-medium hover:text-foreground transition-all duration-200"
                      >
                        {rawKeyCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-foreground-subtle uppercase tracking-wider text-[10px]">SoulKey ID</p>
                      <p className="font-mono text-foreground-muted truncate" title={newRawKey.soulkey_id}>{newRawKey.soulkey_id}</p>
                    </div>
                    <div>
                      <p className="text-foreground-subtle uppercase tracking-wider text-[10px]">Status</p>
                      <p className="font-mono text-foreground-muted">{newRawKey.status}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button
                    onClick={() => { setNewRawKey(null); setRawKeyCopied(false); }}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
                  >
                    I&apos;ve saved it
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
