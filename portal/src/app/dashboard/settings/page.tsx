"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBranding, type BrandingConfig } from "@/lib/branding";
import { TierGate } from "@/components/dashboard/TierGate";

type Tab = "general" | "api-keys" | "siem" | "notifications" | "billing" | "white-label";

interface ApiKey {
  id: string;
  prefix: string;
  created: string;
  lastUsed: string;
  status: "Active" | "Revoked";
}

interface SiemDestination {
  id: string;
  type: string;
  endpoint: string;
  status: "Connected" | "Error";
}

interface NotificationChannel {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  config: string;
}

const API_KEYS: ApiKey[] = [
  { id: "1", prefix: "tir_live_7f3a...", created: "2026-01-15", lastUsed: "2026-03-18 14:30", status: "Active" },
  { id: "2", prefix: "tir_live_9e2b...", created: "2026-02-20", lastUsed: "2026-03-18 13:45", status: "Active" },
  { id: "3", prefix: "tir_test_1d4f...", created: "2026-03-01", lastUsed: "2026-03-10 09:00", status: "Active" },
  { id: "4", prefix: "tir_live_4f0b...", created: "2025-11-20", lastUsed: "2026-01-15 16:20", status: "Revoked" },
];

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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [tenantName, setTenantName] = useState("Acme Corp");
  const [contactEmail, setContactEmail] = useState("admin@acme.com");
  const [copied, setCopied] = useState(false);
  const [channels, setChannels] = useState(NOTIFICATION_CHANNELS);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  // White Label state (WL-06)
  const { branding, saveBranding, previewBranding, resetPreview, loading: brandingLoading } = useBranding();
  const [draftBranding, setDraftBranding] = useState<BrandingConfig>({ ...branding });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);

  // Sync draft when committed branding loads from API
  useEffect(() => {
    setDraftBranding({ ...branding });
  }, [branding.logo_url, branding.primary_color, branding.accent_color, branding.company_name, branding.favicon_url]);

  const tenantId = "tnt_acme_7f3a8b2c1d4e5f6a";

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
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
    } catch {
      // Error shown inline
    } finally {
      setBrandingSaving(false);
    }
  }

  function handleResetPreview() {
    resetPreview();
    setDraftBranding({ ...branding });
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

      {/* API Keys Tab */}
      {activeTab === "api-keys" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-end">
            <button className="px-4 py-2 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors">
              + Generate New Key
            </button>
          </div>
          <div className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Key Prefix</th>
                    <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Created</th>
                    <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Last Used</th>
                    <th className="text-left px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-foreground-muted font-medium text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {API_KEYS.map((key) => (
                    <tr key={key.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-all duration-200">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setRevealedKey(revealedKey === key.id ? null : key.id)}
                          className="font-mono text-xs text-of-primary hover:text-of-primary transition-colors duration-200 flex items-center gap-1.5"
                        >
                          <AnimatePresence mode="wait">
                            {revealedKey === key.id ? (
                              <motion.span
                                key="revealed"
                                initial={{ filter: "blur(4px)", opacity: 0 }}
                                animate={{ filter: "blur(0px)", opacity: 1 }}
                                exit={{ filter: "blur(4px)", opacity: 0 }}
                                transition={{ duration: 0.3 }}
                              >
                                {key.prefix}
                              </motion.span>
                            ) : (
                              <motion.span
                                key="hidden"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                              >
                                {key.prefix.split("_").slice(0, 2).join("_")}_****
                              </motion.span>
                            )}
                          </AnimatePresence>
                          <svg className="w-3 h-3 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            {revealedKey === key.id ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            )}
                          </svg>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-foreground-muted text-xs">{key.created}</td>
                      <td className="px-4 py-3 text-foreground-muted text-xs font-mono">{key.lastUsed}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          key.status === "Active"
                            ? "bg-green-500/15 text-green-400 border border-green-500/20"
                            : "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                        }`}>
                          {key.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {key.status === "Active" && (
                          <button className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 hover:shadow-[0_0_8px_rgba(239,68,68,0.1)] transition-all duration-200">
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-of-surface-container border border-of-outline-variant/20 rounded-xl p-8 max-w-lg space-y-6"
        >
          <div className="space-y-2">
            <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Current Plan</p>
            <p className="text-xl font-bold text-gradient-gold">SoulAuth Pro Trial</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-foreground-subtle uppercase tracking-wider font-medium">Trial Expires</p>
            <p className="text-sm text-foreground">March 31, 2026</p>
            <div className="h-2 bg-of-surface-container-high rounded-full overflow-hidden mt-2">
              <motion.div
                className="h-full bg-of-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: "56%" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <p className="text-[10px] text-foreground-subtle">13 days remaining</p>
          </div>

          <div className="p-4 rounded-lg bg-of-primary/5 border border-of-primary/20 text-sm text-foreground-muted">
            Billing management coming soon. Contact <a href="mailto:sales@tiresias.dev" className="text-of-primary hover:text-of-primary-fixed transition-colors">sales@tiresias.dev</a> for plan upgrades.
          </div>

          <a
            href="/pricing"
            className="inline-block px-6 py-2.5 rounded-lg bg-of-primary text-of-on-primary text-sm font-semibold hover:bg-of-primary-fixed transition-colors"
          >
            Upgrade Plan
          </a>
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
