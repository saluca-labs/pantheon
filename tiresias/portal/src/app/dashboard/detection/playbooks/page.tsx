"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { BookOpen, CheckCircle, XCircle, Clock, Shield, Plus, Pencil, X, Loader2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import { getStoredSoulKey, getStoredTenantId } from "@/lib/api";

/** Detection playbooks -- automated response playbook management. Uses live API via useWidgetData. */

interface PlaybookSummary {
  id: string;
  name: string;
  description: string;
  severity_threshold: string;
  cooldown_minutes: number;
  requires_approval: boolean;
  enabled: boolean;
  trigger_rules: string[];
}

interface PlaybookAction {
  type: string;
  params?: Record<string, unknown>;
}

interface PlaybookDetail extends PlaybookSummary {
  actions: PlaybookAction[];
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-of-error/20 text-of-error border border-of-error/30",
  high: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  medium: "bg-warning/15 text-warning border border-warning/20",
  low: "bg-of-on-surface-variant/10 text-of-on-surface-variant border border-of-outline-variant/20",
};

const DEFAULT_PLAYBOOK_YAML = `name: My Playbook
description: What this playbook does
severity_threshold: high
cooldown_minutes: 15
requires_approval: true
trigger_rules:
  - rule_id_1
actions:
  - type: notify_slack
    params:
      channel: "#security-alerts"
  - type: quarantine_agent
`;

/** Build a YAML string from a PlaybookDetail object. */
function playbookToYaml(pb: PlaybookDetail): string {
  const lines: string[] = [];
  lines.push(`name: ${pb.name}`);
  lines.push(`description: ${pb.description}`);
  lines.push(`severity_threshold: ${pb.severity_threshold}`);
  lines.push(`cooldown_minutes: ${pb.cooldown_minutes}`);
  lines.push(`requires_approval: ${pb.requires_approval}`);
  lines.push(`enabled: ${pb.enabled}`);
  if (pb.trigger_rules.length > 0) {
    lines.push("trigger_rules:");
    for (const r of pb.trigger_rules) {
      lines.push(`  - ${r}`);
    }
  } else {
    lines.push("trigger_rules: []");
  }
  if (pb.actions && pb.actions.length > 0) {
    lines.push("actions:");
    for (const action of pb.actions) {
      lines.push(`  - type: ${action.type}`);
      if (action.params && Object.keys(action.params).length > 0) {
        lines.push("    params:");
        for (const [k, v] of Object.entries(action.params)) {
          const val = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
          lines.push(`      ${k}: ${val}`);
        }
      }
    }
  } else {
    lines.push("actions: []");
  }
  return lines.join("\n") + "\n";
}

