"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

/** SoulWatch reports -- compliance framework report generation. Uses hardcoded mock data. */

interface Framework {
  id: string;
  name: string;
  description: string;
  controls: number;
  passingControls: number;
  badge: string;
  color: string;
}

interface ReportSection {
  control: string;
  title: string;
  status: "pass" | "partial" | "fail";
  description: string;
  evidence: string;
}

const FRAMEWORKS: Framework[] = [
  {
    id: "soc2", name: "SOC 2 Type II", description: "Service Organization Control - Trust Services Criteria",
    controls: 24, passingControls: 22, badge: "92%", color: "teal",
  },
  {
    id: "iso27001", name: "ISO 27001", description: "Information Security Management System",
    controls: 18, passingControls: 16, badge: "89%", color: "gold",
  },
  {
    id: "nist", name: "NIST 800-53", description: "Security and Privacy Controls for Information Systems",
    controls: 32, passingControls: 28, badge: "88%", color: "blue",
  },
];

const REPORT_SECTIONS: Record<string, ReportSection[]> = {
  soc2: [
    { control: "CC6.1", title: "Logical and Physical Access Controls", status: "pass", description: "All agent access controlled through Soulkey identity and PDP evaluation", evidence: "47 active agents, 100% policy-evaluated access" },
    { control: "CC6.2", title: "System Access Registration", status: "pass", description: "Agent registration tracked through immutable audit trail", evidence: "All agent registrations logged with timestamps" },
    { control: "CC6.3", title: "Role-based Access Control", status: "pass", description: "Policy-as-code enforces role-based access for all agents", evidence: "12 active policies, 0 over-privileged agents" },
    { control: "CC7.1", title: "Detection of Unauthorized Changes", status: "pass", description: "SoulWatch behavioral baselines detect anomalous activity", evidence: "14 anomalies detected in last 30 days, 100% investigated" },
    { control: "CC7.2", title: "Monitoring of System Components", status: "pass", description: "Real-time monitoring of all agent operations", evidence: "47,832 evaluations monitored in last 14 days" },
    { control: "CC7.3", title: "Evaluation of Security Events", status: "partial", description: "Sigma rule engine evaluates all events, some rules need tuning", evidence: "6 active rules, 2 generating false positives above threshold" },
    { control: "CC8.1", title: "Change Management", status: "pass", description: "Policy changes tracked through git sync with version control", evidence: "All policy changes audited through git commits" },
  ],
  iso27001: [
    { control: "A.9.1.1", title: "Access Control Policy", status: "pass", description: "Zero-trust policy evaluation for every agent request", evidence: "100% of requests policy-evaluated" },
    { control: "A.9.2.1", title: "User Registration", status: "pass", description: "Agent identity managed through Soulkey registration", evidence: "47 registered agents with unique identities" },
    { control: "A.9.4.1", title: "Information Access Restriction", status: "pass", description: "Capability tokens restrict access to specific resources", evidence: "Average token TTL: 5-15 minutes" },
    { control: "A.12.4.1", title: "Event Logging", status: "pass", description: "All agent events logged to immutable audit trail", evidence: "128,450 events logged in last 30 days" },
    { control: "A.12.4.3", title: "Admin Activity Logs", status: "pass", description: "Administrative actions logged and monitored", evidence: "All policy changes tracked" },
    { control: "A.16.1.2", title: "Reporting Security Events", status: "partial", description: "SIEM forwarding configured but SOC syslog showing degraded performance", evidence: "4 SIEM destinations, 1 degraded" },
  ],
  nist: [
    { control: "AC-2", title: "Account Management", status: "pass", description: "Agent accounts managed through Soulkey lifecycle", evidence: "47 active agents, full lifecycle tracking" },
    { control: "AC-3", title: "Access Enforcement", status: "pass", description: "PDP enforces authorization for every request", evidence: "94.2% allow rate, 5.8% deny rate" },
    { control: "AC-6", title: "Least Privilege", status: "pass", description: "Capability tokens scoped to minimum required permissions", evidence: "Average token scope: 2.3 actions, 1.8 resources" },
    { control: "AU-2", title: "Audit Events", status: "pass", description: "Comprehensive audit logging for all security events", evidence: "All EVALUATE, KEY_EVENT, and POLICY events logged" },
    { control: "AU-6", title: "Audit Review", status: "pass", description: "Automated anomaly detection reviews audit data", evidence: "6 active Sigma rules, continuous monitoring" },
    { control: "IR-4", title: "Incident Handling", status: "pass", description: "Quarantine engine provides automated incident response", evidence: "3 playbooks configured, 7 response actions available" },
    { control: "IR-5", title: "Incident Monitoring", status: "pass", description: "SoulWatch provides continuous incident monitoring", evidence: "24/7 monitoring active" },
    { control: "SI-4", title: "Information System Monitoring", status: "partial", description: "Behavioral baselines established for most agents, some new agents pending", evidence: "43 of 47 agents have established baselines" },
  ],
};

