"use client";

import React, { useState, useMemo, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWidgetData } from "@/lib/useWidgetData";
import { api, ApiError } from "@/lib/api";

/**
 * Prompts management (Wave H.2.d).
 *
 * Two-column layout:
 *   LEFT  — list of prompts (filter by status; toggle archived/deprecated)
 *   RIGHT — detail panel: body preview (read-only by default), Edit mode
 *           creates a NEW version via POST /api/prompts/{id}/versions
 *           (prompts are append-only — direct body edits are not allowed)
 *
 * Version history is rendered as an accordion in the right panel. All
 * rows sharing a `name` form a supersession chain, ordered by version desc.
 * Clicking an old version loads its body into the preview pane.
 */

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

const statusBadgeClass = (status: string): string => {
  const lower = status.toLowerCase();
  if (lower === "active") return "bg-green-500/15 text-green-400 border border-green-500/20";
  if (lower === "draft") return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20";
  if (lower === "deprecated") return "bg-gray-500/15 text-gray-400 border border-gray-500/20";
  return "bg-blue-500/15 text-blue-400 border border-blue-500/20";
};

function PromptsPageInner() {
  const [showArchived, setShowArchived] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);

  // Pull all prompts in the visible status set. We don't paginate yet —
  // the H.2.c backend has no opinion on list size and tenants are
  // expected to have < 100 prompts in practice.
  const statusParam = showArchived ? "" : "status=active";
  const endpoint = statusParam
    ? `/api/prompts?${statusParam}&include_global=true`
    : "/api/prompts?include_global=true";
  const {
    data: promptsData,
    loading: promptsLoading,
    error: promptsError,
    refetch: refetchPrompts,
  } = useWidgetData<PromptRow[]>({
    endpoint,
    refreshInterval: 60_000,
  });
  const prompts = useMemo(() => promptsData ?? [], [promptsData]);

  // Build a "head row per name" view — the highest-version row in each
  // supersession chain. This is what the LEFT list shows.
  const heads = useMemo(() => {
    const byName = new Map<string, PromptRow>();
    for (const p of prompts) {
      const existing = byName.get(p.name);
      if (!existing || p.version > existing.version) {
        byName.set(p.name, p);
      }
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [prompts]);

  // Resolve the effective selection: explicit user choice if still in the
  // list, otherwise fall back to the first head. Computing this inline lets
  // us avoid an effect that calls setSelectedPromptId (which lints as a
  // cascading render under the new react-hooks/set-state-in-effect rule).
  const selectedHead = useMemo(
    () => heads.find((p) => p.id === selectedPromptId) ?? heads[0] ?? null,
    [heads, selectedPromptId],
  );
  const selectedVersions = useMemo(() => {
    if (!selectedHead) return [];
    return prompts
      .filter((p) => p.name === selectedHead.name && p.tenant_id === selectedHead.tenant_id)
      .sort((a, b) => b.version - a.version);
  }, [prompts, selectedHead]);

  // --- editing state (edits create a new version, not in place) ---
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Which specific version row to display in the body preview. Defaults to
  // the head; clicking an older row in the history flips this.
  const [visibleVersionId, setVisibleVersionId] = useState<string | null>(null);
  const visibleVersion = useMemo(
    () => selectedVersions.find((p) => p.id === visibleVersionId) ?? selectedHead,
    [selectedVersions, visibleVersionId, selectedHead],
  );

  // Wrap setSelectedPromptId so callers also reset visible-version + editor
  // state in a single action.
  const selectPrompt = useCallback((id: string | null) => {
    setSelectedPromptId(id);
    setVisibleVersionId(null);
    setEditing(false);
    setEditBody("");
  }, []);

  // --- create modal ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // --- 404 refresh handling (item deleted by someone else) ---
  const [refreshToast, setRefreshToast] = useState<string | null>(null);
  const triggerRefreshToast = useCallback((msg: string) => {
    setRefreshToast(msg);
    setTimeout(() => setRefreshToast(null), 3500);
    refetchPrompts();
    selectPrompt(null);
  }, [refetchPrompts, selectPrompt]);

  const handleEdit = () => {
    if (!visibleVersion || !selectedHead) return;
    // Start the edit from the CURRENT head body, not the historical version
    // we're previewing — that's the row a new version will supersede.
    setEditing(true);
    setEditBody(selectedHead.body);
  };

  const handleSaveAsNewVersion = async () => {
    if (!selectedHead || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.post(`/api/prompts/${selectedHead.id}/versions`, {
        body: editBody,
      });
      setEditing(false);
      setEditBody("");
      refetchPrompts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        triggerRefreshToast("Prompt was deleted; refreshing list");
      } else if (err instanceof ApiError && err.status === 403) {
        setActionError("This is a global prompt and cannot be edited via this UI.");
      } else {
        setActionError(err instanceof ApiError ? err.message : "Failed to save new version");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedHead) return;
    setActionError(null);
    try {
      await api.delete(`/api/prompts/${selectedHead.id}`);
      refetchPrompts();
      selectPrompt(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        triggerRefreshToast("Prompt was deleted; refreshing list");
      } else if (err instanceof ApiError && err.status === 403) {
        setActionError("This is a global prompt and cannot be archived via this UI.");
      } else {
        setActionError(err instanceof ApiError ? err.message : "Failed to archive prompt");
      }
    }
  };

  const handleActivate = async () => {
    if (!selectedHead) return;
    setActionError(null);
    try {
      await api.patch(`/api/prompts/${selectedHead.id}`, { status: "active" });
      refetchPrompts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        triggerRefreshToast("Prompt was deleted; refreshing list");
      } else if (err instanceof ApiError && err.status === 403) {
        setActionError("This is a global prompt and cannot be modified via this UI.");
      } else {
        setActionError(err instanceof ApiError ? err.message : "Failed to activate prompt");
      }
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newBody.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.post<PromptRow>("/api/prompts", {
        name: newName.trim(),
        body: newBody,
        status: "active",
      });
      setShowCreateModal(false);
      setNewName("");
      setNewBody("");
      refetchPrompts();
      // Select the newly-created prompt so the user lands on its detail
      selectPrompt(created.id);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create prompt");
    } finally {
      setCreating(false);
    }
  };

  const isSelectedGlobal = selectedHead?.tenant_id === null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Prompts</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold-500/15 text-gold-400 border border-gold-500/20">
            {heads.length} prompts
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show drafts &amp; deprecated
          </label>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
          >
            + New Prompt
          </button>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <span className="text-sm text-red-300">{actionError}</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: list */}
        <div className="lg:col-span-4 glass-card rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Prompts</h3>
          </div>
          <div className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto scrollbar-thin">
            {promptsLoading && heads.length === 0 && (
              <div className="px-4 py-8 text-center">
                <div className="w-6 h-6 mx-auto border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
                <p className="text-xs text-foreground-muted mt-3">Loading prompts...</p>
              </div>
            )}

            {promptsError && heads.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-red-400">
                {promptsError}
              </div>
            )}

            {!promptsLoading && !promptsError && heads.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-foreground-muted">
                <p>No prompts yet.</p>
                <p className="mt-1 text-foreground-subtle">Create one to use with your agents.</p>
              </div>
            )}

            {heads.map((p) => {
              const isSelected = selectedPromptId === p.id;
              const isGlobal = p.tenant_id === null;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPrompt(p.id)}
                  className={`w-full text-left px-4 py-3 transition-all duration-200 ${
                    isSelected
                      ? "bg-gold-500/10 border-l-2 border-gold-500"
                      : "hover:bg-white/[0.03] border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground font-medium truncate">{p.name}</span>
                    {isGlobal && (
                      <span
                        title="Global template (read-only)"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-purple-500/15 text-purple-300 border border-purple-500/20"
                      >
                        Global
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(p.status)}`}>
                      {p.status}
                    </span>
                    <span className="text-[10px] text-foreground-subtle font-mono">v{p.version}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: detail panel */}
        <div className="lg:col-span-8 glass-card rounded-xl overflow-hidden">
          {!selectedHead && (
            <div className="px-4 py-12 text-center text-foreground-muted">
              {heads.length === 0
                ? "No prompts yet. Create one to use with your agents."
                : "Select a prompt from the list to view its body and history."}
            </div>
          )}

          {selectedHead && visibleVersion && (
            <>
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-foreground">{selectedHead.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(selectedHead.status)}`}>
                    {selectedHead.status}
                  </span>
                  {isSelectedGlobal && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-purple-500/15 text-purple-300 border border-purple-500/20">
                      Global (read-only)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={handleSaveAsNewVersion}
                        disabled={saving || !editBody.trim()}
                        className="px-3 py-1.5 rounded-lg bg-gold-500 text-navy-950 text-xs font-semibold hover:bg-gold-400 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving v" + (selectedHead.version + 1) + "..." : "Save as v" + (selectedHead.version + 1)}
                      </button>
                      <button
                        onClick={() => { setEditing(false); setEditBody(""); }}
                        className="px-3 py-1.5 rounded-lg bg-navy-700 border border-white/10 text-xs text-foreground-muted hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {!isSelectedGlobal && selectedHead.status === "draft" && (
                        <button
                          onClick={handleActivate}
                          className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
                        >
                          Activate
                        </button>
                      )}
                      {!isSelectedGlobal && (
                        <button
                          onClick={handleEdit}
                          className="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-xs font-medium text-teal-400 hover:bg-teal-500/20 transition-colors"
                        >
                          Edit (new version)
                        </button>
                      )}
                      {!isSelectedGlobal && selectedHead.status !== "deprecated" && (
                        <button
                          onClick={handleArchive}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          Archive
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="px-4 py-4 space-y-4">
                {/* Body preview / editor */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider text-foreground-subtle">
                      {editing ? "New version body" : `Body — v${visibleVersion.version}`}
                    </span>
                    {!editing && visibleVersion.id !== selectedHead.id && (
                      <span className="text-[10px] text-amber-300">previewing historical version</span>
                    )}
                  </div>
                  {editing ? (
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={18}
                      className="w-full px-3 py-2.5 rounded-lg bg-navy-950 border border-white/10 text-sm text-foreground font-mono focus:outline-none focus:border-gold-500/50 transition-all duration-200 resize-y leading-relaxed"
                    />
                  ) : (
                    <pre className="px-3 py-2.5 rounded-lg bg-navy-950 border border-white/5 text-sm text-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
                      {visibleVersion.body || <span className="text-foreground-subtle italic">(empty)</span>}
                    </pre>
                  )}
                </div>

                {/* Version history accordion */}
                {!editing && selectedVersions.length > 1 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-foreground-subtle mb-2">
                      Version History ({selectedVersions.length} versions)
                    </h4>
                    <div className="rounded-lg bg-navy-950 border border-white/5 divide-y divide-white/5">
                      {selectedVersions.map((v) => {
                        const isHead = v.id === selectedHead.id;
                        const isViewing = visibleVersion.id === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => setVisibleVersionId(v.id)}
                            className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                              isViewing ? "bg-gold-500/5" : "hover:bg-white/[0.03]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-teal-400">v{v.version}</span>
                              {isHead && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide bg-green-500/15 text-green-300 border border-green-500/20">
                                  Head
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(v.status)}`}>
                                {v.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-foreground-subtle">
                              <span>{v.created_at ? v.created_at.slice(0, 19).replace("T", " ") : "—"}</span>
                              {v.created_by && (
                                <span className="font-mono truncate max-w-[120px]">{v.created_by.slice(0, 8)}...</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                  <div>
                    <p className="text-foreground-subtle uppercase tracking-wider text-[10px]">Prompt ID</p>
                    <p className="font-mono text-foreground-muted truncate" title={selectedHead.id}>{selectedHead.id}</p>
                  </div>
                  <div>
                    <p className="text-foreground-subtle uppercase tracking-wider text-[10px]">Created</p>
                    <p className="font-mono text-foreground-muted">{selectedHead.created_at ? selectedHead.created_at.slice(0, 19).replace("T", " ") : "—"}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create New Prompt modal */}
      <AnimatePresence>
        {showCreateModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowCreateModal(false); setCreateError(null); }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-2xl border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Create Prompt</h2>
                  <button
                    onClick={() => { setShowCreateModal(false); setCreateError(null); }}
                    className="text-foreground-subtle hover:text-foreground transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Name *</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. alfred-system-v1"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 font-mono"
                    />
                    <p className="text-[10px] text-foreground-subtle mt-1">A stable identifier — same name across versions forms a supersession chain.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Body *</label>
                    <textarea
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      rows={14}
                      placeholder="You are a helpful assistant..."
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground font-mono placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 resize-y leading-relaxed"
                    />
                  </div>

                  {createError && (
                    <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                      {createError}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button
                    onClick={() => { setShowCreateModal(false); setCreateError(null); }}
                    className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || !newBody.trim() || creating}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {creating ? "Creating..." : "Create Prompt"}
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

export default function PromptsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-foreground-muted">Loading prompts...</div>}>
      <PromptsPageInner />
    </Suspense>
  );
}
