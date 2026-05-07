"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWidgetData } from "@/lib/useWidgetData";
import { api } from "@/lib/api";

/** SoulWatch Sigma rules -- detection rule editor with severity and test controls. */

interface SigmaRule {
  id: string;
  name: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  status: "Active" | "Disabled";
  matches: number;
  lastMatch: string;
  playbook: string | null;
  builtIn: boolean;
  sigmaYaml: string;
}

/** Detail shape returned by GET /api/watch/v1/rules/:id */
interface RuleDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  level: string;
  logsource: Record<string, unknown>;
  detection: Record<string, unknown>;
  tags: string[];
  response_playbook: string | null;
  enabled: boolean;
  is_custom: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const SIGMA_TEMPLATE = `title: New Detection Rule
id: 00000000-0000-0000-0000-000000000000
status: experimental
level: medium
description: >
  Describe what this rule detects
  and why it matters.
detection:
  selection:
    event_type: EVALUATE
  condition: selection
  timeframe: 5m
  group_by: agent_soulkey
falsepositives:
  - List expected false positives here
tags:
  - soulwatch.custom`;

const severityColor: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 border border-red-500/20",
  High: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  Medium: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  Low: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
};

/** Convert a RuleDetail to display YAML. */
function detailToYaml(d: RuleDetail): string {
  const lines: string[] = [];
  lines.push(`title: ${d.title}`);
  lines.push(`id: ${d.id}`);
  lines.push(`status: ${d.status}`);
  lines.push(`level: ${d.level}`);
  if (d.description) {
    lines.push(`description: >`);
    lines.push(`  ${d.description.replace(/\n/g, "\n  ")}`);
  }
  if (d.logsource && Object.keys(d.logsource).length > 0) {
    lines.push(`logsource:`);
    for (const [k, v] of Object.entries(d.logsource)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  if (d.detection && Object.keys(d.detection).length > 0) {
    lines.push(`detection:`);
    for (const [k, v] of Object.entries(d.detection)) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        lines.push(`  ${k}:`);
        for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) {
          lines.push(`    ${fk}: ${fv}`);
        }
      } else {
        lines.push(`  ${k}: ${v}`);
      }
    }
  }
  if (d.tags && d.tags.length > 0) {
    lines.push(`tags:`);
    for (const t of d.tags) lines.push(`  - ${t}`);
  }
  if (d.response_playbook) {
    lines.push(`response_playbook: ${d.response_playbook}`);
  }
  return lines.join("\n");
}

