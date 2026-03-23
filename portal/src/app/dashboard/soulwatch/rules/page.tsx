"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/** SoulWatch Sigma rules -- detection rule editor with severity and test controls. Uses hardcoded mock data. */

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

const INITIAL_RULES: SigmaRule[] = [
  {
    id: "1", name: "Cross-Tenant Access Attempt", severity: "Critical", status: "Active", matches: 1, lastMatch: "3 days ago",
    playbook: "Auto-Quarantine High Risk", builtIn: true,
    sigmaYaml: `title: Cross-Tenant Access Attempt
id: a3b7-2c9d-5e1f-8a4c
status: stable
level: critical
description: >
  Detects any attempt by an agent to access
  resources belonging to a different tenant.
detection:
  selection:
    event_type: EVALUATE
  condition: >
    selection AND agent.tenant != resource.tenant
falsepositives:
  - None expected - always investigate
tags:
  - soulwatch.cross_tenant
  - soulwatch.critical`,
  },
  {
    id: "2", name: "Excessive Permission Requests", severity: "High", status: "Active", matches: 23, lastMatch: "12 min ago",
    playbook: "Escalate to SOC", builtIn: true,
    sigmaYaml: `title: Excessive Permission Requests
id: d4a8-53e7-9b1f-2c4d
status: experimental
level: high
description: >
  Detects agents making an abnormal number
  of permission requests within a short window.
detection:
  selection:
    event_type: EVALUATE
  condition: selection | count() > 50
  timeframe: 5m
  group_by: agent_soulkey
falsepositives:
  - Batch processing agents during ETL windows
tags:
  - soulwatch.rate_anomaly`,
  },
  {
    id: "3", name: "Off-Hours Activity", severity: "Medium", status: "Active", matches: 47, lastMatch: "31 min ago",
    playbook: null, builtIn: true,
    sigmaYaml: `title: Off-Hours Activity
id: b9c1-7e3f-4a2d-8f6b
status: stable
level: medium
description: >
  Detects agent activity outside of configured
  business hours for the tenant.
detection:
  selection:
    event_type: EVALUATE
  condition: selection
  time_filter:
    hours: "22:00-06:00"
    days: [saturday, sunday]
  group_by: agent_soulkey
falsepositives:
  - Scheduled maintenance agents
tags:
  - soulwatch.temporal_anomaly`,
  },
  {
    id: "4", name: "Rapid Key Rotation", severity: "High", status: "Active", matches: 3, lastMatch: "56 min ago",
    playbook: null, builtIn: true,
    sigmaYaml: `title: Rapid Key Rotation
id: e5f2-1a8c-3d7b-9e4f
status: experimental
level: high
description: >
  Detects soulkey rotation happening more
  frequently than the expected schedule.
detection:
  selection:
    event_type: KEY_EVENT
    action: key_rotate
  condition: selection | count() > 3
  timeframe: 24h
  group_by: agent_soulkey
falsepositives:
  - Security incident response
tags:
  - soulwatch.key_abuse`,
  },
  {
    id: "5", name: "Unusual Data Volume", severity: "Medium", status: "Active", matches: 8, lastMatch: "45 min ago",
    playbook: "Rate Limit and Alert", builtIn: true,
    sigmaYaml: `title: Unusual Data Volume
id: c7d9-4e2a-6f1b-3c8e
status: experimental
level: medium
description: >
  Detects agents transferring significantly more
  data than their historical baseline.
detection:
  selection:
    event_type: EVALUATE
    action: [read, write]
  condition: >
    selection AND data_volume > baseline * 3
  timeframe: 1h
  group_by: agent_soulkey
falsepositives:
  - End-of-quarter reporting
tags:
  - soulwatch.data_exfiltration`,
  },
  {
    id: "6", name: "Failed Auth Spike", severity: "High", status: "Active", matches: 156, lastMatch: "1 hour ago",
    playbook: null, builtIn: true,
    sigmaYaml: `title: Failed Auth Spike
id: f1a3-8b5c-2d7e-9f4a
status: stable
level: high
description: >
  Detects a spike in failed authentication
  attempts that may indicate credential stuffing.
detection:
  selection:
    event_type: EVALUATE
    result: DENY
  condition: selection | count() > 20
  timeframe: 5m
  group_by: source_ip
falsepositives:
  - Misconfigured agent during deployment
tags:
  - soulwatch.brute_force`,
  },
];

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

export default function RulesPage() {
  const idCounter = useRef(0);
  const [rules, setRules] = useState(INITIAL_RULES);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleSeverity, setNewRuleSeverity] = useState<SigmaRule["severity"]>("Medium");
  const [newRuleYaml, setNewRuleYaml] = useState(SIGMA_TEMPLATE);
  const [newRuleActive, setNewRuleActive] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const activeCount = rules.filter((r) => r.status === "Active").length;

  const handleCreateRule = () => {
    if (!newRuleName.trim()) return;
    const newRule: SigmaRule = {
      id: `rule_${++idCounter.current}`,
      name: newRuleName.trim(),
      severity: newRuleSeverity,
      status: newRuleActive ? "Active" : "Disabled",
      matches: 0,
      lastMatch: "Never",
      playbook: null,
      builtIn: false,
      sigmaYaml: newRuleYaml,
    };
    setRules((prev) => [newRule, ...prev]);
    setShowCreateModal(false);
    resetCreateForm();
  };

  const resetCreateForm = () => {
    setNewRuleName("");
    setNewRuleSeverity("Medium");
    setNewRuleYaml(SIGMA_TEMPLATE);
    setNewRuleActive(true);
  };

  const toggleRuleStatus = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: r.status === "Active" ? "Disabled" : "Active" } : r))
    );
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setDeleteConfirmId(null);
    if (expandedRule === id) setExpandedRule(null);
  };

  const handleTestRule = (id: string) => {
    setTestRuleId(id);
    setTestResult(null);
    setTimeout(() => {
      setTestResult("Test complete: 3 matches found in last 24h of historical data. Rule syntax valid.");
    }, 1500);
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

      {/* Rules Table */}
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
                      onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
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
                                <pre className="font-mono text-xs leading-relaxed text-of-primary bg-of-surface-container-lowest rounded-lg p-4 border border-white/5 overflow-x-auto whitespace-pre">
                                  {rule.sigmaYaml}
                                </pre>
                                {testRuleId === rule.id && (
                                  <div className={`p-3 rounded-lg border text-xs ${
                                    testResult ? "bg-green-500/5 border-green-500/20 text-green-400" : "bg-of-surface-container-lowest border-white/5 text-foreground-muted"
                                  }`}>
                                    {testResult || "Running test against historical data..."}
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
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                    className="px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">
                    Cancel
                  </button>
                  <button onClick={handleCreateRule} disabled={!newRuleName.trim()}
                    className="px-5 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Save Rule
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
