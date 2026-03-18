"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AccessRule {
  id: string;
  type: "ip_allow" | "ip_block" | "geo_allow" | "geo_deny";
  value: string;
  priority: number;
  enabled: boolean;
  hitCount: number;
  lastHit: string;
  note: string;
}

const INITIAL_RULES: AccessRule[] = [
  { id: "acr_1", type: "ip_allow", value: "10.0.0.0/8", priority: 1, enabled: true, hitCount: 92400, lastHit: "1 sec ago", note: "Internal network" },
  { id: "acr_2", type: "ip_allow", value: "172.16.0.0/12", priority: 2, enabled: true, hitCount: 48200, lastHit: "3 sec ago", note: "Private range" },
  { id: "acr_3", type: "ip_block", value: "45.227.0.0/16", priority: 3, enabled: true, hitCount: 1234, lastHit: "12 min ago", note: "Known bot farm" },
  { id: "acr_4", type: "ip_block", value: "103.21.244.0/22", priority: 4, enabled: true, hitCount: 567, lastHit: "1 hour ago", note: "Suspicious CIDR" },
  { id: "acr_5", type: "geo_allow", value: "US, CA, GB, DE, FR, JP, AU", priority: 5, enabled: true, hitCount: 148000, lastHit: "1 sec ago", note: "Permitted countries" },
  { id: "acr_6", type: "geo_deny", value: "CN, RU, KP, IR", priority: 6, enabled: true, hitCount: 548, lastHit: "5 min ago", note: "Restricted regions" },
  { id: "acr_7", type: "ip_block", value: "198.51.100.0/24", priority: 7, enabled: false, hitCount: 0, lastHit: "Never", note: "Test range (disabled)" },
];

const typeBadge: Record<string, string> = {
  ip_allow: "bg-green-500/15 text-green-400 border border-green-500/20",
  ip_block: "bg-red-500/15 text-red-400 border border-red-500/20",
  geo_allow: "bg-teal-500/15 text-teal-400 border border-teal-500/20",
  geo_deny: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
};

const typeLabel: Record<string, string> = {
  ip_allow: "IP Allow",
  ip_block: "IP Block",
  geo_allow: "Geo Allow",
  geo_deny: "Geo Deny",
};

const typeIcon: Record<string, React.ReactNode> = {
  ip_allow: (
    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ip_block: (
    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  geo_allow: (
    <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  geo_deny: (
    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
};

export default function AccessPage() {
  const [rules, setRules] = useState(INITIAL_RULES);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newType, setNewType] = useState<AccessRule["type"]>("ip_block");
  const [newValue, setNewValue] = useState("");
  const [newNote, setNewNote] = useState("");
  const [testIp, setTestIp] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleAddRule = () => {
    if (!newValue.trim()) return;
    const maxPriority = Math.max(...rules.map((r) => r.priority), 0);
    const rule: AccessRule = {
      id: `acr_${Date.now()}`,
      type: newType,
      value: newValue.trim(),
      priority: maxPriority + 1,
      enabled: true,
      hitCount: 0,
      lastHit: "Never",
      note: newNote.trim(),
    };
    setRules((prev) => [...prev, rule]);
    setShowAddModal(false);
    setNewValue("");
    setNewNote("");
  };

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleTestIp = () => {
    if (!testIp.trim()) return;
    // Simulate a rule check
    const ip = testIp.trim();
    const blocked = rules.find(
      (r) => r.enabled && r.type === "ip_block" && ip.startsWith(r.value.split(".").slice(0, 2).join("."))
    );
    if (blocked) {
      setTestResult(`BLOCKED - Matched rule "${blocked.note || blocked.value}" (priority ${blocked.priority})`);
    } else {
      setTestResult(`ALLOWED - No blocking rules matched for ${ip}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Access Rules</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
            {rules.filter((r) => r.enabled).length} active
          </span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors"
        >
          + Add Rule
        </button>
      </div>

      {/* Rule Test Tool */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Rule Test Tool</h3>
        <p className="text-xs text-foreground-muted mb-3">Enter an IP address to check if it would be allowed or blocked by the current ruleset.</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={testIp}
            onChange={(e) => { setTestIp(e.target.value); setTestResult(null); }}
            placeholder="e.g. 45.227.1.100"
            className="flex-1 px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground font-mono placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all"
          />
          <button
            onClick={handleTestIp}
            disabled={!testIp.trim()}
            className="px-5 py-2.5 rounded-lg bg-amber-500 text-navy-950 text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Test
          </button>
        </div>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-3 p-3 rounded-lg border text-xs font-mono ${
              testResult.startsWith("BLOCKED")
                ? "bg-red-500/5 border-red-500/20 text-red-400"
                : "bg-green-500/5 border-green-500/20 text-green-400"
            }`}
          >
            {testResult}
          </motion.div>
        )}
      </div>

      {/* Rules Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider w-12">Pri</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Value</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Note</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Hits</th>
                <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.sort((a, b) => a.priority - b.priority).map((rule, i) => (
                <motion.tr
                  key={rule.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className={`border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200 ${!rule.enabled ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <span className="text-foreground-subtle font-mono text-xs">{rule.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {typeIcon[rule.type]}
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${typeBadge[rule.type]}`}>
                        {typeLabel[rule.type]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-foreground font-mono text-xs">{rule.value}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-foreground-muted text-xs">{rule.note || "-"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-foreground-muted font-mono text-xs">{rule.hitCount.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                        rule.enabled
                          ? "bg-green-500/15 text-green-400 border border-green-500/20"
                          : "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                      }`}
                    >
                      {rule.enabled && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                      {rule.enabled ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      Delete
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Rule Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card rounded-xl w-full max-w-lg border border-white/10 shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-foreground">Add Access Rule</h2>
                  <button onClick={() => setShowAddModal(false)} className="text-foreground-subtle hover:text-foreground transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Rule Type</label>
                    <select value={newType} onChange={(e) => setNewType(e.target.value as AccessRule["type"])}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground focus:outline-none focus:border-gold-500/50 transition-all">
                      <option value="ip_allow">IP Allow</option>
                      <option value="ip_block">IP Block</option>
                      <option value="geo_allow">Geo Allow</option>
                      <option value="geo_deny">Geo Deny</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
                      {newType.startsWith("ip") ? "IP / CIDR Range" : "Country Codes (comma-separated)"}
                    </label>
                    <input type="text" value={newValue} onChange={(e) => setNewValue(e.target.value)}
                      placeholder={newType.startsWith("ip") ? "e.g. 192.168.0.0/16" : "e.g. US, GB, DE"}
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground font-mono placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Note (optional)</label>
                    <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)}
                      placeholder="e.g. Known bot farm"
                      className="w-full px-4 py-2.5 rounded-lg bg-navy-800 border border-white/10 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 transition-all" />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                  <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg bg-navy-700 text-foreground-muted border border-white/10 text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                  <button onClick={handleAddRule} disabled={!newValue.trim()}
                    className="px-5 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Add Rule
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
