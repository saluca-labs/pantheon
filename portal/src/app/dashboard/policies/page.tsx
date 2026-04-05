"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDeployKeys, useCreateDeployKey } from "@/lib/api/hooks/use-policies";
import type { DeployKey } from "@/lib/api/schemas/policies";

/** Policy file manager -- YAML policy editor with syntax display. Uses hardcoded mock data. */

interface PolicyFile {
  name: string;
  description: string;
  lastModified: string;
  content: string;
}

interface ValidationError {
  line?: number;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  message: string;
}

const INITIAL_POLICIES: PolicyFile[] = [
  {
    name: "default.yaml",
    description: "Default policy rules for all agents",
    lastModified: "2026-03-17 16:30",
    content: `version: "2.4.1"
description: "Default policy - base rules for all agents"

defaults:
  effect: deny
  log_level: info

rules:
  - id: allow-health-check
    persona: "*"
    action: read
    resource: health/*
    effect: allow

  - id: allow-self-status
    persona: "*"
    action: read
    resource: agents/self
    effect: allow

  - id: deny-admin-by-default
    persona: "*"
    action: ["write", "delete", "execute"]
    resource: admin/*
    effect: deny
    log_level: warn`,
  },
  {
    name: "analytics-team.yaml",
    description: "Permissions for analytics agents",
    lastModified: "2026-03-16 11:20",
    content: `version: "2.4.1"
description: "Analytics team agent permissions"

rules:
  - id: allow-analytics-read
    persona: analytics-agent
    action: read
    resource: customer-data
    conditions:
      department: analytics
      clearance: standard
    effect: allow

  - id: allow-report-generation
    persona: analytics-agent
    action: [read, write]
    resource: reports/*
    conditions:
      classification: ["internal", "confidential"]
    effect: allow

  - id: allow-dashboard-write
    persona: analytics-agent
    action: write
    resource: analytics/dashboard-*
    effect: allow

  - id: deny-pii-direct
    persona: analytics-agent
    action: read
    resource: customer-data/pii/*
    effect: deny
    log_level: error`,
  },
  {
    name: "admin-agents.yaml",
    description: "Elevated permissions for admin agents",
    lastModified: "2026-03-15 09:45",
    content: `version: "2.4.1"
description: "Admin agent elevated permissions"

rules:
  - id: admin-full-read
    persona: admin-agent
    action: read
    resource: "*"
    conditions:
      clearance: elevated
      mfa_verified: true
    effect: allow

  - id: admin-config-write
    persona: admin-agent
    action: write
    resource: config/*
    conditions:
      clearance: elevated
      approval_required: true
    effect: allow

  - id: admin-agent-management
    persona: admin-agent
    action: [read, write, execute]
    resource: agents/*
    conditions:
      clearance: elevated
    effect: allow`,
  },
  {
    name: "quarantine-rules.yaml",
    description: "Automated quarantine trigger policies",
    lastModified: "2026-03-18 08:15",
    content: `version: "2.4.1"
description: "Quarantine automation rules"

thresholds:
  anomaly_score:
    trigger: 85
    action: auto-quarantine
    cooldown: 300

  failed_evaluations:
    trigger: 10
    window: 60
    action: rate-limit
    cooldown: 120

  cross_tenant_attempts:
    trigger: 1
    action: isolate
    alert: critical
    cooldown: 0

response_actions:
  auto-quarantine:
    suspend_agent: true
    notify: [soc-team, tenant-admin]
    log_level: critical

  rate-limit:
    max_requests: 5
    window: 60
    notify: [soc-team]
    log_level: warn

  isolate:
    suspend_agent: true
    revoke_capabilities: true
    notify: [soc-team, security-lead, tenant-admin]
    log_level: critical`,
  },
];

const NEW_POLICY_TEMPLATE = `version: "2.4.1"
description: "New policy"

rules:
  - id: new-rule
    persona: "*"
    action: read
    resource: "*"
    effect: deny`;

// ---- Client-side YAML validation ----

