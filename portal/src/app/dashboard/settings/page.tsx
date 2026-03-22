"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBranding, type BrandingConfig } from "@/lib/branding";
import { TierGate } from "@/components/dashboard/TierGate";
import { api, ApiError } from "@/lib/api";
import { useSearchParams } from "next/navigation";

type Tab = "general" | "api-keys" | "siem" | "notifications" | "billing" | "white-label";

// --- API response types (from Plan 17-01 backend) ---

interface SoulkeyItem {
  id: string;
  label: string | null;
  persona_id: string;
  status: "active" | "suspended" | "revoked";
  issued_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
}

interface CreateKeyResponse {
  id: string;
  label: string;
  persona_id: string;
  raw_key: string;
  issued_at: string | null;
  expires_at: string | null;
  status: string;
}

interface GraceStatus {
  tenant_id: string;
  status: string;
  payment_failed_at: string | null;
  grace_deadline: string | null;
  days_remaining: number | null;
}

interface KeyUsage {
  window: string;
  request_count: number;
}

// Legacy types for static siem/notifications (unchanged)
interface SiemDestination { id: string; type: string; endpoint: string; status: "Connected" | "Error"; }
interface NotificationChannel { id: string; name: string; icon: string; enabled: boolean; config: string; }

const SIEM_DESTINATIONS: SiemDestination[] = [
  { id: "1", type: "Splunk", endpoint: "https://splunk-hec.acme.internal:8088/services/collector", status: "Connected" },
  { id: "2", type: "Elastic", endpoint: "https://elastic.acme.internal:9200/_bulk", status: "Connected" },
];

const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  { id: "1", name: "Slack", icon: "#", enabled: true, config: "https://hooks.slack.com/services/T0.../B0.../xxxx" },
  { id: "2", name: "PagerDuty", icon: "!", enabled: true, config: "Integration Key: pd_key_7f3a..." },
  { id: "3", name: "Email", icon: "@", enabled: true, config: "security-alerts@acme.com" },
  { id: "4", name: "Teams", icon: "T", enabled: false, config: "Not configured" },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "api-keys", label: "API Keys" },
  { id: "siem", label: "SIEM Integration" },
  { id: "notifications", label: "Notifications" },
  { id: "billing", label: "Billing" },
  { id: "white-label", label: "White Label" },
];

// Tier display config
const TIER_LABELS: Record<string, string> = {
  community: "Community",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
  mssp: "MSSP",
  saas: "SaaS",
};