export default function RulesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformRules = useCallback((raw: unknown): SigmaRule[] => {
    const items = Array.isArray(raw) ? raw : ((raw as any)?.items ?? (raw as any)?.rules ?? []);
    return items.map((r: any) => ({
      id: r.id ?? "",
      name: r.title ?? r.name ?? "",
      severity: capitalize(r.level ?? r.severity ?? "Medium") as SigmaRule["severity"],
      status: r.enabled === false ? "Disabled" as const : (r.status === "Disabled" ? "Disabled" as const : "Active" as const),
      matches: r.matches ?? r.match_count ?? 0,
      lastMatch: r.last_match ?? r.lastMatch ?? "Never",
      playbook: r.response_playbook ?? r.playbook ?? null,
      builtIn: !(r.is_custom ?? false),
      sigmaYaml: r.sigma_yaml ?? r.sigmaYaml ?? "",
    }));
  }, []);

  const { data: fetchedRules, loading, error, refetch } = useWidgetData<SigmaRule[]>({
    endpoint: "/api/watch/v1/rules",
    transform: transformRules,
  });

  const [rules, setRules] = useState<SigmaRule[]>([]);
  useEffect(() => {
    if (fetchedRules) setRules(fetchedRules);
  }, [fetchedRules]);

  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [ruleDetails, setRuleDetails] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleSeverity, setNewRuleSeverity] = useState<SigmaRule["severity"]>("Medium");
  const [newRuleYaml, setNewRuleYaml] = useState(SIGMA_TEMPLATE);
  const [newRuleActive, setNewRuleActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Edit state
  const [editRule, setEditRule] = useState<SigmaRule | null>(null);
  const [editYaml, setEditYaml] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const activeCount = rules.filter((r) => r.status === "Active").length;

  /** Fetch rule detail (full YAML) when expanding a row. */
  const handleExpand = async (ruleId: string) => {
    if (expandedRule === ruleId) {
      setExpandedRule(null);
      return;
    }
    setExpandedRule(ruleId);

    // If we already have detail cached, skip fetch
    if (ruleDetails[ruleId]) return;

    setLoadingDetail(ruleId);
    try {
      const detail = await api.get<RuleDetail>(`/api/watch/v1/rules/${ruleId}`);
      const yaml = detailToYaml(detail);
      setRuleDetails((prev) => ({ ...prev, [ruleId]: yaml }));
    } catch {
      setRuleDetails((prev) => ({ ...prev, [ruleId]: "# Failed to load rule detail" }));
    } finally {
      setLoadingDetail(null);
    }
  };

  /** Create a new rule via the API. */
  const handleCreateRule = async () => {
    if (!newRuleName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      // The backend POST expects raw YAML as text/yaml body
      const yamlBody = newRuleYaml
        .replace(/^title:.*$/m, `title: ${newRuleName.trim()}`)
        .replace(/^level:.*$/m, `level: ${newRuleSeverity.toLowerCase()}`)
        .replace(/^status:.*$/m, `status: ${newRuleActive ? "experimental" : "disabled"}`);

      await fetch("/api/watch/v1/rules", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: yamlBody,
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || body?.detail || `HTTP ${res.status}`);
        }
        return res.json();
      });

      setShowCreateModal(false);
      resetCreateForm();
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const resetCreateForm = () => {
    setNewRuleName("");
    setNewRuleSeverity("Medium");
    setNewRuleYaml(SIGMA_TEMPLATE);
    setNewRuleActive(true);
    setSaveError(null);
  };

  /** Toggle enabled/disabled via PUT. */
  const toggleRuleStatus = async (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    const newEnabled = rule.status !== "Active";
    try {
      await api.put(`/api/watch/v1/rules/${id}`, { enabled: newEnabled });
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newEnabled ? "Active" : "Disabled" } : r))
      );
    } catch {
      // Revert optimistically or just refetch
      refetch();
    }
  };

  /** Delete a custom rule via the API. */
  const deleteRule = async (id: string) => {
    try {
      await api.delete(`/api/watch/v1/rules/${id}`);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setDeleteConfirmId(null);
      if (expandedRule === id) setExpandedRule(null);
      // Clear cached detail
      setRuleDetails((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      refetch();
    }
    setDeleteConfirmId(null);
  };

  /** Test a rule against sample data via the API. */
  const handleTestRule = async (id: string) => {
    setTestRuleId(id);
    setTestResult(null);
    try {
      const res = await api.post<{ matched: boolean; matched_fields: Record<string, unknown> }>(
        `/api/watch/v1/rules/${id}/test`,
        { event: { event_type: "EVALUATE", decision: "deny", soulkey_id: "test-key" } }
      );
      setTestResult(
        res.matched
          ? `Test complete: Rule matched. Fields: ${JSON.stringify(res.matched_fields)}`
          : "Test complete: No match against sample event."
      );
    } catch {
      setTestResult("Test failed: Could not reach the detection engine.");
    }
  };

  /** Open edit modal for a rule. */
  const openEditModal = async (rule: SigmaRule) => {
    setEditRule(rule);
    setEditError(null);
    // Load the YAML from cached detail or fetch
    if (ruleDetails[rule.id]) {
      setEditYaml(ruleDetails[rule.id]);
    } else {
      try {
        const detail = await api.get<RuleDetail>(`/api/watch/v1/rules/${rule.id}`);
        const yaml = detailToYaml(detail);
        setRuleDetails((prev) => ({ ...prev, [rule.id]: yaml }));
        setEditYaml(yaml);
      } catch {
        setEditYaml("# Failed to load rule detail");
      }
    }
  };

  /** Save edits via PUT (update fields from YAML). */
  const handleSaveEdit = async () => {
    if (!editRule) return;
    setEditSaving(true);
    setEditError(null);
    try {
      // Parse basic fields from the YAML for the update request
      const titleMatch = editYaml.match(/^title:\s*(.+)$/m);
      const levelMatch = editYaml.match(/^level:\s*(.+)$/m);
      const descMatch = editYaml.match(/^description:\s*>?\s*\n([\s\S]*?)(?=\n\w|\n$)/m);
      const statusMatch = editYaml.match(/^status:\s*(.+)$/m);

      const updateBody: Record<string, unknown> = {};
      if (titleMatch) updateBody.title = titleMatch[1].trim();
      if (levelMatch) updateBody.level = levelMatch[1].trim();
      if (statusMatch) updateBody.status = statusMatch[1].trim();
      if (descMatch) updateBody.description = descMatch[1].trim();

      await api.put(`/api/watch/v1/rules/${editRule.id}`, updateBody);

      // Clear cached detail so it re-fetches
      setRuleDetails((prev) => {
        const next = { ...prev };
        delete next[editRule.id];
        return next;
      });
      setEditRule(null);
      refetch();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Detection Rules</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-of-primary/15 text-of-primary border border-of-primary/20">
            {activeCount} active
          </span>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors"
        >
          + Add Rule
        </button>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-12 text-foreground-muted text-sm">Loading detection rules...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-400 text-sm">Failed to load rules: {error}</div>
      )}
      {!loading && !error && rules.length === 0 && (
        <div className="text-center py-12">
          <p className="text-foreground-muted text-sm">No detection rules configured</p>
          <p className="text-foreground-subtle text-xs mt-1">Click &quot;+ Add Rule&quot; to create your first Sigma detection rule.</p>
        </div>
      )}

      {/* Rules Table */}
      {!loading && !error && rules.length > 0 && (
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Rule Name</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Matches</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Playbook</th>
                <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {rules.map((rule) => (
                  <React.Fragment key={rule.id}>
                    <motion.tr
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => handleExpand(rule.id)}
                      className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-all duration-200"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{rule.name}</span>
                          {rule.builtIn && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-of-primary/10 text-of-primary border border-of-primary/20">
                              Built-in
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${severityColor[rule.severity]}`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                          rule.status === "Active"
                            ? "bg-green-500/15 text-green-400 border border-green-500/20"
                            : "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                        }`}>
                          {rule.status === "Active" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          )}
                          {rule.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted font-mono text-xs">{rule.matches}</td>
                      <td className="px-4 py-3">
                        {rule.playbook ? (
                          <span className="text-xs text-of-primary">{rule.playbook}</span>
                        ) : (
                          <span className="text-xs text-foreground-subtle italic">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleTestRule(rule.id)}
                            className="px-2 py-1 rounded text-xs text-of-primary hover:bg-of-primary/10 transition-all"
                          >
                            Test
                          </button>
                          {!rule.builtIn && (
                            <button
                              onClick={() => openEditModal(rule)}
                              className="px-2 py-1 rounded text-xs text-foreground-muted hover:bg-white/5 transition-all"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => toggleRuleStatus(rule.id)}
                            className={`px-2 py-1 rounded text-xs transition-all ${
                              rule.status === "Active" ? "text-foreground-muted hover:bg-white/5" : "text-green-400 hover:bg-green-500/10"
                            }`}
                          >
                            {rule.status === "Active" ? "Disable" : "Enable"}
                          </button>
                          {!rule.builtIn && (
                            deleteConfirmId === rule.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => deleteRule(rule.id)} className="px-2 py-1 rounded text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all">Confirm</button>
                                <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded text-xs text-foreground-muted hover:bg-white/5 transition-all">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirmId(rule.id)} className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition-all">Delete</button>
                            )
                          )}
                        </div>
                      </td>
                    </motion.tr>

                    {/* Expanded YAML + Test Result */}
                    <AnimatePresence>
                      {expandedRule === rule.id && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-4 bg-of-surface-container-high/50 space-y-3">
                                {loadingDetail === rule.id ? (
                                  <div className="text-xs text-foreground-muted py-4 text-center">Loading rule detail...</div>
                                ) : (
                                  <pre className="font-mono text-xs leading-relaxed text-of-primary bg-of-surface-container-lowest rounded-lg p-4 border border-white/5 overflow-x-auto whitespace-pre">
                                    {ruleDetails[rule.id] || rule.sigmaYaml || "# No rule content available"}
                                  </pre>
                                )}
                                {testRuleId === rule.id && (
                                  <div className={`p-3 rounded-lg border text-xs ${
                                    testResult ? "bg-green-500/5 border-green-500/20 text-green-400" : "bg-of-surface-container-lowest border-white/5 text-foreground-muted"
                                  }`}>
                                    {testResult || "Running test against sample event..."}
                                  </div>
                                )}
                                <div className="flex items-center gap-4 text-[10px] text-foreground-subtle">
                                  <span>Last match: {rule.lastMatch}</span>
                                  <span>|</span>
                                  <span>Total matches: {rule.matches}</span>
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
      )}

      {/* Create Rule Modal */}
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
              <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Add Detection Rule</h2>
                  <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Rule Name</label>
                    <input
                      type="text" value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)}
                      placeholder="e.g. Suspicious Admin API Access"
                      className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-of-primary/50 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Severity</label>
                      <select value={newRuleSeverity} onChange={(e) => setNewRuleSeverity(e.target.value as SigmaRule["severity"])}
                        className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all">
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Status</label>
                      <button type="button" onClick={() => setNewRuleActive(!newRuleActive)}
                        className={`w-full px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                          newRuleActive ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-of-surface-container-high border-white/10 text-foreground-muted"
                        }`}>
                        {newRuleActive ? "Active" : "Disabled"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Sigma YAML</label>
                    <textarea value={newRuleYaml} onChange={(e) => setNewRuleYaml(e.target.value)} rows={16}
                      className="w-full px-4 py-3 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-of-primary font-mono leading-relaxed focus:outline-none focus:border-of-primary/50 transition-all resize-y"
                      spellCheck={false} />
                  </div>
                  {saveError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      {saveError}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                    className="px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">
                    Cancel
                  </button>
                  <button onClick={handleCreateRule} disabled={!newRuleName.trim() || saving}
                    className="px-5 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {saving ? "Saving..." : "Save Rule"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Rule Modal */}
      <AnimatePresence>
        {editRule && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditRule(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Edit Rule: {editRule.name}</h2>
                  <button onClick={() => setEditRule(null)} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Rule YAML</label>
                    <textarea value={editYaml} onChange={(e) => setEditYaml(e.target.value)} rows={20}
                      className="w-full px-4 py-3 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-of-primary font-mono leading-relaxed focus:outline-none focus:border-of-primary/50 transition-all resize-y"
                      spellCheck={false} />
                  </div>
                  {editError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      {editError}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setEditRule(null)}
                    className="px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} disabled={editSaving}
                    className="px-5 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {editSaving ? "Saving..." : "Save Changes"}
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