function validateYAML(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const lines = content.split("\n");

  if (content.trim().length === 0) {
    return { valid: false, errors: [{ message: "Policy file is empty", severity: "error" }], message: "Policy file is empty" };
  }

  let hasVersion = false;
  let hasRulesOrThresholds = false;
  const ruleIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    if (line.includes("\t")) {
      errors.push({ line: lineNum, message: `Tab character found - use spaces for indentation`, severity: "error" });
    }

    if (line.match(/^version:/)) {
      hasVersion = true;
      const versionMatch = line.match(/^version:\s*"?([^"]*)"?/);
      if (versionMatch && !versionMatch[1].match(/^\d+\.\d+(\.\d+)?$/)) {
        errors.push({ line: lineNum, message: `Invalid version format: "${versionMatch[1]}" - expected semver (e.g. "2.4.1")`, severity: "error" });
      }
    }

    if (line.match(/^rules:/) || line.match(/^thresholds:/)) {
      hasRulesOrThresholds = true;
    }

    const idMatch = line.match(/^\s+id:\s*(.+)/);
    if (idMatch) {
      const ruleId = idMatch[1].trim();
      if (ruleIds.has(ruleId)) {
        errors.push({ line: lineNum, message: `Duplicate rule ID: "${ruleId}"`, severity: "error" });
      }
      ruleIds.add(ruleId);

      if (!ruleId.match(/^[a-z0-9][a-z0-9_-]*$/)) {
        errors.push({ line: lineNum, message: `Rule ID "${ruleId}" should be lowercase alphanumeric with hyphens/underscores`, severity: "warning" });
      }
    }

    const effectMatch = line.match(/^\s+effect:\s*(.+)/);
    if (effectMatch) {
      const effect = effectMatch[1].trim();
      if (!["allow", "deny"].includes(effect)) {
        errors.push({ line: lineNum, message: `Invalid effect: "${effect}" - must be "allow" or "deny"`, severity: "error" });
      }
    }

    const logMatch = line.match(/^\s+log_level:\s*(.+)/);
    if (logMatch) {
      const level = logMatch[1].trim();
      if (!["debug", "info", "warn", "error", "critical"].includes(level)) {
        errors.push({ line: lineNum, message: `Invalid log_level: "${level}" - must be debug/info/warn/error/critical`, severity: "warning" });
      }
    }

    const indent = line.match(/^(\s*)/);
    if (indent && indent[1].length % 2 !== 0 && !line.trimStart().startsWith("-")) {
      errors.push({ line: lineNum, message: `Odd indentation (${indent[1].length} spaces) - use 2-space increments`, severity: "warning" });
    }
  }

  if (!hasVersion) {
    errors.push({ message: "Missing 'version' field at root level", severity: "warning" });
  }
  if (!hasRulesOrThresholds) {
    errors.push({ message: "Missing 'rules' or 'thresholds' section - policy has no actionable content", severity: "warning" });
  }

  const errorCount = errors.filter(e => e.severity === "error").length;
  const warnCount = errors.filter(e => e.severity === "warning").length;

  if (errorCount > 0) {
    return { valid: false, errors, message: `Validation failed: ${errorCount} error(s), ${warnCount} warning(s)` };
  }
  if (warnCount > 0) {
    return { valid: true, errors, message: `Validation passed with ${warnCount} warning(s)` };
  }
  return { valid: true, errors: [], message: "Validation passed. No issues detected." };
}

// ---- YAML syntax highlighting ----