const UPGRADE_OPTIONS = [
  { tier: "pro", label: "Upgrade to Pro", priceId: "price_pro" },
  { tier: "enterprise", label: "Upgrade to Enterprise", priceId: "price_enterprise" },
];

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "general";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [tenantName, setTenantName] = useState("Acme Corp");
  const [contactEmail, setContactEmail] = useState("admin@acme.com");
  const [copied, setCopied] = useState(false);
  const [channels, setChannels] = useState(NOTIFICATION_CHANNELS);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  // White Label state (WL-06 — unchanged)
  const { branding, saveBranding, previewBranding, resetPreview, loading: brandingLoading } = useBranding();
  const [draftBranding, setDraftBranding] = useState<BrandingConfig>({ ...branding });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);

  // --- API Keys state (KEY-01..04) ---
  const [keys, setKeys] = useState<SoulkeyItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keyUsage, setKeyUsage] = useState<Record<string, number>>({}); // key_id -> 24h count
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<CreateKeyResponse | null>(null);
  const [rawKeyCopied, setRawKeyCopied] = useState(false);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // --- Billing state (BILL-01..04) ---
  const [tier, setTier] = useState<string>("starter");
  const [graceStatus, setGraceStatus] = useState<GraceStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const tenantId = "tnt_acme_7f3a8b2c1d4e5f6a";

  // Fetch keys when API Keys tab is active
  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    setKeysError(null);
    try {
      const data = await api.get<{ keys: SoulkeyItem[]; total: number }>("/v1/keys");
      setKeys(data.keys);
      // Fetch 24h usage for each key
      const usageMap: Record<string, number> = {};
      await Promise.allSettled(
        data.keys.map(async (k) => {
          try {
            const u = await api.get<{ usage: KeyUsage[] }>(`/v1/keys/${k.id}/usage`);
            const h24 = u.usage.find((w) => w.window === "24h");
            usageMap[k.id] = h24?.request_count ?? 0;
          } catch {
            usageMap[k.id] = 0;
          }
        })
      );
      setKeyUsage(usageMap);
    } catch (err) {
      setKeysError(err instanceof ApiError ? err.message : "Failed to load keys");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "api-keys") fetchKeys();
  }, [activeTab, fetchKeys]);

  // Fetch billing/grace status when billing tab is active
  useEffect(() => {
    if (activeTab !== "billing") return;
    setBillingLoading(true);
    api.get<GraceStatus>("/v1/billing/grace-status")
      .then((data) => {
        setGraceStatus(data);
        if (data.status === "downgraded") setTier("community");
      })
      .catch(() => { /* grace status unavailable — show static tier */ })
      .finally(() => setBillingLoading(false));
  }, [activeTab]);

  // Sync draft branding (existing WL logic — unchanged)
  useEffect(() => {
    setDraftBranding({ ...branding });
  }, [branding.logo_url, branding.primary_color, branding.accent_color, branding.company_name, branding.favicon_url]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleChannel = (id: string) => {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const handleTest = (id: string) => {
    setTestingId(id);
    setTestSuccess(null);
    setTimeout(() => {
      setTestingId(null);
      setTestSuccess(id);
      setTimeout(() => setTestSuccess(null), 3000);
    }, 1500);
  };

  function handleBrandingFieldChange(field: keyof BrandingConfig, value: string) {
    const updated = { ...draftBranding, [field]: value || null };
    setDraftBranding(updated);
    previewBranding(updated);
  }

  async function handleSaveBranding() {
    setBrandingSaving(true);
    setBrandingSaved(false);
    try {
      await saveBranding(draftBranding);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 3000);
    } catch { /* shown inline */ } finally {
      setBrandingSaving(false);
    }
  }

  function handleResetPreview() {
    resetPreview();
    setDraftBranding({ ...branding });
  }

  // API Keys actions
  async function handleCreateKey() {
    if (!newKeyLabel.trim()) return;
    setCreating(true);
    try {
      const resp = await api.post<CreateKeyResponse>("/v1/keys", {
        label: newKeyLabel.trim(),
        expires_at: newKeyExpiry || undefined,
      });
      setNewRawKey(resp);
      setShowCreateModal(false);
      setNewKeyLabel("");
      setNewKeyExpiry("");
      await fetchKeys();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevoking(true);
    try {
      await api.delete(`/v1/keys/${keyId}`);
      setKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, status: "revoked" as const } : k));
      setRevokeTargetId(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke key");
    } finally {
      setRevoking(false);
    }
  }

  function copyRawKey() {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey.raw_key);
    setRawKeyCopied(true);
    setTimeout(() => setRawKeyCopied(false), 2000);
  }

  // Billing actions
  async function handleManageBilling() {
    try {
      const { url } = await api.post<{ url: string }>("/v1/billing/portal-session");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not open billing portal");
    }
  }

  async function handleUpgrade(newTier: string, priceId?: string) {
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const result = await api.post<{ new_tier: string }>("/v1/billing/upgrade", {
        new_tier: newTier,
        stripe_price_id: priceId,
      });
      setTier(result.new_tier);
    } catch (err) {
      setUpgradeError(err instanceof ApiError ? err.message : "Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>

      {/* Tabs with animated underline */}
      <div className="relative flex gap-1 p-1 bg-of-surface-container-high rounded-lg w-fit flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 z-10 ${
              activeTab === tab.id
                ? "text-foreground"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="settings-tab-bg"
                className="absolute inset-0 bg-of-surface-container-highest rounded-md shadow"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-6 space-y-6 max-w-2xl"
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Tenant Name</label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Tenant ID</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tenantId}
                readOnly
                className="flex-1 px-4 py-2.5 rounded-lg bg-of-surface-container-lowest border border-white/5 text-sm text-foreground-muted font-mono cursor-not-allowed"
              />
              <button
                onClick={() => handleCopy(tenantId)}
                className={`px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${
                  copied
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-of-surface-container-highest border-white/10 text-foreground-muted hover:text-foreground"
                }`}
              >
                {copied ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Copied
                  </span>
                ) : "Copy"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Primary Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)] transition-all duration-200"
            />
          </div>

          <button className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors">
            Save Changes
          </button>
        </motion.div>
      )}

      {/* API Keys Tab (KEY-01..04) */}
      {activeTab === "api-keys" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* New raw key banner (KEY-02) — shown once after creation */}
          <AnimatePresence>
            {newRawKey && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 rounded-xl bg-green-500/10 border border-green-500/25 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-green-300">Key Created — Copy Now</p>
                  <button onClick={() => setNewRawKey(null)} className="text-foreground-subtle hover:text-foreground text-xs">
                    Dismiss
                  </button>
                </div>
                <p className="text-xs text-green-400/80">This key will not be shown again. Store it securely.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/5 text-xs font-mono text-green-300 overflow-x-auto">
                    {newRawKey.raw_key}
                  </code>
                  <button
                    onClick={copyRawKey}
                    className={`shrink-0 px-3 py-2 rounded-lg border text-xs transition-all duration-200 ${
                      rawKeyCopied
                        ? "bg-green-500/10 border-green-500/20 text-green-400"
                        : "bg-of-surface-container-highest border-white/10 text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    {rawKeyCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Revoke confirmation modal (KEY-03) */}
          <AnimatePresence>
            {revokeTargetId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={() => !revoking && setRevokeTargetId(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-of-surface-container border border-of-outline-variant/20 rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">Revoke API Key?</p>
                    <p className="text-xs text-foreground-muted">This action is permanent and takes effect immediately. Any requests using this key will return 401.</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setRevokeTargetId(null)}
                      disabled={revoking}
                      className="flex-1 px-4 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRevoke(revokeTargetId)}
                      disabled={revoking}
                      className="flex-1 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/20 text-sm font-semibold text-red-400 transition-colors disabled:opacity-50"
                    >
                      {revoking ? "Revoking..." : "Revoke Key"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Create key modal */}
          <AnimatePresence>
            {showCreateModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={() => !creating && setShowCreateModal(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-of-surface-container border border-of-outline-variant/20 rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm font-bold text-foreground">Create API Key</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1">Label</label>
                      <input
                        type="text"
                        placeholder="e.g. Production Agent"
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1">Expiry <span className="text-foreground-subtle">(optional)</span></label>
                      <input
                        type="datetime-local"
                        value={newKeyExpiry}
                        onChange={(e) => setNewKeyExpiry(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCreateModal(false)}
                      disabled={creating}
                      className="flex-1 px-4 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateKey}
                      disabled={creating || !newKeyLabel.trim()}
                      className="flex-1 px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-50"
                    >
                      {creating ? "Creating..." : "Create Key"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Key list table */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors"
            >
              + Create New Key
            </button>
          </div>

          <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
            {keysLoading && (
              <div className="py-12 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-of-primary/30 border-t-of-primary animate-spin" />
              </div>
            )}
            {keysError && (
              <div className="py-8 text-center text-sm text-red-400">{keysError}</div>
            )}
            {!keysLoading && !keysError && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Label</th>
                      <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Created</th>
                      <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Last Used</th>
                      <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">24h Requests</th>
                      <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-foreground-subtle">
                          No API keys yet. Create one to get started.
                        </td>
                      </tr>
                    )}
                    {keys.map((key) => (
                      <tr key={key.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200">
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-foreground">{key.label ?? key.persona_id}</p>
                          <p className="text-[10px] text-foreground-subtle font-mono mt-0.5">{key.id.slice(0, 8)}&hellip;</p>
                        </td>
                        <td className="px-4 py-3 text-foreground-muted text-xs">
                          {key.issued_at ? new Date(key.issued_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground-muted text-xs font-mono">
                          {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}
                        </td>
                        <td className="px-4 py-3 text-foreground-muted text-xs">
                          {keyUsage[key.id] ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            key.status === "active"
                              ? "bg-green-500/15 text-green-400 border border-green-500/20"
                              : key.status === "revoked"
                              ? "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                              : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                          }`}>
                            {key.status.charAt(0).toUpperCase() + key.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {key.status === "active" && (
                            <button
                              onClick={() => setRevokeTargetId(key.id)}
                              className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 hover:shadow-[0_0_8px_rgba(239,68,68,0.1)] transition-all duration-200"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* SIEM Tab */}
      {activeTab === "siem" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-end">
            <button className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors">
              + Add Destination
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SIEM_DESTINATIONS.map((dest) => (
              <div key={dest.id} className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      dest.type === "Splunk" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
                    }`}>
                      {dest.type[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{dest.type}</p>
                      <p className="text-[10px] text-foreground-subtle">SIEM Integration</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    dest.status === "Connected"
                      ? "bg-green-500/15 text-green-400 border border-green-500/20"
                      : "bg-red-500/15 text-red-400 border border-red-500/20"
                  }`}>
                    {dest.status}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Endpoint</label>
                  <p className="text-xs text-foreground-muted font-mono bg-of-surface-container-lowest rounded-lg px-3 py-2 border border-white/5 truncate">
                    {dest.endpoint}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-foreground-muted hover:text-foreground transition-all duration-200">
                    Configure
                  </button>
                  <button
                    onClick={() => handleTest(dest.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-all duration-200 flex items-center gap-1.5 ${
                      testSuccess === dest.id
                        ? "border-green-500/20 text-green-400 bg-green-500/5"
                        : "border-of-primary/20 text-of-primary hover:bg-of-primary/10"
                    }`}
                  >
                    {testingId === dest.id ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Testing...
                      </>
                    ) : testSuccess === dest.id ? (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        Success
                      </>
                    ) : (
                      "Test"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {channels.map((channel) => (
            <div key={channel.id} className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-of-surface-container-highest flex items-center justify-center text-lg font-bold text-foreground-muted">
                    {channel.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{channel.name}</p>
                    <p className="text-[10px] text-foreground-subtle">Notification Channel</p>
                  </div>
                </div>
                {/* Smooth toggle switch */}
                <button
                  onClick={() => toggleChannel(channel.id)}
                  className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                    channel.enabled
                      ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.2)]"
                      : "bg-of-surface-container-high"
                  }`}
                >
                  <motion.div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                    animate={{
                      left: channel.enabled ? "calc(100% - 1.375rem)" : "0.125rem",
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">
                  {channel.name === "Email" ? "Recipient" : channel.name === "PagerDuty" ? "Integration" : "Webhook URL"}
                </label>
                <p className="text-xs text-foreground-muted font-mono bg-of-surface-container-lowest rounded-lg px-3 py-2 border border-white/5 truncate">
                  {channel.config}
                </p>
              </div>

              <button
                onClick={() => handleTest(`notif-${channel.id}`)}
                className={`w-full px-3 py-1.5 rounded-lg border text-xs transition-all duration-200 flex items-center justify-center gap-1.5 ${
                  testSuccess === `notif-${channel.id}`
                    ? "border-green-500/20 text-green-400 bg-green-500/5"
                    : "border-of-primary/20 text-of-primary hover:bg-of-primary/10"
                }`}
              >
                {testingId === `notif-${channel.id}` ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : testSuccess === `notif-${channel.id}` ? (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Sent Successfully
                  </>
                ) : (
                  "Send Test"
                )}
              </button>
            </div>
          ))}
        </motion.div>
      )}

      {/* Billing Tab (BILL-01, BILL-02, BILL-04) */}
      {activeTab === "billing" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 max-w-lg"
        >
          {/* Payment failure banner (BILL-04) */}
          {graceStatus?.status === "payment_failed" && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/25">
              <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300">Payment Failed</p>
                <p className="text-xs text-red-400/80 mt-0.5">
                  Update your payment method to avoid service interruption.
                  {graceStatus.days_remaining !== null && (
                    <> <span className="font-semibold">{graceStatus.days_remaining} day{graceStatus.days_remaining !== 1 ? "s" : ""} remaining</span> in grace period.</>
                  )}
                </p>
              </div>
              <button
                onClick={handleManageBilling}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold text-red-300 transition-colors"
              >
                Fix Now
              </button>
            </div>
          )}

          {/* Current plan card */}
          <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Current Plan</p>
                <p className="text-xl font-bold text-gradient-gold mt-1">
                  {billingLoading ? "Loading..." : (TIER_LABELS[tier] ?? tier)}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                graceStatus?.status === "payment_failed"
                  ? "bg-red-500/15 text-red-400 border-red-500/20"
                  : "bg-green-500/15 text-green-400 border-green-500/20"
              }`}>
                {graceStatus?.status === "payment_failed" ? "Payment Failed" : "Active"}
              </span>
            </div>

            {/* Manage billing */}
            <button
              onClick={handleManageBilling}
              className="w-full px-4 py-2.5 rounded-lg bg-of-surface-container-high border border-white/10 text-sm font-medium text-foreground hover:text-of-primary hover:border-of-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
              Manage Billing
            </button>
          </div>

          {/* Upgrade options */}
          {upgradeError && (
            <p className="text-xs text-red-400">{upgradeError}</p>
          )}
          <div className="space-y-2">
            <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Upgrade Plan</p>
            <div className="flex gap-3 flex-wrap">
              {UPGRADE_OPTIONS.filter((o) => o.tier !== tier).map((opt) => (
                <button
                  key={opt.tier}
                  onClick={() => handleUpgrade(opt.tier, opt.priceId)}
                  disabled={upgrading}
                  className="px-5 py-2.5 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-50"
                >
                  {upgrading ? "Upgrading..." : opt.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* White Label Tab (WL-06) */}
      {activeTab === "white-label" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <TierGate requiredTier="mssp" featureLabel="White Label Branding">
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-bold text-of-on-surface mb-1">White Label Branding</h2>
                <p className="text-xs text-of-on-surface-variant">
                  Customize the portal with your company&#39;s brand identity.
                  Changes are previewed live &mdash; click Save to commit.
                </p>
              </div>

              {/* Two-column layout: form + preview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left: form inputs */}
                <div className="space-y-4">
                  {/* Company Name */}
                  <div>
                    <label className="block text-xs font-semibold text-of-on-surface-variant mb-1">Company Name</label>
                    <input
                      type="text"
                      placeholder="Acme Corp"
                      value={draftBranding.company_name ?? ""}
                      onChange={(e) => handleBrandingFieldChange("company_name", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-of-surface-container border border-of-outline-variant/20 text-sm text-of-on-surface placeholder-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/50"
                    />
                  </div>

                  {/* Logo URL */}
                  <div>
                    <label className="block text-xs font-semibold text-of-on-surface-variant mb-1">Logo URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={draftBranding.logo_url ?? ""}
                      onChange={(e) => handleBrandingFieldChange("logo_url", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-of-surface-container border border-of-outline-variant/20 text-sm text-of-on-surface placeholder-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/50"
                    />
                    <p className="mt-1 text-[11px] text-of-on-surface-variant/60">PNG or SVG recommended. Displayed at 32px height.</p>
                  </div>

                  {/* Favicon URL */}
                  <div>
                    <label className="block text-xs font-semibold text-of-on-surface-variant mb-1">Favicon URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/favicon.ico"
                      value={draftBranding.favicon_url ?? ""}
                      onChange={(e) => handleBrandingFieldChange("favicon_url", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-of-surface-container border border-of-outline-variant/20 text-sm text-of-on-surface placeholder-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/50"
                    />
                  </div>

                  {/* Primary Color */}
                  <div>
                    <label className="block text-xs font-semibold text-of-on-surface-variant mb-1">Primary Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draftBranding.primary_color ?? "#5adace"}
                        onChange={(e) => handleBrandingFieldChange("primary_color", e.target.value)}
                        className="h-9 w-12 rounded cursor-pointer bg-transparent border border-of-outline-variant/20"
                      />
                      <input
                        type="text"
                        placeholder="#5adace"
                        value={draftBranding.primary_color ?? ""}
                        onChange={(e) => handleBrandingFieldChange("primary_color", e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-of-surface-container border border-of-outline-variant/20 text-sm text-of-on-surface placeholder-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/50 font-mono"
                      />
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div>
                    <label className="block text-xs font-semibold text-of-on-surface-variant mb-1">Accent Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draftBranding.accent_color ?? "#bdc7dc"}
                        onChange={(e) => handleBrandingFieldChange("accent_color", e.target.value)}
                        className="h-9 w-12 rounded cursor-pointer bg-transparent border border-of-outline-variant/20"
                      />
                      <input
                        type="text"
                        placeholder="#bdc7dc"
                        value={draftBranding.accent_color ?? ""}
                        onChange={(e) => handleBrandingFieldChange("accent_color", e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-of-surface-container border border-of-outline-variant/20 text-sm text-of-on-surface placeholder-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/50 font-mono"
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveBranding}
                      disabled={brandingSaving}
                      className="px-5 py-2 rounded-lg bg-of-primary text-of-on-primary text-xs font-bold hover:bg-of-primary/90 transition-colors disabled:opacity-50"
                    >
                      {brandingSaving ? "Saving..." : brandingSaved ? "Saved!" : "Save Branding"}
                    </button>
                    <button
                      onClick={handleResetPreview}
                      className="px-4 py-2 rounded-lg border border-of-outline-variant/20 text-xs font-semibold text-of-on-surface-variant hover:bg-of-surface-container transition-colors"
                    >
                      Reset Preview
                    </button>
                  </div>
                </div>

                {/* Right: live preview panel */}
                <div className="rounded-xl border border-of-outline-variant/10 bg-of-surface-container-low overflow-hidden">
                  <div className="px-4 py-3 border-b border-of-outline-variant/10">
                    <p className="text-[11px] font-bold text-of-on-surface-variant uppercase tracking-wider">Live Preview</p>
                  </div>
                  <div className="p-4 space-y-3">
                    {/* Mini sidebar preview */}
                    <div className="rounded-lg border border-of-outline-variant/10 bg-of-surface-container p-3 flex items-center gap-3">
                      {draftBranding.logo_url ? (
                        <img
                          src={draftBranding.logo_url}
                          alt="Logo preview"
                          className="h-6 w-auto object-contain max-w-[80px]"
                        />
                      ) : (
                        <div className="h-6 w-20 rounded bg-of-primary/20 flex items-center justify-center">
                          <span className="text-[9px] font-black text-of-primary tracking-wider">TIRESIAS</span>
                        </div>
                      )}
                      <span className="text-xs font-semibold text-of-on-surface truncate">
                        {draftBranding.company_name ?? "Your Company"}
                      </span>
                    </div>

                    {/* Color swatches */}
                    <div className="flex gap-2">
                      <div
                        className="h-8 flex-1 rounded-lg border border-of-outline-variant/10 flex items-center justify-center text-[10px] font-bold"
                        style={{ backgroundColor: draftBranding.primary_color ?? "var(--of-primary)", color: "var(--of-on-primary, #003733)" }}
                      >
                        Primary
                      </div>
                      <div
                        className="h-8 flex-1 rounded-lg border border-of-outline-variant/10 flex items-center justify-center text-[10px] font-bold"
                        style={{ backgroundColor: draftBranding.accent_color ?? "var(--of-secondary)", color: "#1a1b21" }}
                      >
                        Accent
                      </div>
                    </div>

                    {/* Document title preview */}
                    <div className="rounded-lg border border-of-outline-variant/10 bg-of-surface-container-high px-3 py-2">
                      <p className="text-[10px] text-of-on-surface-variant font-mono">
                        Page Title: Dashboard | {draftBranding.company_name ?? "Tiresias"}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </TierGate>
        </motion.div>
      )}
    </div>
  );
}
