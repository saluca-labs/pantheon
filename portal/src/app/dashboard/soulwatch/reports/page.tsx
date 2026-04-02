"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

interface EvidenceModalData {
  control: string;
  title: string;
  status: string;
  description: string;
  evidence: string;
  framework: string;
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [selectedFramework, setSelectedFramework] = useState<string>("soc2");
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [evidenceModal, setEvidenceModal] = useState<EvidenceModalData | null>(null);

  const currentFramework = FRAMEWORKS.find((f) => f.id === selectedFramework)!;
  const sections = REPORT_SECTIONS[selectedFramework] || [];
  const passRate = Math.round((currentFramework.passingControls / currentFramework.controls) * 100);

  function handleDownloadEvidence(section: ReportSection) {
    const evidencePayload = {
      framework: currentFramework.name,
      frameworkId: currentFramework.id,
      control: section.control,
      title: section.title,
      status: section.status,
      description: section.description,
      evidence: section.evidence,
      exportedAt: new Date().toISOString(),
      coveragePeriod: "Last 30 days",
    };
    const json = JSON.stringify(evidencePayload, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const date = new Date().toISOString().split("T")[0];
    downloadBlob(blob, `${currentFramework.id}-${section.control}-evidence-${date}.json`);
  }

  function handleExportCSV() {
    const header = "Control,Title,Status,Description,Evidence";
    const rows = sections.map((s) =>
      [s.control, s.title, s.status, s.description, s.evidence]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const date = new Date().toISOString().split("T")[0];
    downloadBlob(blob, `${currentFramework.id}-compliance-report-${date}.csv`);
  }

  function handleExportPDF() {
    const date = new Date().toISOString().split("T")[0];
    const passCount = sections.filter((s) => s.status === "pass").length;
    const partialCount = sections.filter((s) => s.status === "partial").length;
    const failCount = sections.filter((s) => s.status === "fail").length;

    const statusColor: Record<string, string> = {
      pass: "#22c55e",
      partial: "#eab308",
      fail: "#ef4444",
    };

    const controlRows = sections
      .map(
        (s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:${statusColor[s.status]};">
            ${s.status.toUpperCase()}
          </span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px;color:#374151;">${s.control}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;">${s.title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${s.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${s.evidence}</td>
      </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html><head><title>${currentFramework.name} Compliance Report</title>
<style>
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: landscape; margin: 0.5in; }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; margin: 0; padding: 40px; background: #fff; }
  .header { border-bottom: 3px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px; font-size: 24px; color: #0f172a; }
  .header p { margin: 0; font-size: 13px; color: #64748b; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .summary-card { flex: 1; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; text-align: center; }
  .summary-card .value { font-size: 28px; font-weight: 700; margin: 0; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #1e293b; background: #f9fafb; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head><body>
<div class="header">
  <h1>${currentFramework.name} - Compliance Report</h1>
  <p>${currentFramework.description} | Generated: ${date} | Covering last 30 days</p>
</div>
<div class="summary">
  <div class="summary-card"><p class="value" style="color:#0f172a;">${passRate}%</p><p class="label">Overall Pass Rate</p></div>
  <div class="summary-card"><p class="value" style="color:#22c55e;">${passCount}</p><p class="label">Passing</p></div>
  <div class="summary-card"><p class="value" style="color:#eab308;">${partialCount}</p><p class="label">Partial</p></div>
  <div class="summary-card"><p class="value" style="color:#ef4444;">${failCount}</p><p class="label">Failing</p></div>
</div>
<h2 style="font-size:16px;margin-bottom:8px;">Control Mapping</h2>
<table>
  <thead><tr><th>Status</th><th>Control</th><th>Title</th><th>Description</th><th>Evidence</th></tr></thead>
  <tbody>${controlRows}</tbody>
</table>
<div class="footer">Tiresias SoulWatch Compliance Report | Generated ${new Date().toISOString()} | ${currentFramework.passingControls} of ${currentFramework.controls} controls passing</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Compliance Reports</h1>
        <div className="flex items-center gap-3">
          <button onClick={handleExportPDF} className="group px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export PDF
          </button>
          <button onClick={handleExportCSV} className="group px-4 py-2 rounded-lg bg-of-surface-container-highest text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all flex items-center gap-2">
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
                    <div className="pl-[72px] flex items-center gap-2 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEvidenceModal({
                            control: section.control,
                            title: section.title,
                            status: section.status,
                            description: section.description,
                            evidence: section.evidence,
                            framework: currentFramework.name,
                          });
                        }}
                        className="px-3 py-1.5 rounded-md bg-of-primary/10 text-of-primary border border-of-primary/20 text-xs font-medium hover:bg-of-primary/20 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        View Evidence
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadEvidence(section);
                        }}
                        className="px-3 py-1.5 rounded-md bg-of-surface-container-high text-foreground-muted border border-white/10 text-xs font-medium hover:text-foreground transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download JSON
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Evidence Detail Modal */}
      <AnimatePresence>
        {evidenceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setEvidenceModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Evidence: {evidenceModal.control} - {evidenceModal.title}
                  </h3>
                  <p className="text-xs text-foreground-subtle mt-0.5">{evidenceModal.framework}</p>
                </div>
                <button
                  onClick={() => setEvidenceModal(null)}
                  className="p-1 rounded-md hover:bg-white/10 transition-colors text-foreground-subtle"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge[evidenceModal.status]}`}>
                    {statusLabel[evidenceModal.status]}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mb-1">Control Description</p>
                  <p className="text-sm text-foreground-muted leading-relaxed">{evidenceModal.description}</p>
                </div>
                <div>
                  <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mb-1">Evidence Summary</p>
                  <div className="p-3 rounded-lg bg-of-surface-container-lowest border border-white/5">
                    <p className="text-sm text-foreground leading-relaxed">{evidenceModal.evidence}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-foreground-subtle uppercase tracking-wider mb-1">Collection Metadata</p>
                  <div className="p-3 rounded-lg bg-of-surface-container-lowest border border-white/5 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground-subtle">Source</span>
                      <span className="text-foreground-muted">SoulWatch Telemetry</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground-subtle">Coverage Period</span>
                      <span className="text-foreground-muted">Last 30 days</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground-subtle">Collected At</span>
                      <span className="text-foreground-muted font-mono">{new Date().toISOString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  onClick={() => {
                    const section: ReportSection = {
                      control: evidenceModal.control,
                      title: evidenceModal.title,
                      status: evidenceModal.status as ReportSection["status"],
                      description: evidenceModal.description,
                      evidence: evidenceModal.evidence,
                    };
                    handleDownloadEvidence(section);
                  }}
                  className="px-3 py-1.5 rounded-md bg-of-surface-container-high text-foreground-muted border border-white/10 text-xs font-medium hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download JSON
                </button>
                <button
                  onClick={() => setEvidenceModal(null)}
                  className="px-3 py-1.5 rounded-md bg-of-primary/10 text-of-primary border border-of-primary/20 text-xs font-medium hover:bg-of-primary/20 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