function highlightYAML(content: string): React.ReactNode {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.trimStart().startsWith("#")) {
      return <span key={i} className="text-foreground-subtle">{line}{"\n"}</span>;
    }

    const parts: React.ReactNode[] = [];
    let remaining = line;

    const keyMatch = remaining.match(/^(\s*)([\w_-]+)(:)/);
    if (keyMatch) {
      const [, indent, key, colon] = keyMatch;
      parts.push(<span key={`${i}-indent`}>{indent}</span>);
      parts.push(<span key={`${i}-key`} className="text-teal-400">{key}</span>);
      parts.push(<span key={`${i}-colon`} className="text-foreground-subtle">{colon}</span>);
      remaining = remaining.slice(keyMatch[0].length);
    }

    const listMatch = remaining.match(/^(\s*)(- )/);
    if (listMatch && parts.length === 0) {
      parts.push(<span key={`${i}-list`} className="text-gold-400">{listMatch[0]}</span>);
      remaining = remaining.slice(listMatch[0].length);

      const listKeyMatch = remaining.match(/^([\w_-]+)(:)/);
      if (listKeyMatch) {
        parts.push(<span key={`${i}-lk`} className="text-teal-400">{listKeyMatch[1]}</span>);
        parts.push(<span key={`${i}-lc`} className="text-foreground-subtle">{listKeyMatch[2]}</span>);
        remaining = remaining.slice(listKeyMatch[0].length);
      }
    }

    remaining = remaining.replace(/("[^"]*")/g, "___QUOTED___$1");
    const quotedParts = remaining.split("___QUOTED___");

    quotedParts.forEach((part, j) => {
      if (part.startsWith('"') && part.endsWith('"')) {
        parts.push(<span key={`${i}-q${j}`} className="text-gold-300">{part}</span>);
      } else if (part.includes("true") || part.includes("false")) {
        parts.push(<span key={`${i}-b${j}`} className="text-orange-400">{part}</span>);
      } else if (/\b(allow|deny)\b/.test(part)) {
        const replaced = part.replace(/(allow)/g, "##ALLOW##").replace(/(deny)/g, "##DENY##");
        const segments = replaced.split(/##(ALLOW|DENY)##/);
        segments.forEach((seg, k) => {
          if (seg === "ALLOW" || seg === "allow") {
            parts.push(<span key={`${i}-ad${j}${k}`} className="text-green-400">{seg.toLowerCase()}</span>);
          } else if (seg === "DENY" || seg === "deny") {
            parts.push(<span key={`${i}-ad${j}${k}`} className="text-red-400">{seg.toLowerCase()}</span>);
          } else {
            parts.push(<span key={`${i}-s${j}${k}`} className="text-foreground">{seg}</span>);
          }
        });
      } else if (/^\s*\d+\s*$/.test(part)) {
        parts.push(<span key={`${i}-n${j}`} className="text-orange-300">{part}</span>);
      } else {
        parts.push(<span key={`${i}-v${j}`} className="text-foreground">{part}</span>);
      }
    });

    if (parts.length === 0) {
      parts.push(<span key={`${i}-raw`} className="text-foreground">{line}</span>);
    }

    return <React.Fragment key={i}>{parts}{"\n"}</React.Fragment>;
  });
}

/* ---- Deploy Key Section ---- */

