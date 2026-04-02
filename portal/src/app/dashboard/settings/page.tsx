/**
 * @module SettingsPage
 *
 * Settings page with 7 tabs, each governing a different configuration domain:
 *
 *  1. **general**       -- Tenant display name (placeholder for future settings)
 *  2. **api-keys**      -- SoulKey lifecycle: create, revoke, suspend/reactivate,
 *                          view per-key usage, copy raw key on creation
 *  3. **siem**          -- SIEM destination configuration (Splunk, Elastic)
 *  4. **notifications** -- Notification channel toggles (Slack, PagerDuty, email, webhook)
 *  5. **billing**       -- Grace period status, tier display, upgrade/manage subscription
 *  6. **white-label**   -- Branding configuration: company name, logo URL, favicon URL,
 *                          accent color, custom domain (enterprise+ only)
 *  7. **sso**           -- Enterprise SSO / OIDC IdP management (enterprise+ only,
 *                          rendered via `SSOSettingsTab`)
 *
 * The active tab is controlled via the `?tab=` query parameter for deep linking.
 */
"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBranding, type BrandingConfig } from "@/lib/branding";
import { TierGate } from "@/components/dashboard/TierGate";
import { api, ApiError } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { SSOSettingsTab } from "@/components/sso/SSOSettingsTab";
import { useAuth } from "@/lib/auth";
import { useUserPreferences, ALL_SIDEBAR_SECTIONS } from "@/lib/useUserPreferences";

type Tab = "general" | "api-keys" | "siem" | "notifications" | "billing" | "white-label" | "sso" | "preferences";

// Tiers with time-based license (show expiration, no Stripe)
const LICENSE_TIERS = new Set(["enterprise", "mssp"]);
// Tiers where billing tab is hidden entirely
const HIDDEN_BILLING_TIERS = new Set(["nda"]);

/** Reusable "Coming Soon" banner */
function ComingSoonBanner({ message }: { message?: string }) {
  return (
    <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3">
      <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p className="text-sm font-semibold text-amber-300">Coming Soon</p>
        {message && <p className="text-xs text-amber-400/80 mt-0.5">{message}</p>}
      </div>
    </div>
  );
}

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

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
}

// Legacy types for static siem/notifications (unchanged)
interface SiemDestination { id: string; type: string; endpoint: string; status: "Connected" | "Error"; }
interface NotificationChannel { id: string; name: string; icon: string; enabled: boolean; config: string; }

const SIEM_DESTINATIONS: SiemDestination[] = [
  { id: "1", type: "Splunk", endpoint: "https://splunk-hec.example.internal:8088/services/collector", status: "Connected" },
  { id: "2", type: "Elastic", endpoint: "https://elastic.example.internal:9200/_bulk", status: "Connected" },
];

const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  { id: "1", name: "Slack", icon: "#", enabled: true, config: "https://hooks.slack.com/services/T0.../B0.../xxxx" },
  { id: "2", name: "PagerDuty", icon: "!", enabled: true, config: "Integration Key: pd_key_7f3a..." },
  { id: "3", name: "Email", icon: "@", enabled: true, config: "alerts@example.com" },
  { id: "4", name: "Teams", icon: "T", enabled: false, config: "Not configured" },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "api-keys", label: "API Keys" },
  { id: "siem", label: "SIEM Integration" },
  { id: "notifications", label: "Notifications" },
  { id: "billing", label: "Billing" },
  { id: "white-label", label: "White Label" },
  { id: "sso", label: "SSO / Identity" },
  { id: "preferences", label: "User Preferences" },
];

/* ── Syslog Configuration Section ──────────────────────────────────── */

interface SyslogStatus {
  configured: boolean;
  enabled: boolean;
  host?: string;
  port?: number;
  protocol?: string;
  facility?: number;
  format?: string;
  connected?: boolean;
  send_count?: number;
  error_count?: number;
  last_error?: string | null;
}

const FACILITY_OPTIONS = [
  { value: 4, label: "auth (4)" },
  { value: 10, label: "authpriv (10)" },
  { value: 13, label: "audit (13)" },
  { value: 16, label: "local0 (16)" },
  { value: 17, label: "local1 (17)" },
  { value: 18, label: "local2 (18)" },
  { value: 19, label: "local3 (19)" },
  { value: 20, label: "local4 (20)" },
  { value: 21, label: "local5 (21)" },
  { value: 22, label: "local6 (22)" },
  { value: 23, label: "local7 (23)" },
];