const statusBadge: Record<string, string> = {
  pass: "bg-green-500/15 text-green-400 border border-green-500/20",
  partial: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  fail: "bg-red-500/15 text-red-400 border border-red-500/20",
};

const statusLabel: Record<string, string> = {
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
};

export default function ReportsPage() {
  const [selectedFramework, setSelectedFramework] = useState<string>("soc2");
  const [expandedControl, setExpandedControl] = useState<string | null>(null);

  const currentFramework = FRAMEWORKS.find((f) => f.id === selectedFramework)!;
  const sections = REPORT_SECTIONS[selectedFramework] || [];
  const passRate = Math.round((currentFramework.passingControls / currentFramework.controls) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Compliance Reports</h1>
        <div className="flex items-center gap-3">
          <button className="group px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export PDF
          </button>
          <button className="group px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Framework Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FRAMEWORKS.map((fw, i) => (
          <motion.button
            key={fw.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => { setSelectedFramework(fw.id); setExpandedControl(null); }}
            className={`bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 text-left transition-all duration-200 ${
              selectedFramework === fw.id
                ? "border-of-primary/30 shadow-[0_0_20px_rgba(212,168,83,0.1)]"
                : "hover:border-white/15"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{fw.name}</h3>
                <p className="text-xs text-foreground-subtle mt-0.5">{fw.description}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                fw.id === selectedFramework ? "bg-of-primary/15 text-of-primary" : "bg-of-surface-container-high text-foreground-muted"
              }`}>
                {fw.badge}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground-subtle">{fw.passingControls} of {fw.controls} controls passing</span>
              </div>
              <div className="h-1.5 bg-of-surface-container-high rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    fw.color === "teal" ? "bg-gradient-to-r from-teal-600 to-teal-400" :
                    fw.color === "gold" ? "bg-of-primary" :
                    "bg-gradient-to-r from-blue-600 to-blue-400"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(fw.passingControls / fw.controls) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                />
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Executive Summary */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Executive Summary - {currentFramework.name}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-of-surface-container-high/50 border border-white/5 text-center">
            <p className="text-2xl font-bold text-of-primary font-mono">{passRate}%</p>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mt-1">Overall Pass Rate</p>
          </div>
          <div className="p-3 rounded-lg bg-of-surface-container-high/50 border border-white/5 text-center">
            <p className="text-2xl font-bold text-green-400 font-mono">{sections.filter((s) => s.status === "pass").length}</p>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mt-1">Passing</p>
          </div>
          <div className="p-3 rounded-lg bg-of-surface-container-high/50 border border-white/5 text-center">
            <p className="text-2xl font-bold text-yellow-400 font-mono">{sections.filter((s) => s.status === "partial").length}</p>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mt-1">Partial</p>
          </div>
          <div className="p-3 rounded-lg bg-of-surface-container-high/50 border border-white/5 text-center">
            <p className="text-2xl font-bold text-red-400 font-mono">{sections.filter((s) => s.status === "fail").length}</p>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mt-1">Failing</p>
          </div>
        </div>
        <p className="text-xs text-foreground-muted leading-relaxed">
          This report provides an automated assessment of your SoulWatch and SoulAuth deployment against {currentFramework.name} controls.
          Data is collected from agent evaluations, audit logs, policy configurations, and detection system telemetry.
          Report generated on {new Date().toISOString().split("T")[0]} covering the last 30 days of activity.
        </p>
      </div>

      {/* Control Mapping */}
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-foreground">Control Mapping</h3>
        </div>
        <div className="divide-y divide-white/5">
          {sections.map((section, i) => (
            <motion.div
              key={section.control}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
            >
              <button
                onClick={() => setExpandedControl(expandedControl === section.control ? null : section.control)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge[section.status]}`}>
                    {statusLabel[section.status]}
                  </span>
                  <span className="text-xs font-mono text-foreground-subtle shrink-0">{section.control}</span>
                  <span className="text-sm text-foreground truncate">{section.title}</span>
                </div>
                <svg className={`w-4 h-4 text-foreground-subtle shrink-0 transition-transform ${expandedControl === section.control ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedControl === section.control && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2">
                    <p className="text-xs text-foreground-muted leading-relaxed pl-[72px]">{section.description}</p>
                    <div className="pl-[72px] p-2 rounded-lg bg-of-surface-container-lowest border border-white/5">
                      <span className="text-[10px] text-foreground-subtle uppercase tracking-wider">Evidence: </span>
                      <span className="text-xs text-foreground-muted">{section.evidence}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
