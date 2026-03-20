"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { Plus, Trash2, FlaskConical, ChevronDown, ChevronRight, X, ToggleLeft, ToggleRight } from "lucide-react";

interface RuleSummary {
  id: string;
  title: string;
  status: string;
  level: string;
  enabled: boolean;
  tags: string[];
  response_playbook?: string | null;
}

interface RuleTestResponse {
  matched: boolean;
  matched_fields: Record<string, unknown>;
  rule_id: string;
  rule_title: string;
}

const LEVEL_STYLES: Record<string, string> = {
  critical: "bg-of-error/20 text-of-error border border-of-error/30",
  high: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  medium: "bg-warning/15 text-warning border border-warning/20",
  low: "bg-of-on-surface-variant/10 text-of-on-surface-variant border border-of-outline-variant/20",
  informational: "bg-of-primary/10 text-of-primary border border-of-primary/20",
};

const DEFAULT_RULE_YAML = `title: New Detection Rule
status: experimental
level: medium
description: Describe what this rule detects
logsource:
  product: soulauth
  service: audit
detection:
  selection:
    event_type: auth_deny
  condition: selection
tags:
  - soulauth.detection
`;

export default function RuleEditorPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createYaml, setCreateYaml] = useState(DEFAULT_RULE_YAML);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Test panel state
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [testEventJson, setTestEventJson] = useState(
    '{\n  "event_type": "auth_deny",\n  "soulkey_id": "sk_example",\n  "reason": "scope_violation"\n}'
  );
  const [testResult, setTestResult] = useState<RuleTestResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const { data: rulesData, loading, error, refetch } = useWidgetData<RuleSummary[]>({
    endpoint: "/v1/detection/rules",
    refreshInterval: 30000,
  });

  const rules: RuleSummary[] = Array.isArray(rulesData) ? rulesData : [];

  // Create rule — must POST raw YAML with text/plain content type
  async function handleCreate() {
    if (!createYaml.trim()) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/v1/detection/rules`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: createYaml,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `${res.status} ${res.statusText}`);
      }
      setActionResult({ type: "success", message: "Rule created successfully." });
      setShowCreatePanel(false);
      setCreateYaml(DEFAULT_RULE_YAML);
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setCreateError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Toggle enabled/disabled
  async function handleToggle(rule: RuleSummary) {
    try {
      const { api } = await import("@/lib/api");
      await api.put(`/v1/detection/rules/${rule.id}`, { enabled: !rule.enabled });
      setActionResult({
        type: "success",
        message: `Rule "${rule.title}" ${!rule.enabled ? "enabled" : "disabled"}.`,
      });
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message });
    }
  }

  // Delete rule
  async function handleDelete(rule: RuleSummary) {
    if (!confirm(`Delete rule "${rule.title}"? This cannot be undone.`)) return;
    try {
      const { api } = await import("@/lib/api");
      await api.delete(`/v1/detection/rules/${rule.id}`);
      setActionResult({ type: "success", message: `Rule "${rule.title}" deleted.` });
      if (expandedId === rule.id) setExpandedId(null);
      if (testRuleId === rule.id) setTestRuleId(null);
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setActionResult({ type: "error", message });
    }
  }

  // Test rule against sample event
  async function handleTest() {
    if (!testRuleId) return;
    setTestLoading(true);
    setTestError(null);
    setTestResult(null);
    try {
      let parsedEvent: Record<string, unknown>;
      try {
        parsedEvent = JSON.parse(testEventJson);
      } catch {
        throw new Error("Invalid JSON in event payload");
      }
      const { api } = await import("@/lib/api");
      const result = await api.post(`/v1/detection/rules/${testRuleId}/test`, {
        event: parsedEvent,
      });
      setTestResult(result as RuleTestResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setTestError(message);
    } finally {
      setTestLoading(false);
    }
  }

  const selectedRuleTitle = rules.find((r) => r.id === testRuleId)?.title ?? null;

  return (
    <div className="max-w-7xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-of-on-surface">Sigma Rule Editor</h1>
          <p className="text-[11px] text-of-on-surface-variant mt-0.5">
            Manage detection rules — create, edit, test, and toggle
          </p>
        </div>
        <button
          onClick={() => setShowCreatePanel(true)}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold"
        >
          <Plus className="h-3.5 w-3.5" />
          New Rule
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
          Failed to load rules: {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
          ))}
        </div>
      )}

      {/* Rules table */}
      {!loading && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_100px_120px_auto] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Rule", "Status", "Level", "Playbook", "Actions"].map((h, i) => (
              <span key={i} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                {h}
              </span>
            ))}
          </div>

          {rules.length === 0 && (
            <div className="flex items-center justify-center py-16 text-of-on-surface-variant">
              <p className="text-sm">No rules loaded — create one to get started</p>
            </div>
          )}

          {rules.map((rule) => (
            <div key={rule.id}>
              {/* Rule row */}
              <div
                className={`grid grid-cols-[1fr_100px_100px_120px_auto] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center ${
                  !rule.enabled ? "opacity-50" : ""
                }`}
              >
                {/* Title + expand */}
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                    className="text-of-on-surface-variant hover:text-of-on-surface transition-colors shrink-0"
                  >
                    {expandedId === rule.id ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-of-on-surface truncate">{rule.title}</p>
                    <p className="text-[10px] font-mono text-of-on-surface-variant truncate mt-0.5">{rule.id}</p>
                  </div>
                </div>

                {/* Status */}
                <span className="text-[10px] font-bold uppercase text-of-on-surface-variant">
                  {rule.status}
                </span>

                {/* Level badge */}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${LEVEL_STYLES[rule.level] ?? LEVEL_STYLES.low}`}>
                  {rule.level}
                </span>

                {/* Playbook */}
                <span className="text-xs text-of-on-surface-variant truncate">
                  {rule.response_playbook ?? "—"}
                </span>

                {/* Action buttons */}
                <div className="flex items-center gap-2 justify-end">
                  {/* Test button */}
                  <button
                    onClick={() => {
                      setTestRuleId(testRuleId === rule.id ? null : rule.id);
                      setTestResult(null);
                      setTestError(null);
                    }}
                    title="Test rule"
                    className={`flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-bold border transition-colors ${
                      testRuleId === rule.id
                        ? "bg-of-primary/20 text-of-primary border-of-primary/30"
                        : "border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface"
                    }`}
                  >
                    <FlaskConical className="h-3 w-3" />
                    Test
                  </button>

                  {/* Toggle enabled */}
                  <button
                    onClick={() => handleToggle(rule)}
                    title={rule.enabled ? "Disable rule" : "Enable rule"}
                    className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
                  >
                    {rule.enabled ? (
                      <ToggleRight className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-4 w-4" />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(rule)}
                    title="Delete rule"
                    className="text-of-on-surface-variant hover:text-of-error transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded detail: tags */}
              {expandedId === rule.id && (
                <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-5 py-4">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {rule.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-bold bg-of-primary/10 text-of-primary border border-of-primary/20">
                        {tag}
                      </span>
                    ))}
                    {rule.tags.length === 0 && (
                      <span className="text-xs text-of-on-surface-variant italic">No tags</span>
                    )}
                  </div>
                  <p className="text-[10px] text-of-on-surface-variant">
                    Use the test panel (Flask icon) to run a sample event against this rule.
                  </p>
                </div>
              )}

              {/* Inline test panel */}
              {testRuleId === rule.id && (
                <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-primary mb-3">
                    Test Rule — {selectedRuleTitle}
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Event JSON input */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                        Sample Event (JSON)
                      </label>
                      <textarea
                        value={testEventJson}
                        onChange={(e) => setTestEventJson(e.target.value)}
                        rows={8}
                        className="w-full px-3 py-2 bg-of-surface-container border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 resize-none"
                        spellCheck={false}
                      />
                      <button
                        onClick={handleTest}
                        disabled={testLoading}
                        className="mt-2 flex items-center gap-1.5 h-8 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 disabled:opacity-40 transition-colors text-xs font-bold"
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        {testLoading ? "Testing..." : "Run Test"}
                      </button>
                    </div>

                    {/* Test result */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                        Result
                      </label>
                      {testError && (
                        <div className="p-3 rounded-lg bg-of-error/10 border border-of-error/20 text-of-error text-xs font-mono">
                          {testError}
                        </div>
                      )}
                      {!testResult && !testError && (
                        <div className="p-3 rounded-lg bg-of-surface-container border border-of-outline-variant/10 text-of-on-surface-variant text-xs italic">
                          Run test to see results
                        </div>
                      )}
                      {testResult && (
                        <div className={`p-3 rounded-lg border ${testResult.matched ? "bg-emerald-500/10 border-emerald-500/20" : "bg-of-surface-container border-of-outline-variant/10"}`}>
                          <p className={`text-sm font-bold mb-2 ${testResult.matched ? "text-emerald-400" : "text-of-on-surface-variant"}`}>
                            {testResult.matched ? "MATCHED" : "NO MATCH"}
                          </p>
                          {testResult.matched && Object.keys(testResult.matched_fields).length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                                Matched Fields
                              </p>
                              {Object.entries(testResult.matched_fields).map(([k, v]) => (
                                <div key={k} className="flex gap-2 text-xs font-mono">
                                  <span className="text-of-primary shrink-0">{k}:</span>
                                  <span className="text-of-on-surface break-all">
                                    {typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create rule modal */}
      {showCreatePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-of-surface-container rounded-2xl border border-of-outline-variant/20 p-6 w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-of-primary" />
                <h2 className="text-base font-bold text-of-on-surface">New Sigma Rule</h2>
              </div>
              <button
                onClick={() => { setShowCreatePanel(false); setCreateError(null); }}
                className="text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                Rule YAML
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
                onClick={() => { setShowCreatePanel(false); setCreateError(null); }}
                className="px-4 h-9 rounded-lg text-sm font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !createYaml.trim()}
                className="px-4 h-9 rounded-lg text-sm font-bold bg-of-primary/20 text-of-primary border border-of-primary/20 hover:bg-of-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Creating..." : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