function SyslogConfigSection() {
  const [status, setStatus] = useState<SyslogStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(true);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(514);
  const [protocol, setProtocol] = useState("udp");
  const [facility, setFacility] = useState(13);
  const [useCef, setUseCef] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/soulwatch/syslog");
      const data = await res.json();
      setStatus(data);
      if (data.configured) {
        setHost(data.host || "");
        setPort(data.port || 514);
        setProtocol(data.protocol || "udp");
        setFacility(data.facility || 13);
        setUseCef(data.format === "cef");
        setEnabled(data.enabled !== false);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/soulwatch/syslog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, host, port, protocol, facility, use_cef: useCef }),
      });
      if (res.ok) {
        setTestResult({ ok: true, message: "Configuration saved successfully." });
        await fetchStatus();
      } else {
        const err = await res.json();
        setTestResult({ ok: false, message: err.detail || "Failed to save configuration." });
      }
    } catch (e) {
      setTestResult({ ok: false, message: "Network error saving configuration." });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/soulwatch/syslog", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message || "Test message sent successfully." });
      } else {
        setTestResult({ ok: false, message: data.detail || "Test failed." });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error sending test message." });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await fetch("/api/soulwatch/syslog", { method: "DELETE" });
      setHost("");
      setPort(514);
      setProtocol("udp");
      setFacility(13);
      setUseCef(true);
      setEnabled(true);
      setTestResult({ ok: true, message: "Syslog configuration removed." });
      await fetchStatus();
    } catch {
      setTestResult({ ok: false, message: "Failed to remove configuration." });
    }
  };

  if (loading) {
    return (
      <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-of-surface-container-high rounded w-1/3" />
          <div className="h-4 bg-of-surface-container-high rounded w-2/3" />
        </div>
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-sm text-foreground focus:border-blue-500/50 focus:outline-none";
  const labelCls = "text-[11px] text-foreground-subtle uppercase tracking-wider font-medium";

  return (
    <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Syslog Forwarding</h3>
            <p className="text-[10px] text-foreground-subtle">RFC 5424 / CEF output to any SIEM</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status?.configured && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              status.connected !== false
                ? "bg-green-500/15 text-green-400 border-green-500/25"
                : "bg-red-500/15 text-red-400 border-red-500/25"
            }`}>
              {status.connected !== false ? "Connected" : "Disconnected"}
            </span>
          )}
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              enabled ? "bg-green-500" : "bg-of-surface-container-high"
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`} />
          </button>
        </div>
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className={labelCls}>Host / IP</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="syslog.example.com or 10.0.1.50"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                min={1}
                max={65535}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className={labelCls}>Protocol</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className={inputCls}
              >
                <option value="udp">UDP</option>
                <option value="tcp">TCP</option>
                <option value="tls">TLS (TCP + SSL)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Facility</label>
              <select
                value={facility}
                onChange={(e) => setFacility(Number(e.target.value))}
                className={inputCls}
              >
                {FACILITY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Format</label>
              <select
                value={useCef ? "cef" : "rfc5424"}
                onChange={(e) => setUseCef(e.target.value === "cef")}
                className={inputCls}
              >
                <option value="cef">CEF (Splunk/ArcSight/QRadar)</option>
                <option value="rfc5424">RFC 5424 (structured data)</option>
              </select>
            </div>
          </div>

          {status?.configured && status.send_count !== undefined && (
            <div className="flex gap-6 text-[11px] text-foreground-subtle pt-1">
              <span>Messages sent: <span className="text-foreground font-mono">{status.send_count}</span></span>
              <span>Errors: <span className={`font-mono ${(status.error_count || 0) > 0 ? "text-red-400" : "text-foreground"}`}>{status.error_count || 0}</span></span>
              {status.last_error && (
                <span className="text-red-400 truncate max-w-xs">Last error: {status.last_error}</span>
              )}
            </div>
          )}

          {testResult && (
            <div className={`px-3 py-2 rounded-lg text-xs border ${
              testResult.ok
                ? "bg-green-500/10 border-green-500/25 text-green-400"
                : "bg-red-500/10 border-red-500/25 text-red-400"
            }`}>
              {testResult.message}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !host}
              className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !status?.configured}
              className="px-4 py-2 rounded-lg border border-white/10 text-sm text-foreground-muted hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? "Sending..." : "Test Connection"}
            </button>
            {status?.configured && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg border border-red-500/25 text-sm text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "general";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const { session } = useAuth();
  const { prefs, setPref, resetAll: resetPrefs } = useUserPreferences();

  // Determine the effective tier for billing visibility
  const sessionTier = session?.tier || "starter";

  // Filter tabs based on tier (hide billing for NDA)
  const visibleTabs = TABS.filter((tab) => {
    if (tab.id === "billing" && HIDDEN_BILLING_TIERS.has(sessionTier)) return false;
    return true;
  });

  // Read tenant/email from OIDC data cookie (set by local/OIDC login)
  const oidcData = (() => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/tiresias_oidc_data=([^;]+)/);
    if (!match) return null;
    try { return JSON.parse(decodeURIComponent(match[1])); } catch { return null; }
  })();

  const [tenantName, setTenantName] = useState(session?.tenant_name || oidcData?.tenant_name || "");
  const [contactEmail, setContactEmail] = useState(oidcData?.email || "");
  const [copied, setCopied] = useState(false);
  const [channels, setChannels] = useState<{id: string; name: string; channel_type: string; enabled: boolean; severity_threshold: string; test_status: string | null; config: Record<string, unknown>}[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState("slack");
  const [newChannelWebhook, setNewChannelWebhook] = useState("");
  const [newChannelSeverity, setNewChannelSeverity] = useState("medium");

  // Fetch notification channels from API
  useEffect(() => {
    if (activeTab !== "notifications") return;
    setChannelsLoading(true);
    api.get<{id: string; name: string; channel_type: string; enabled: boolean; severity_threshold: string; test_status: string | null; config: Record<string, unknown>}[]>("/v1/notifications/channels")
      .then((data) => setChannels(Array.isArray(data) ? data : []))
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false));
  }, [activeTab]);

  // White Label state (WL-06 — unchanged)
  const { branding, saveBranding, previewBranding, resetPreview, loading: brandingLoading } = useBranding();
  const [draftBranding, setDraftBranding] = useState<BrandingConfig>({ ...branding });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);

  // --- API Keys state (KEY-01..04) ---
  const [allTenants, setAllTenants] = useState<TenantItem[]>([]);
  const [selectedKeysTenant, setSelectedKeysTenant] = useState(session?.tenant_id || "0c2515c2-1612-4a1a-bf72-47e760ccca51");
  const [keys, setKeys] = useState<SoulkeyItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keyUsage, setKeyUsage] = useState<Record<string, number>>({}); // key_id -> 24h count
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyPersona, setNewKeyPersona] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<CreateKeyResponse | null>(null);
  const [rawKeyCopied, setRawKeyCopied] = useState(false);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [keyDetails, setKeyDetails] = useState<Record<string, {
    id: string; tenant_id: string; persona_id: string; label: string | null;
    status: string; issued_at: string | null; expires_at: string | null;
    last_used_at: string | null; suspended_at: string | null; suspended_by: string | null;
    revoked_at: string | null; revoked_by: string | null; revocation_reason: string | null;
    parent_key_id: string | null; metadata: Record<string, unknown>;
  }>>({});
  const [keyDetailLoading, setKeyDetailLoading] = useState<string | null>(null);

  // --- Billing state (BILL-01..04) ---
  const [tier, setTier] = useState<string>("starter");
  const [graceStatus, setGraceStatus] = useState<GraceStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState(session?.tenant_id || "0c2515c2-1612-4a1a-bf72-47e760ccca51");
  const [tenantIdDraft, setTenantIdDraft] = useState(session?.tenant_id || "0c2515c2-1612-4a1a-bf72-47e760ccca51");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Fetch tenant list for the keys tab tenant selector
  useEffect(() => {
    if (activeTab !== "api-keys") return;
    api.get<TenantItem[]>("/v1/soulauth/admin/tenants")
      .then((data) => setAllTenants(Array.isArray(data) ? data : []))
      .catch(() => { /* tenant list unavailable — selector will be hidden */ });
  }, [activeTab]);

  // Fetch keys when API Keys tab is active
  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    setKeysError(null);
    try {
      const data = await api.get<SoulkeyItem[]>(`/v1/soulauth/admin/keys?tenant_id=${selectedKeysTenant}`);
      const keysList = Array.isArray(data) ? data : [];
      setKeys(keysList);
      // Fetch 24h usage for each key
      const usageMap: Record<string, number> = {};
      await Promise.allSettled(
        keysList.map(async (k) => {
          try {
            const u = await api.get<{ usage: KeyUsage[] }>(`/v1/soulauth/admin/keys/${k.id}/usage`);
            const h24 = u.usage.find((w) => w.window === "24h");
            usageMap[k.id] = h24?.request_count ?? 0;
          } catch {
            usageMap[k.id] = 0;
          }
        })
      );
      setKeyUsage(usageMap);
    } catch (err) {
      setKeysError(err instanceof ApiError ? err.message : typeof err === "object" ? JSON.stringify(err) : "Failed to load keys");
    } finally {
      setKeysLoading(false);
    }
  }, [selectedKeysTenant]);

  useEffect(() => {
    if (activeTab === "api-keys" && selectedKeysTenant) fetchKeys();
  }, [activeTab, fetchKeys, selectedKeysTenant]);

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
    if (!newKeyLabel.trim() || !newKeyPersona.trim()) return;
    setCreating(true);
    try {
      const resp = await api.post<CreateKeyResponse>("/v1/soulauth/admin/keys", {
        tenant_id: selectedKeysTenant,
        persona_id: newKeyPersona.trim(),
        label: newKeyLabel.trim(),
        expires_at: newKeyExpiry || undefined,
      });
      setNewRawKey(resp);
      setShowCreateModal(false);
      setNewKeyLabel("");
      setNewKeyPersona("");
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
      await api.post(`/v1/soulauth/admin/keys/${keyId}/revoke`, { revoked_by: "admin" });
      setKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, status: "revoked" as const } : k));
      setRevokeTargetId(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke key");
    } finally {
      setRevoking(false);
    }
  }

  async function handleExpandKey(keyId: string) {
    if (expandedKeyId === keyId) {
      setExpandedKeyId(null);
      return;
    }
    setExpandedKeyId(keyId);
    if (!keyDetails[keyId]) {
      setKeyDetailLoading(keyId);
      try {
        const detail = await api.get<{
          id: string; tenant_id: string; persona_id: string; label: string | null;
          status: string; issued_at: string | null; expires_at: string | null;
          last_used_at: string | null; suspended_at: string | null; suspended_by: string | null;
          revoked_at: string | null; revoked_by: string | null; revocation_reason: string | null;
          parent_key_id: string | null; metadata: Record<string, unknown>;
        }>(`/v1/soulauth/admin/keys/${keyId}`);
        setKeyDetails((prev) => ({ ...prev, [keyId]: detail }));
      } catch {
        // If detail fetch fails, populate from the list data we already have
        const existing = keys.find((k) => k.id === keyId);
        if (existing) {
          setKeyDetails((prev) => ({
            ...prev,
            [keyId]: {
              ...existing,
              tenant_id: selectedKeysTenant,
              suspended_at: null, suspended_by: null,
              revoked_at: null, revoked_by: null, revocation_reason: null,
              parent_key_id: null, metadata: {},
            },
          }));
        }
      } finally {
        setKeyDetailLoading(null);
      }
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
        {visibleTabs.map((tab) => (
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
                value={tenantIdDraft}
                onChange={(e) => setTenantIdDraft(e.target.value)}
                placeholder="Enter tenant UUID..."
                className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-mono transition-all duration-200 ${
                  tenantId
                    ? "bg-of-surface-container-high border-white/10 text-foreground"
                    : "bg-of-surface-container-high border-of-primary/30 text-foreground placeholder:text-foreground-muted/40"
                } focus:outline-none focus:border-of-primary/50 focus:shadow-[0_0_0_1px_rgba(212,168,83,0.15)]`}
              />
              {/* Save button — shown when draft differs from saved */}
              {tenantIdDraft && tenantIdDraft !== tenantId && (
                <button
                  onClick={async () => {
                    const res = await fetch("/api/session/tenant", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tenant_id: tenantIdDraft,
                        tenant_name: tenantName || "",
                        tier: "mssp",
                      }),
                    });
                    if (res.ok) {
                      setTenantId(tenantIdDraft);
                      window.location.reload();
                    }
                  }}
                  className="px-3 py-2.5 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-all"
                >
                  Save
                </button>
              )}
              {/* Clear button — shown when tenant is set, requires confirmation */}
              {tenantId && tenantIdDraft === tenantId && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400/70 text-xs hover:bg-red-500/10 hover:text-red-400 transition-all"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => handleCopy(tenantId || tenantIdDraft)}
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

          {/* Clear tenant confirmation modal */}
          {showClearConfirm && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
              <p className="text-sm text-red-400 font-medium">Clear tenant ID?</p>
              <p className="text-xs text-foreground-muted">This will disconnect this portal session from the current tenant. You will need to re-enter a tenant ID to access tenant-scoped data.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-3 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await fetch("/api/session/tenant", { method: "DELETE" });
                    setTenantId("");
                    setTenantIdDraft("");
                    setShowClearConfirm(false);
                    window.location.reload();
                  }}
                  className="flex-1 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/20 text-xs font-semibold text-red-400 transition-colors"
                >
                  Confirm Clear
                </button>
              </div>
            </div>
          )}

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
                      <label className="block text-xs font-medium text-foreground-muted mb-1">Persona ID</label>
                      <input
                        type="text"
                        placeholder="e.g. alfred-core"
                        value={newKeyPersona}
                        onChange={(e) => setNewKeyPersona(e.target.value)}
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
                      disabled={creating || !newKeyLabel.trim() || !newKeyPersona.trim()}
                      className="flex-1 px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors disabled:opacity-50"
                    >
                      {creating ? "Creating..." : "Create Key"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tenant selector + Create button row */}
          <div className="flex items-center justify-between gap-4">
            {allTenants.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-foreground-muted whitespace-nowrap">Tenant:</label>
                <select
                  value={selectedKeysTenant}
                  onChange={(e) => setSelectedKeysTenant(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-of-surface-container-high border border-white/10 text-sm text-foreground focus:outline-none focus:border-of-primary/50 transition-all min-w-[200px]"
                >
                  {allTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.id === tenantId ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end flex-1">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors"
              >
                + Create New Key
              </button>
            </div>
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
                    {keys.map((key) => {
                      const isExpanded = expandedKeyId === key.id;
                      const detail = keyDetails[key.id];
                      const isLoadingDetail = keyDetailLoading === key.id;
                      return (
                        <React.Fragment key={key.id}>
                          <tr
                            onClick={() => handleExpandKey(key.id)}
                            className={`border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200 cursor-pointer ${isExpanded ? "bg-white/[0.03]" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <svg
                                  className={`w-3 h-3 text-foreground-subtle transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                                <div>
                                  <p className="text-xs font-medium text-foreground">{key.label ?? key.persona_id}</p>
                                  <p className="text-[10px] text-foreground-subtle font-mono mt-0.5">{key.id.slice(0, 8)}&hellip;</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-foreground-muted text-xs">
                              {key.issued_at ? new Date(key.issued_at).toLocaleDateString() : "\u2014"}
                            </td>
                            <td className="px-4 py-3 text-foreground-muted text-xs font-mono">
                              {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}
                            </td>
                            <td className="px-4 py-3 text-foreground-muted text-xs">
                              {keyUsage[key.id] ?? "\u2014"}
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
                                  onClick={(e) => { e.stopPropagation(); setRevokeTargetId(key.id); }}
                                  className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 hover:shadow-[0_0_8px_rgba(239,68,68,0.1)] transition-all duration-200"
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-white/5">
                              <td colSpan={6} className="px-4 py-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  {isLoadingDetail ? (
                                    <div className="py-6 flex items-center justify-center">
                                      <div className="w-4 h-4 rounded-full border-2 border-of-primary/30 border-t-of-primary animate-spin" />
                                    </div>
                                  ) : detail ? (
                                    <div className="py-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Full Key ID</p>
                                        <p className="text-xs font-mono text-foreground break-all">{detail.id}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Persona ID</p>
                                        <p className="text-xs font-mono text-foreground">{detail.persona_id}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Tenant ID</p>
                                        <p className="text-xs font-mono text-foreground break-all">{detail.tenant_id}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Status</p>
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                          detail.status === "active"
                                            ? "bg-green-500/15 text-green-400 border border-green-500/20"
                                            : detail.status === "revoked"
                                            ? "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                                            : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                                        }`}>
                                          {detail.status}
                                        </span>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Created</p>
                                        <p className="text-xs text-foreground">{detail.issued_at ? new Date(detail.issued_at).toLocaleString() : "\u2014"}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Expires</p>
                                        <p className="text-xs text-foreground">{detail.expires_at ? new Date(detail.expires_at).toLocaleString() : "Never"}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Last Used</p>
                                        <p className="text-xs text-foreground">{detail.last_used_at ? new Date(detail.last_used_at).toLocaleString() : "Never"}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Parent Key</p>
                                        <p className="text-xs font-mono text-foreground">{detail.parent_key_id ?? "None (root key)"}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Label</p>
                                        <p className="text-xs text-foreground">{detail.label ?? "\u2014"}</p>
                                      </div>
                                      {detail.suspended_at && (
                                        <div>
                                          <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Suspended</p>
                                          <p className="text-xs text-yellow-400">
                                            {new Date(detail.suspended_at).toLocaleString()}
                                            {detail.suspended_by ? ` by ${detail.suspended_by}` : ""}
                                          </p>
                                        </div>
                                      )}
                                      {detail.revoked_at && (
                                        <div>
                                          <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Revoked</p>
                                          <p className="text-xs text-red-400">
                                            {new Date(detail.revoked_at).toLocaleString()}
                                            {detail.revoked_by ? ` by ${detail.revoked_by}` : ""}
                                          </p>
                                        </div>
                                      )}
                                      {detail.revocation_reason && (
                                        <div>
                                          <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Revocation Reason</p>
                                          <p className="text-xs text-red-400">{detail.revocation_reason}</p>
                                        </div>
                                      )}
                                      {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                                        <div className="col-span-full">
                                          <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-1">Metadata / Policies</p>
                                          <pre className="text-xs font-mono text-foreground bg-of-surface-container-lowest rounded-lg px-3 py-2 border border-white/5 overflow-x-auto">
                                            {JSON.stringify(detail.metadata, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="py-4 text-xs text-foreground-subtle">No details available.</div>
                                  )}
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* SIEM Tab — Syslog live, others Coming Soon */}
      {activeTab === "siem" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* ── Syslog Configuration (LIVE) ── */}
          <SyslogConfigSection />

          {/* ── Other SIEM destinations (Coming Soon) ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Other Destinations</h3>
            <ComingSoonBanner message="Splunk HEC, Elastic, and Azure Sentinel integrations are under development." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 opacity-60 pointer-events-none">
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
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-of-surface-container-high text-foreground-muted border border-white/10">
                      Pending
                    </span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Endpoint</label>
                    <p className="text-xs text-foreground-muted font-mono bg-of-surface-container-lowest rounded-lg px-3 py-2 border border-white/5 truncate">
                      {dest.endpoint}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Notifications Tab — Live */}
      {activeTab === "notifications" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Notification Channels</h3>
            <button
              onClick={() => setShowAddChannel(!showAddChannel)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
            >
              {showAddChannel ? "Cancel" : "+ Add Channel"}
            </button>
          </div>

          {/* Add Channel Form */}
          {showAddChannel && (
            <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Name</label>
                  <input
                    value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g. prod-slack"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Type</label>
                  <select
                    value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
                  >
                    <option value="slack">Slack</option>
                    <option value="pagerduty">PagerDuty</option>
                    <option value="email">Email</option>
                    <option value="teams">Teams</option>
                    <option value="webhook">Webhook</option>
                    <option value="opsgenie">OpsGenie</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">
                  {newChannelType === "email" ? "SMTP Host" : newChannelType === "pagerduty" ? "Routing Key" : "Webhook URL"}
                </label>
                <input
                  value={newChannelWebhook} onChange={(e) => setNewChannelWebhook(e.target.value)}
                  placeholder={newChannelType === "pagerduty" ? "pd_routing_key_..." : "https://..."}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-foreground-subtle uppercase tracking-wider">Min Severity</label>
                <select
                  value={newChannelSeverity} onChange={(e) => setNewChannelSeverity(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-of-surface-container-lowest border border-white/10 text-xs text-foreground"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <button
                onClick={async () => {
                  const configKey = newChannelType === "pagerduty" ? "routing_key" : "webhook_url";
                  await api.post("/v1/notifications/channels", {
                    name: newChannelName,
                    channel_type: newChannelType,
                    config: { [configKey]: newChannelWebhook },
                    severity_threshold: newChannelSeverity,
                  });
                  setShowAddChannel(false);
                  setNewChannelName(""); setNewChannelWebhook("");
                  // Refresh
                  const data = await api.get<typeof channels>("/v1/notifications/channels");
                  setChannels(Array.isArray(data) ? data : []);
                }}
                disabled={!newChannelName || !newChannelWebhook}
                className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create Channel
              </button>
            </div>
          )}

          {channelsLoading ? (
            <p className="text-xs text-foreground-muted">Loading channels...</p>
          ) : channels.length === 0 ? (
            <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-8 text-center">
              <p className="text-sm text-foreground-muted">No notification channels configured.</p>
              <p className="text-xs text-foreground-subtle mt-1">Add a channel to receive alerts for anomalies and detections.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {channels.map((channel) => (
                <div key={channel.id} className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-of-surface-container-highest flex items-center justify-center text-lg font-bold text-foreground-muted uppercase">
                        {channel.channel_type.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{channel.name}</p>
                        <p className="text-[10px] text-foreground-subtle">{channel.channel_type} &middot; {channel.severity_threshold}+</p>
                      </div>
                    </div>
                    <div
                      className={`relative w-11 h-6 rounded-full cursor-pointer ${
                        channel.enabled ? "bg-green-500/50" : "bg-of-surface-container-high"
                      }`}
                      onClick={async () => {
                        await api.put(`/v1/notifications/channels/${channel.id}`, { enabled: !channel.enabled });
                        const data = await api.get<typeof channels>("/v1/notifications/channels");
                        setChannels(Array.isArray(data) ? data : []);
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white/70 shadow-sm transition-all"
                        style={{ left: channel.enabled ? "calc(100% - 1.375rem)" : "0.125rem" }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {channel.test_status && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        channel.test_status === "passed" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {channel.test_status}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={testingId === channel.id}
                      onClick={async () => {
                        setTestingId(channel.id);
                        setTestSuccess(null);
                        try {
                          const res = await api.post<{test_status: string}>(`/v1/notifications/channels/${channel.id}/test`, {});
                          setTestSuccess(res.test_status === "passed" ? channel.id : null);
                          const data = await api.get<typeof channels>("/v1/notifications/channels");
                          setChannels(Array.isArray(data) ? data : []);
                        } finally { setTestingId(null); }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-foreground-muted hover:bg-of-surface-container-high"
                    >
                      {testingId === channel.id ? "Testing..." : "Send Test"}
                    </button>
                    <button
                      onClick={async () => {
                        await api.delete(`/v1/notifications/channels/${channel.id}`);
                        const data = await api.get<typeof channels>("/v1/notifications/channels");
                        setChannels(Array.isArray(data) ? data : []);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Billing Tab — tier-based rendering (BILL-01, BILL-02, BILL-04) */}
      {activeTab === "billing" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 max-w-lg"
        >
          {/* --- Enterprise / MSSP: license expiration view (no Stripe) --- */}
          {LICENSE_TIERS.has(sessionTier) ? (
            <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Current Plan</p>
                  <p className="text-xl font-bold text-gradient-gold mt-1">
                    {TIER_LABELS[sessionTier] ?? sessionTier}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-blue-500/15 text-blue-400 border-blue-500/20">
                  Licensed
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">License Expiration</p>
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-of-surface-container-high border border-white/10">
                  <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {session?.expires_at
                        ? new Date(session.expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                        : "Contact your account manager for details"}
                    </p>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      To renew or modify your license, contact your Tiresias account representative.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* --- SaaS / Community / Starter: Stripe billing view --- */
            <>
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
            </>
          )}
        </motion.div>
      )}


      {/* SSO / Identity Providers Tab — Coming Soon */}
      {activeTab === "sso" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <TierGate requiredTier="enterprise" featureLabel="SSO / Identity Providers">
            <ComingSoonBanner message="SSO integration requires backend configuration. Contact your administrator." />
            <div className="opacity-60 pointer-events-none">
              <SSOSettingsTab />
            </div>
          </TierGate>
        </motion.div>
      )}

      {/* White Label Tab (WL-06) — Coming Soon */}
      {activeTab === "white-label" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <TierGate requiredTier="mssp" featureLabel="White Label Branding">
            <ComingSoonBanner message="White label branding configuration is under development." />
            <div className="space-y-8 opacity-60 pointer-events-none">
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
                      placeholder="Your Company"
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

      {/* User Preferences Tab */}
      {activeTab === "preferences" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="space-y-8">
            <div>
              <h2 className="text-sm font-bold text-of-on-surface mb-1">User Preferences</h2>
              <p className="text-xs text-of-on-surface-variant">
                Personalize your portal experience. These preferences are stored locally in your browser.
              </p>
            </div>

            {/* Dashboard Layout */}
            <div className="glass-card rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-of-on-surface">Dashboard Layout</h3>
              <div className="flex gap-3">
                {(["default", "compact", "wide"] as const).map((layout) => (
                  <button
                    key={layout}
                    onClick={() => setPref("dashboard_layout", layout)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                      prefs.dashboard_layout === layout
                        ? "bg-of-primary/15 border-of-primary/30 text-of-primary"
                        : "bg-of-surface-container border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/40"
                    }`}
                  >
                    {layout.charAt(0).toUpperCase() + layout.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Visible Sidebar Sections */}
            <div className="glass-card rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-of-on-surface">Sidebar Sections</h3>
              <p className="text-xs text-of-on-surface-variant">
                Toggle which navigation sections appear in the sidebar. Hidden sections can still be accessed via direct URL.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {ALL_SIDEBAR_SECTIONS.map((section) => {
                  const isVisible = prefs.visible_sidebar_sections.length === 0 || prefs.visible_sidebar_sections.includes(section.key);
                  return (
                    <label
                      key={section.key}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                        isVisible
                          ? "bg-of-primary/10 border-of-primary/20 text-of-on-surface"
                          : "bg-of-surface-container border-of-outline-variant/20 text-of-on-surface-variant"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => {
                          const current = prefs.visible_sidebar_sections.length === 0
                            ? ALL_SIDEBAR_SECTIONS.map((s) => s.key)
                            : [...prefs.visible_sidebar_sections];
                          const next = isVisible
                            ? current.filter((k) => k !== section.key)
                            : [...current, section.key];
                          setPref("visible_sidebar_sections", next);
                        }}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        isVisible ? "bg-of-primary border-of-primary" : "border-of-outline-variant/40"
                      }`}>
                        {isVisible && (
                          <svg className="w-2.5 h-2.5 text-of-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium">{section.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Collapsed Sidebar Sections */}
            <div className="glass-card rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-of-on-surface">Default Collapsed Sections</h3>
              <p className="text-xs text-of-on-surface-variant">
                Choose which sidebar sections start collapsed by default.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {ALL_SIDEBAR_SECTIONS.map((section) => {
                  const isCollapsed = !!prefs.sidebar_collapsed_sections[section.key];
                  return (
                    <label
                      key={section.key}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                        isCollapsed
                          ? "bg-of-surface-container border-of-outline-variant/30 text-of-on-surface-variant"
                          : "bg-of-primary/10 border-of-primary/20 text-of-on-surface"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!isCollapsed}
                        onChange={() => {
                          const next = { ...prefs.sidebar_collapsed_sections, [section.key]: !isCollapsed };
                          setPref("sidebar_collapsed_sections", next);
                        }}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        !isCollapsed ? "bg-of-primary border-of-primary" : "border-of-outline-variant/40"
                      }`}>
                        {!isCollapsed && (
                          <svg className="w-2.5 h-2.5 text-of-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium">{section.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Reset */}
            <div className="flex justify-end">
              <button
                onClick={resetPrefs}
                className="px-4 py-2 rounded-lg text-sm font-medium text-of-on-surface-variant border border-of-outline-variant/20 hover:text-of-on-surface hover:border-of-outline-variant/40 transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}
