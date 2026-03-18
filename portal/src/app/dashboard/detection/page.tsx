"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SigmaRule {
  id: string;
  name: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  status: "Active" | "Disabled";
  matches: number;
  lastMatch: string;
  sigmaYaml: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  triggerRule: string;
  actions: string[];
}

const INITIAL_SIGMA_RULES: SigmaRule[] = [
  {
    id: "1",
    name: "Excessive Permission Requests",
    severity: "High",
    status: "Active",
    matches: 23,
    lastMatch: "12 min ago",
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
  - Initial agent provisioning
tags:
  - soulauth.abuse
  - soulauth.rate_anomaly`,
  },
  {
    id: "2",
    name: "Off-Hours Activity",
    severity: "Medium",
    status: "Active",
    matches: 47,
    lastMatch: "2 hours ago",
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
    - hours: "22:00-06:00"
    - days: [saturday, sunday]
  group_by: agent_soulkey
falsepositives:
  - Scheduled maintenance agents
  - Global teams in different timezones
tags:
  - soulauth.temporal_anomaly`,
  },
  {
    id: "3",
    name: "Rapid Key Rotation",
    severity: "High",
    status: "Active",
    matches: 3,
    lastMatch: "1 day ago",
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
  - Key compromise remediation
tags:
  - soulauth.key_abuse`,
  },
  {
    id: "4",
    name: "Cross-Tenant Access Attempt",
    severity: "Critical",
    status: "Active",
    matches: 1,
    lastMatch: "3 days ago",
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
    selection AND
    agent.tenant != resource.tenant
falsepositives:
  - None expected - always investigate
tags:
  - soulauth.cross_tenant
  - soulauth.critical`,
  },
  {
    id: "5",
    name: "Unusual Data Volume",
    severity: "Medium",
    status: "Active",
    matches: 8,
    lastMatch: "6 hours ago",
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
    selection AND
    data_volume > baseline * 3
  timeframe: 1h
  group_by: agent_soulkey
falsepositives:
  - End-of-quarter reporting
  - Data migration tasks
tags:
  - soulauth.data_exfiltration`,
  },
  {
    id: "6",
    name: "Failed Auth Spike",
    severity: "High",
    status: "Disabled",
    matches: 156,
    lastMatch: "5 hours ago",
    sigmaYaml: `title: Failed Auth Spike
id: f1a3-8b5c-2d7e-9f4a
status: stable
level: high
description: >
  Detects a spike in failed authentication
  attempts that may indicate credential stuffing
  or brute force attacks.
detection:
  selection:
    event_type: EVALUATE
    result: DENY
  condition: selection | count() > 20
  timeframe: 5m
  group_by: source_ip
falsepositives:
  - Misconfigured agent during deployment
  - Policy update propagation delay
tags:
  - soulauth.brute_force
  - soulauth.auth_failure`,
  },
];

const PLAYBOOKS: Playbook[] = [
  {
    id: "1",
    name: "Auto-Quarantine High Risk",
    description: "Immediately quarantine agents that trigger critical detection rules. Suspends agent capabilities and notifies the SOC team.",
    triggerRule: "Cross-Tenant Access Attempt",
    actions: [
      "Suspend agent soulkey",
      "Revoke all capabilities",
      "Create incident ticket",
      "Notify SOC team via PagerDuty",
      "Capture forensic snapshot",
    ],
  },
  {
    id: "2",
    name: "Escalate to SOC",
    description: "Escalate medium-severity detections to the SOC team for manual review. Adds rate limiting as a precaution.",
    triggerRule: "Excessive Permission Requests",
    actions: [
      "Apply rate limit (10 req/min)",
      "Create SOC review ticket",
      "Send Slack alert to #security-alerts",
      "Add agent to watchlist",
      "Schedule 24h auto-review",
    ],
  },
  {
    id: "3",
    name: "Rate Limit and Alert",
    description: "Apply rate limiting to agents showing unusual patterns. Monitor for 24 hours before escalating if behavior continues.",
    triggerRule: "Unusual Data Volume",
    actions: [
      "Apply rate limit (5 req/min)",
      "Send email to tenant admin",
      "Log detailed access patterns",
      "Auto-escalate if continues >24h",
    ],
  },
];

const severityColor: Record<SigmaRule["severity"], string> = {
  Critical: "bg-red-500/15 text-red-400 border border-red-500/20",
  High: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  Medium: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  Low: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
};

const severityGlow: Record<SigmaRule["severity"], string> = {
  Critical: "shadow-[0_0_6px_rgba(239,68,68,0.2)]",
  High: "shadow-[0_0_6px_rgba(249,115,22,0.15)]",
  Medium: "",
  Low: "",
};

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
  - soulauth.custom`;

const TABS = ["sigma", "playbooks"] as const;

export default function DetectionPage() {
  const idCounter = useRef(0);
  const [activeTab, setActiveTab] = useState<"sigma" | "playbooks">("sigma");
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [rules, setRules] = useState<SigmaRule[]>(INITIAL_SIGMA_RULES);

  // Create Rule modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleSeverity, setNewRuleSeverity] = useState<SigmaRule["severity"]>("Medium");
  const [newRuleDescription, setNewRuleDescription] = useState("");
  const [newRuleYaml, setNewRuleYaml] = useState(SIGMA_TEMPLATE);
  const [newRuleActive, setNewRuleActive] = useState(true);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
      sigmaYaml: newRuleYaml,
    };
    setRules((prev) => [newRule, ...prev]);
    setShowCreateModal(false);
    resetCreateForm();
  };

  const resetCreateForm = () => {
    setNewRuleName("");
    setNewRuleSeverity("Medium");
    setNewRuleDescription("");
    setNewRuleYaml(SIGMA_TEMPLATE);
    setNewRuleActive(true);
  };

  const toggleRuleStatus = (id: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: r.status === "Active" ? "Disabled" : "Active" }
          : r
      )
    );
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setDeleteConfirmId(null);
    if (expandedRule === id) setExpandedRule(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Detection Engine</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/20">
            {activeCount} active rules
          </span>
        </div>
        {activeTab === "sigma" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
          >
            + Create Rule
          </button>
        )}
      </div>

      {/* Tabs with animated underline */}
      <div className="relative flex gap-1 p-1 bg-navy-800 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 z-10 ${
              activeTab === tab
                ? "text-foreground"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {activeTab === tab && (
              <motion.div
                layoutId="detection-tab-bg"
                className="absolute inset-0 bg-navy-700 rounded-md shadow"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span className="relative">
              {tab === "sigma" ? "Sigma Rules" : "Playbooks"}
            </span>
          </button>
        ))}
      </div>

      {/* Sigma Rules Tab */}
      {activeTab === "sigma" && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Rule Name</th>
                  <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Matches</th>
                  <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Last Match</th>
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
                        <td className="px-4 py-3 text-foreground font-medium">{rule.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${severityColor[rule.severity]} ${severityGlow[rule.severity]}`}>
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
                        <td className="px-4 py-3 text-foreground-muted font-mono">{rule.matches}</td>
                        <td className="px-4 py-3 text-foreground-muted text-xs">{rule.lastMatch}</td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => toggleRuleStatus(rule.id)}
                              className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
                                rule.status === "Active"
                                  ? "text-foreground-muted hover:bg-white/5"
                                  : "text-green-400 hover:bg-green-500/10"
                              }`}
                            >
                              {rule.status === "Active" ? "Disable" : "Enable"}
                            </button>
                            {deleteConfirmId === rule.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => deleteRule(rule.id)}
                                  className="px-2 py-1 rounded text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all duration-200"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-2 py-1 rounded text-xs text-foreground-muted hover:bg-white/5 transition-all duration-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(rule.id)}
                                className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition-all duration-200"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
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
                                <div className="px-4 py-4 bg-navy-800/50">
                                  <pre className="font-mono text-xs leading-relaxed text-teal-300 bg-navy-950 rounded-lg p-4 border border-white/5 overflow-x-auto whitespace-pre">
                                    {rule.sigmaYaml}
                                  </pre>
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

      {/* Playbooks Tab */}
      {activeTab === "playbooks" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLAYBOOKS.map((playbook, pbIdx) => (
            <motion.div
              key={playbook.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pbIdx * 0.1 }}
              className="glass-card rounded-xl p-5 space-y-4 hover:border-gold-500/20 transition-all duration-200"
            >
              <div>
                <h3 className="text-sm font-semibold text-foreground">{playbook.name}</h3>
                <p className="text-xs text-foreground-muted mt-1 leading-relaxed">{playbook.description}</p>
              </div>

              <div>
                <span className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider">Trigger Rule</span>
                <p className="text-xs text-orange-400 mt-0.5 font-medium">{playbook.triggerRule}</p>
              </div>

              <div>
                <span className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider">Response Actions</span>
                <ol className="mt-2 space-y-1.5 relative">
                  {/* Connecting line */}
                  <div className="absolute left-2 top-3 bottom-3 w-px bg-white/[0.06]" />
                  {playbook.actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-3 text-xs text-foreground-muted relative">
                      <span className="relative z-10 w-4 h-4 rounded-full bg-navy-700 border border-white/10 text-foreground-subtle flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {action}
                    </li>
                  ))}
                </ol>
              </div>

              <button className="w-full px-3 py-2 rounded-lg border border-white/10 text-xs text-foreground-muted hover:text-foreground hover:bg-white/[0.03] transition-all duration-200">
                Edit Playbook
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Rule Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Create Detection Rule</h2>
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
                  {/* Rule Name */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Rule Name</label>
                    <input
                      type="text"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      placeholder="e.g. Suspicious API Key Usage"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                    />
                  </div>

                  {/* Severity + Status row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Severity</label>
                      <select
                        value={newRuleSeverity}
                        onChange={(e) => setNewRuleSeverity(e.target.value as SigmaRule["severity"])}
                        className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Status</label>
                      <button
                        type="button"
                        onClick={() => setNewRuleActive(!newRuleActive)}
                        className={`w-full px-4 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 ${
                          newRuleActive
                            ? "bg-green-500/10 border-green-500/30 text-green-400"
                            : "bg-navy-800 border-white/10 text-foreground-muted"
                        }`}
                      >
                        {newRuleActive ? "Active" : "Disabled"}
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Description</label>
                    <textarea
                      value={newRuleDescription}
                      onChange={(e) => setNewRuleDescription(e.target.value)}
                      placeholder="Describe what this rule detects and why it matters..."
                      rows={2}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 resize-none"
                    />
                  </div>

                  {/* Sigma YAML */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Sigma YAML</label>
                    <textarea
                      value={newRuleYaml}
                      onChange={(e) => setNewRuleYaml(e.target.value)}
                      rows={16}
                      className="w-full px-4 py-3 rounded-lg bg-navy-950 border border-white/10 text-xs text-teal-300 font-mono leading-relaxed focus:outline-none focus:border-gold-500/50 transition-all duration-200 resize-y"
                      spellCheck={false}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button
                    onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                    className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateRule}
                    disabled={!newRuleName.trim()}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
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