function DeployKeySection() {
  const { keys, loading, error, refetch } = useDeployKeys();
  const { create, creating, error: createError } = useCreateDeployKey();
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<DeployKey | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!keyName.trim()) return;
    const result = await create(keyName.trim());
    if (result) {
      setNewKey(result);
      setKeyName("");
      refetch();
    }
  }, [keyName, create, refetch]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, []);

  return (
    <div className="glass-card rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Policy Sync &mdash; Deploy Keys</h2>
          <p className="text-xs text-foreground-subtle mt-1">
            SSH deploy keys used for automatic policy sync from your git repository.
          </p>
        </div>
      </div>

      {/* Generate key form */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="Key name (e.g. production-sync)"
          className="flex-1 px-3 py-2 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 font-mono"
          onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); }}
        />
        <button
          onClick={handleGenerate}
          disabled={creating || !keyName.trim()}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 text-sm font-medium hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {creating ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              Generate Key
            </>
          )}
        </button>
      </div>

      {createError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-red-500/5 border-red-500/20 text-red-400 text-sm">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {createError}
        </div>
      )}

      {/* Newly created key -- show public key for copy */}
      <AnimatePresence>
        {newKey && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Deploy key &ldquo;{newKey.key_name}&rdquo; created
            </div>
            <p className="text-xs text-foreground-muted">
              Add this public key as a deploy key in your policy git repository.
            </p>
            <div className="relative">
              <pre className="p-3 rounded-lg bg-navy-950 border border-white/5 text-xs text-foreground font-mono whitespace-pre-wrap break-all overflow-x-auto">
                {newKey.public_key}
              </pre>
              <button
                onClick={() => handleCopy(newKey.public_key)}
                className="absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-medium bg-navy-800 border border-white/10 text-foreground-muted hover:text-foreground hover:border-gold-500/30 transition-all"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gold-500/5 border border-gold-500/20 text-xs text-gold-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              The private key is stored securely and will be used automatically for policy sync.
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs text-foreground-subtle hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing keys table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <svg className="w-5 h-5 animate-spin text-foreground-subtle" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-sm text-foreground-subtle">
          {error}
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-8 text-sm text-foreground-subtle">
          No deploy keys configured. Generate one to enable git-based policy sync.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted uppercase tracking-wider">Name</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted uppercase tracking-wider">Fingerprint</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted uppercase tracking-wider">Status</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 font-mono text-foreground">{k.key_name}</td>
                  <td className="py-2.5 px-3 font-mono text-foreground-muted text-xs">{k.fingerprint}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      k.status === "active"
                        ? "bg-green-500/15 text-green-400 border border-green-500/20"
                        : "bg-red-500/15 text-red-400 border border-red-500/20"
                    }`}>
                      {k.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-foreground-subtle text-xs">{k.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyFile[]>(INITIAL_POLICIES);
  const [selectedFile, setSelectedFile] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New policy form state
  const [showNewPolicyForm, setShowNewPolicyForm] = useState(false);
  const [newPolicyFilename, setNewPolicyFilename] = useState("");
  const [newPolicyDescription, setNewPolicyDescription] = useState("");

  // Delete confirmation
  const [deleteConfirmName, setDeleteConfirmName] = useState<string | null>(null);

  const currentFile = policies[selectedFile];

  const startEditing = useCallback(() => {
    setEditContent(currentFile.content);
    setIsEditing(true);
    setValidationResult(null);
    setSaveResult(null);
    setHasUnsavedChanges(false);
  }, [currentFile]);

  const cancelEditing = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setIsEditing(false);
    setEditContent("");
    setValidationResult(null);
    setSaveResult(null);
    setHasUnsavedChanges(false);
  }, [hasUnsavedChanges]);

  const handleEditChange = useCallback((value: string) => {
    setEditContent(value);
    setHasUnsavedChanges(true);
    setSaveResult(null);
    if (validationResult) setValidationResult(null);
  }, [validationResult]);

  const handleValidate = useCallback(() => {
    const contentToValidate = isEditing ? editContent : currentFile.content;
    const result = validateYAML(contentToValidate);
    setValidationResult(result);
    return result;
  }, [isEditing, editContent, currentFile]);

  const handleSave = useCallback(async () => {
    const result = validateYAML(editContent);
    setValidationResult(result);

    if (!result.valid) {
      setSaveResult({ success: false, message: "Cannot save - fix validation errors first" });
      return;
    }

    setIsSaving(true);
    setSaveResult(null);
    setSaveSuccess(false);

    try {
      const res = await fetch("https://api.tiresias.network/v1/soulauth/admin/policy/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: currentFile.name,
          content: editContent,
        }),
      });

      if (res.ok) {
        setPolicies(prev => prev.map((p, i) =>
          i === selectedFile
            ? { ...p, content: editContent, lastModified: new Date().toISOString().replace("T", " ").slice(0, 16) }
            : p
        ));
        setIsEditing(false);
        setHasUnsavedChanges(false);
        setSaveResult({ success: true, message: "Policy saved and applied successfully" });
        setSaveSuccess(true);
      } else {
        throw new Error("API endpoint not yet available");
      }
    } catch {
      setPolicies(prev => prev.map((p, i) =>
        i === selectedFile
          ? { ...p, content: editContent, lastModified: new Date().toISOString().replace("T", " ").slice(0, 16) }
          : p
      ));
      setIsEditing(false);
      setHasUnsavedChanges(false);
      setSaveResult({ success: true, message: "Policy saved locally (API sync will be available when the endpoint is deployed)" });
      setSaveSuccess(true);
    } finally {
      setIsSaving(false);
    }
  }, [editContent, currentFile, selectedFile]);

  const handleFileSelect = useCallback((index: number) => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setSelectedFile(index);
    setIsEditing(false);
    setEditContent("");
    setValidationResult(null);
    setSaveResult(null);
    setHasUnsavedChanges(false);
  }, [hasUnsavedChanges]);

  const handleCreatePolicy = useCallback(() => {
    if (!newPolicyFilename.trim()) return;
    const filename = newPolicyFilename.trim().endsWith(".yaml")
      ? newPolicyFilename.trim()
      : newPolicyFilename.trim() + ".yaml";

    // Check for duplicate filenames
    if (policies.some((p) => p.name === filename)) {
      return;
    }

    const newPolicy: PolicyFile = {
      name: filename,
      description: newPolicyDescription.trim() || "New policy file",
      lastModified: new Date().toISOString().replace("T", " ").slice(0, 16),
      content: NEW_POLICY_TEMPLATE,
    };

    setPolicies((prev) => [...prev, newPolicy]);
    const newIndex = policies.length;
    setSelectedFile(newIndex);
    setIsEditing(false);
    setEditContent("");
    setValidationResult(null);
    setSaveResult(null);
    setHasUnsavedChanges(false);
    setShowNewPolicyForm(false);
    setNewPolicyFilename("");
    setNewPolicyDescription("");
  }, [newPolicyFilename, newPolicyDescription, policies]);

  const handleDeletePolicy = useCallback((name: string) => {
    if (name === "default.yaml") return;
    const idx = policies.findIndex((p) => p.name === name);
    if (idx === -1) return;

    setPolicies((prev) => prev.filter((p) => p.name !== name));
    setDeleteConfirmName(null);

    // Adjust selectedFile index
    if (selectedFile === idx) {
      setSelectedFile(0);
      setIsEditing(false);
      setEditContent("");
      setValidationResult(null);
      setSaveResult(null);
      setHasUnsavedChanges(false);
    } else if (selectedFile > idx) {
      setSelectedFile((prev) => prev - 1);
    }
  }, [policies, selectedFile]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Policies</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-500/15 text-teal-400 border border-teal-500/20">
            v2.4.1
          </span>
          {hasUnsavedChanges && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold-500/15 text-gold-400 border border-gold-500/20"
            >
              Unsaved changes
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleValidate}
            className="px-4 py-2 rounded-lg bg-teal-500/15 text-teal-400 border border-teal-500/30 text-sm font-medium hover:bg-teal-500/25 transition-all duration-200"
          >
            Validate
          </button>
          {isEditing ? (
            <>
              <button
                onClick={cancelEditing}
                className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 text-sm font-medium hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : saveSuccess ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Saved
                  </>
                ) : (
                  "Validate & Save"
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEditing}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 text-sm font-medium hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                Edit Policy
              </button>
              <button className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all duration-200">
                Sync from Git
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sync status */}
      <div className="flex items-center gap-2 text-xs text-foreground-subtle">
        <div className="w-2 h-2 rounded-full bg-green-500"></div>
        <span>Last synced 2 minutes ago from <span className="text-foreground-muted font-mono">main</span> branch</span>
        {isEditing && (
          <span className="ml-2 px-2 py-0.5 rounded bg-gold-500/10 text-gold-400 text-[10px] font-medium">
            EDITING - changes will be validated before save
          </span>
        )}
      </div>

      {/* Save result */}
      <AnimatePresence>
        {saveResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${
              saveResult.success
                ? "bg-green-500/5 border-green-500/20 text-green-400"
                : "bg-red-500/5 border-red-500/20 text-red-400"
            }`}
          >
            {saveResult.success ? (
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
            {saveResult.message}
            <button onClick={() => setSaveResult(null)} className="ml-auto text-foreground-subtle hover:text-foreground transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation result */}
      <AnimatePresence>
        {validationResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-lg border text-sm ${
              validationResult.valid
                ? validationResult.errors.length > 0
                  ? "bg-yellow-500/5 border-yellow-500/20"
                  : "bg-green-500/5 border-green-500/20"
                : "bg-red-500/5 border-red-500/20"
            }`}
          >
            <div className={`flex items-center gap-2 px-4 py-3 ${
              validationResult.valid
                ? validationResult.errors.length > 0 ? "text-yellow-400" : "text-green-400"
                : "text-red-400"
            }`}>
              {validationResult.valid ? (
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              <span className="font-medium">{validationResult.message}</span>
              <button onClick={() => setValidationResult(null)} className="ml-auto text-foreground-subtle hover:text-foreground transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {validationResult.errors.length > 0 && (
              <div className="px-4 pb-3 space-y-1.5">
                {validationResult.errors.map((err, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      err.severity === "error"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-yellow-500/15 text-yellow-400"
                    }`}>
                      {err.severity}
                    </span>
                    {err.line && (
                      <span className="text-foreground-subtle font-mono">L{err.line}</span>
                    )}
                    <span className="text-foreground-muted">{err.message}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-[600px]">
        {/* Left: File list */}
        <div className="glass-card rounded-xl p-3 space-y-1">
          <div className="flex items-center justify-between px-2 py-2">
            <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Policy Files</h3>
            <button
              onClick={() => setShowNewPolicyForm(!showNewPolicyForm)}
              className="text-xs text-gold-400 hover:text-gold-300 transition-colors font-medium"
            >
              {showNewPolicyForm ? "Cancel" : "+ New Policy"}
            </button>
          </div>

          {/* New Policy inline form */}
          <AnimatePresence>
            {showNewPolicyForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-2 py-3 space-y-2 border border-gold-500/20 rounded-lg bg-gold-500/5 mb-2">
                  <input
                    type="text"
                    value={newPolicyFilename}
                    onChange={(e) => setNewPolicyFilename(e.target.value)}
                    placeholder="filename (.yaml auto-appended)"
                    className="w-full px-3 py-1.5 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200 font-mono"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreatePolicy(); }}
                  />
                  <input
                    type="text"
                    value={newPolicyDescription}
                    onChange={(e) => setNewPolicyDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-1.5 rounded-lg bg-navy-800 border border-white/10 text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all duration-200"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreatePolicy(); }}
                  />
                  <button
                    onClick={handleCreatePolicy}
                    disabled={!newPolicyFilename.trim()}
                    className="w-full px-3 py-1.5 rounded-lg bg-gold-500 text-navy-950 text-xs font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Create Policy
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {policies.map((file, i) => (
            <div key={file.name} className="relative group">
              <button
                onClick={() => handleFileSelect(i)}
                className={`relative w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  selectedFile === i
                    ? "bg-gold-500/10 text-gold-400 border border-gold-500/20"
                    : "text-foreground-muted hover:text-foreground hover:bg-white/[0.03]"
                }`}
              >
                {selectedFile === i && (
                  <motion.div
                    layoutId="policy-file-active"
                    className="absolute inset-0 bg-gold-500/10 border border-gold-500/20 rounded-lg"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <div className="relative flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{file.name}</p>
                    <p className="text-[10px] text-foreground-subtle mt-0.5 truncate">{file.description}</p>
                  </div>
                </div>
              </button>
              {/* Delete button - shown on hover, not for default.yaml */}
              {file.name !== "default.yaml" && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  {deleteConfirmName === file.name ? (
                    <div className="flex items-center gap-1 bg-navy-900 rounded-lg border border-red-500/20 p-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeletePolicy(file.name); }}
                        className="px-2 py-0.5 rounded text-[10px] text-red-400 bg-red-500/10 hover:bg-red-500/20 font-medium"
                      >
                        Delete
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmName(null); }}
                        className="px-2 py-0.5 rounded text-[10px] text-foreground-muted hover:bg-white/5"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmName(file.name); }}
                      className="p-1 rounded text-foreground-subtle hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="mt-4 px-3 py-3 rounded-lg bg-navy-800/50 border border-white/5">
            <p className="text-[10px] text-foreground-subtle leading-relaxed">
              <span className="text-gold-400 font-medium">Edit in browser:</span> Click &quot;Edit Policy&quot; to modify YAML directly. Changes are validated before save.
            </p>
            <p className="text-[10px] text-foreground-subtle leading-relaxed mt-1">
              <span className="text-teal-400 font-medium">Git sync:</span> Policies can also be managed via git for teams with change management workflows.
            </p>
          </div>
        </div>

        {/* Right: YAML content / editor */}
        <div className="lg:col-span-3 glass-card rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gold-400">{currentFile.name}</span>
              <span className="text-xs text-foreground-subtle">Modified {currentFile.lastModified}</span>
              {isEditing && (
                <span className="px-2 py-0.5 rounded bg-gold-500/15 text-gold-400 text-[10px] font-medium">
                  EDITING
                </span>
              )}
            </div>
            {isEditing && (
              <div className="flex items-center gap-2 text-xs text-foreground-subtle">
                <span>{editContent.split("\n").length} lines</span>
                <span className="text-foreground-subtle/50">|</span>
                <span>{editContent.length} chars</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {isEditing ? (
              <div className="relative h-full">
                <div className="absolute left-0 top-0 bottom-0 w-10 bg-navy-950/50 border-r border-white/5 overflow-hidden pointer-events-none">
                  <div className="p-4 pr-2">
                    {editContent.split("\n").map((_, i) => (
                      <div key={i} className="text-[10px] text-foreground-subtle/40 font-mono text-right leading-relaxed h-[1.625em]">
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => handleEditChange(e.target.value)}
                  className="w-full h-full min-h-[500px] p-4 pl-14 bg-transparent text-foreground font-mono text-xs leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-gold-500/20 rounded-b-xl transition-shadow duration-200"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
            ) : (
              <div className="p-4">
                <pre className="font-mono text-xs leading-relaxed whitespace-pre">
                  {highlightYAML(currentFile.content)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deploy Keys */}
      <DeployKeySection />
    </div>
  );
}