/** Helper: send YAML body with auth headers. */
async function yamlFetch(url: string, method: "POST" | "PUT", body: string) {
  const headers: Record<string, string> = { "Content-Type": "text/plain" };
  const soulkey = getStoredSoulKey();
  const tenantId = getStoredTenantId();
  if (soulkey) {
    headers["Authorization"] = `Bearer ${soulkey}`;
    headers["X-SoulKey"] = soulkey;
  }
  if (tenantId) {
    headers["X-Tenant-ID"] = tenantId;
  }
  const res = await fetch(url, { method, headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res;
}

export default function PlaybooksPage() {
  const { data: playbooksData, loading, error, refetch } = useWidgetData<PlaybookSummary[]>({
    endpoint: "/api/watch/v1/playbooks",
    refreshInterval: 60000,
  });

  const playbooks: PlaybookSummary[] = Array.isArray(playbooksData) ? playbooksData : [];

  // Expand / detail state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playbookDetail, setPlaybookDetail] = useState<Record<string, PlaybookDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createYaml, setCreateYaml] = useState(DEFAULT_PLAYBOOK_YAML);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal
  const [editPlaybook, setEditPlaybook] = useState<PlaybookDetail | null>(null);
  const [editYaml, setEditYaml] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Toast
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Fetch playbook detail
  async function fetchDetail(id: string) {
    if (playbookDetail[id]) return playbookDetail[id];
    setDetailLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const { api } = await import("@/lib/api");
      const detail = await api.get<PlaybookDetail>(`/api/watch/v1/playbooks/${id}`);
      setPlaybookDetail((prev) => ({ ...prev, [id]: detail }));
      return detail;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message: `Failed to load playbook detail: ${message}` });
      return null;
    } finally {
      setDetailLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  // Toggle expand
  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!playbookDetail[id]) {
      await fetchDetail(id);
    }
  }

  // Create playbook
  async function handleCreate() {
    if (!createYaml.trim()) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
      await yamlFetch(`${baseUrl}/api/watch/v1/playbooks`, "POST", createYaml);
      setActionResult({ type: "success", message: "Playbook created successfully." });
      setShowCreateModal(false);
      setCreateYaml(DEFAULT_PLAYBOOK_YAML);
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setCreateError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Open edit modal
  async function openEditModal(pb: PlaybookSummary) {
    setEditError(null);
    let detail = playbookDetail[pb.id];
    if (!detail) {
      detail = (await fetchDetail(pb.id)) as PlaybookDetail;
      if (!detail) return;
    }
    setEditPlaybook(detail);
    setEditYaml(playbookToYaml(detail));
  }

  // Save edited playbook
  async function handleEditSave() {
    if (!editPlaybook || !editYaml.trim()) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
      await yamlFetch(`${baseUrl}/api/watch/v1/playbooks/${editPlaybook.id}`, "PUT", editYaml);
      // Invalidate cache
      setPlaybookDetail((prev) => {
        const next = { ...prev };
        delete next[editPlaybook.id];
        return next;
      });
      setActionResult({ type: "success", message: `Playbook "${editPlaybook.name}" updated.` });
      setEditPlaybook(null);
      setEditYaml("");
      refetch();
      if (expandedId === editPlaybook.id) {
        await fetchDetail(editPlaybook.id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setEditError(message);
    } finally {
      setEditSubmitting(false);
    }
  }

  // Toggle enabled/disabled — sends the FULL playbook YAML with enabled flipped
  async function handleToggle(pb: PlaybookSummary) {
    try {
      // Fetch full detail so we can send a complete YAML body (not just the enabled field)
      let detail = playbookDetail[pb.id];
      if (!detail) {
        detail = (await fetchDetail(pb.id)) as PlaybookDetail;
        if (!detail) {
          setActionResult({ type: "error", message: "Could not load playbook detail for toggle." });
          return;
        }
      }
      const toggled: PlaybookDetail = { ...detail, enabled: !pb.enabled };
      const fullYaml = playbookToYaml(toggled);
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
      await yamlFetch(
        `${baseUrl}/api/watch/v1/playbooks/${pb.id}`,
        "PUT",
        fullYaml,
      );
      setActionResult({
        type: "success",
        message: `Playbook "${pb.name}" ${!pb.enabled ? "enabled" : "disabled"}.`,
      });
      // Invalidate detail cache
      setPlaybookDetail((prev) => {
        const next = { ...prev };
        delete next[pb.id];
        return next;
      });
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message });
    }
  }

  return (
    <TierGate requiredTier="pro" featureLabel="Response Playbooks">
    <div className="max-w-7xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-of-on-surface">Response Playbooks</h1>
          <p className="text-[11px] text-of-on-surface-variant mt-0.5">
            Configured automated response workflows
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold"
        >
          <Plus className="h-3.5 w-3.5" />
          New Playbook
        </button>
      </div>

      {/* Action result toast */}
      {actionResult && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border ${
            actionResult.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-of-error/10 border-of-error/20 text-of-error"
          }`}
        >
          <span className="text-sm font-medium">{actionResult.message}</span>
          <button onClick={() => setActionResult(null)} className="ml-4 hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-of-error/10 border border-of-error/20 text-of-error text-sm">
          Failed to load playbooks: {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && playbooks.length === 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 flex flex-col items-center justify-center py-16 text-of-on-surface-variant gap-3">
          <BookOpen className="h-8 w-8 opacity-30" />
          <p className="text-sm">No playbooks configured</p>
        </div>
      )}

      {/* Playbook cards */}
      {!loading && playbooks.length > 0 && (
        <div className="space-y-3">
          {playbooks.map((pb) => (
            <div
              key={pb.id}
              className={`bg-of-surface-container rounded-xl border border-of-outline-variant/5 ${
                !pb.enabled ? "opacity-50" : ""
              }`}
            >
              {/* Clickable card body */}
              <div
                className="p-5 cursor-pointer hover:bg-of-surface-container-high/30 transition-colors rounded-xl"
                onClick={() => handleExpand(pb.id)}
              >
                {/* Playbook header row */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-of-primary/10 shrink-0">
                      <BookOpen className="h-4 w-4 text-of-primary" />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-of-on-surface-variant shrink-0">
                        {expandedId === pb.id ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-of-on-surface">{pb.name}</p>
                        <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">{pb.id}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle enabled */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(pb);
                      }}
                      title={pb.enabled ? "Disable playbook" : "Enable playbook"}
                      className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
                    >
                      {pb.enabled ? (
                        <ToggleRight className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    {/* Enabled badge */}
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      pb.enabled
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                        : "bg-of-outline-variant/10 text-of-on-surface-variant border-of-outline-variant/20"
                    }`}>
                      {pb.enabled ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                      {pb.enabled ? "Enabled" : "Disabled"}
                    </span>
                    {/* Severity threshold */}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      SEVERITY_STYLES[pb.severity_threshold] ?? SEVERITY_STYLES.low
                    }`}>
                      {pb.severity_threshold}
                    </span>
                  </div>
                </div>

                {/* Description (truncated in collapsed view) */}
                {pb.description && (
                  <p className={`text-xs text-of-on-surface-variant mb-4 ${expandedId !== pb.id ? "line-clamp-2" : ""}`}>
                    {pb.description}
                  </p>
                )}

                {/* Metadata row */}
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-of-on-surface-variant" />
                    <span className="text-xs text-of-on-surface-variant">
                      Cooldown: <span className="text-of-on-surface font-bold">{pb.cooldown_minutes}m</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-of-on-surface-variant" />
                    <span className="text-xs text-of-on-surface-variant">
                      Approval:{" "}
                      <span className={`font-bold ${pb.requires_approval ? "text-warning" : "text-emerald-400"}`}>
                        {pb.requires_approval ? "Required" : "Not required"}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Trigger rules */}
                {pb.trigger_rules.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">
                      Trigger Rules
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {pb.trigger_rules.map((ruleId) => (
                        <span
                          key={ruleId}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-of-surface-container-high border border-of-outline-variant/10 text-of-on-surface-variant"
                        >
                          {ruleId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {pb.trigger_rules.length === 0 && (
                  <p className="text-[10px] text-of-on-surface-variant italic">No trigger rules configured</p>
                )}
              </div>

              {/* Expanded detail panel */}
              {expandedId === pb.id && (
                <div className="border-t border-of-outline-variant/10 px-5 py-4 space-y-4 bg-of-surface-container-low rounded-b-xl">
                  {detailLoading[pb.id] && (
                    <div className="flex items-center gap-2 text-of-on-surface-variant text-xs">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading playbook details...
                    </div>
                  )}

                  {!detailLoading[pb.id] && playbookDetail[pb.id] && (
                    <>
                      {/* Actions */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">
                          Actions
                        </p>
                        {playbookDetail[pb.id].actions.length === 0 && (
                          <p className="text-xs text-of-on-surface-variant italic">No actions configured</p>
                        )}
                        {playbookDetail[pb.id].actions.length > 0 && (
                          <div className="space-y-2">
                            {playbookDetail[pb.id].actions.map((action, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-2 bg-of-surface-container rounded-lg border border-of-outline-variant/10"
                              >
                                <p className="text-xs font-bold text-of-on-surface">{action.type}</p>
                                {action.params && Object.keys(action.params).length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-3">
                                    {Object.entries(action.params).map(([k, v]) => (
                                      <div key={k} className="flex gap-1.5 text-[11px] font-mono">
                                        <span className="text-of-primary">{k}:</span>
                                        <span className="text-of-on-surface">
                                          {typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Full detail summary */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                            Severity Threshold
                          </p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            SEVERITY_STYLES[playbookDetail[pb.id].severity_threshold] ?? SEVERITY_STYLES.low
                          }`}>
                            {playbookDetail[pb.id].severity_threshold}
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                            Cooldown
                          </p>
                          <p className="text-xs text-of-on-surface font-bold">{playbookDetail[pb.id].cooldown_minutes} minutes</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                            Approval
                          </p>
                          <p className={`text-xs font-bold ${playbookDetail[pb.id].requires_approval ? "text-warning" : "text-emerald-400"}`}>
                            {playbookDetail[pb.id].requires_approval ? "Required" : "Not required"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                            Status
                          </p>
                          <p className={`text-xs font-bold ${playbookDetail[pb.id].enabled ? "text-emerald-400" : "text-of-on-surface-variant"}`}>
                            {playbookDetail[pb.id].enabled ? "Enabled" : "Disabled"}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Edit button */}
                  <div className="pt-1">
                    <button
                      onClick={() => openEditModal(pb)}
                      className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit Playbook
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create playbook modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-of-surface-container rounded-2xl border border-of-outline-variant/20 p-6 w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-of-primary" />
                <h2 className="text-base font-bold text-of-on-surface">New Playbook</h2>
              </div>
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(null); }}
                className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                Playbook YAML
              </label>
              <textarea
                value={createYaml}
                onChange={(e) => setCreateYaml(e.target.value)}
                rows={18}
                className="w-full px-3 py-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 resize-y"
                spellCheck={false}
              />
            </div>

            {createError && (
              <div className="mt-3 p-3 rounded-lg bg-of-error/10 border border-of-error/20 text-of-error text-xs font-mono">
                {createError}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(null); }}
                className="px-4 h-9 rounded-lg text-sm font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !createYaml.trim()}
                className="px-4 h-9 rounded-lg text-sm font-bold bg-of-primary/20 text-of-primary border border-of-primary/20 hover:bg-of-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Creating..." : "Create Playbook"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit playbook modal */}
      {editPlaybook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-of-surface-container rounded-2xl border border-of-outline-variant/20 p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-of-primary" />
                <h2 className="text-base font-bold text-of-on-surface">Edit Playbook</h2>
              </div>
              <button
                onClick={() => { setEditPlaybook(null); setEditYaml(""); setEditError(null); }}
                className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                Playbook YAML
              </label>
              <textarea
                value={editYaml}
                onChange={(e) => setEditYaml(e.target.value)}
                rows={18}
                className="w-full px-3 py-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 resize-y"
                spellCheck={false}
              />
            </div>

            {editError && (
              <div className="mt-3 p-3 rounded-lg bg-of-error/10 border border-of-error/20 text-of-error text-xs font-mono">
                {editError}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => { setEditPlaybook(null); setEditYaml(""); setEditError(null); }}
                className="px-4 h-9 rounded-lg text-sm font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSubmitting || !editYaml.trim()}
                className="px-4 h-9 rounded-lg text-sm font-bold bg-of-primary/20 text-of-primary border border-of-primary/20 hover:bg-of-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </TierGate>
  );
}
