/**
 * @module RetentionSettingsPage
 *
 * Data retention policy management page (Task #42).
 *
 * Displays the tenant's current retention configuration from the
 * _retention_policies table and allows editing retention tier / custom days.
 * SaaS tenants are restricted to predefined tiers with plan-based minimums.
 * On-prem tenants can set custom retention (7 to 2555 days).
 *
 * Route: /dashboard/settings/retention
 */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Clock, Shield, Archive, ChevronLeft, Check, AlertTriangle, Info } from "lucide-react";
import Link from "next/link";

// -- Types -------------------------------------------------------------------

interface RetentionPolicy {
  tenant_id: string;
  deployment_mode: string;
  retention_tier: string;
  custom_retention_days: number | null;
  created_at: string;
  updated_at: string;
  effective_days: number;
}

interface RetentionResponse {
  policy: RetentionPolicy | null;
  tier_minimums: Record<string, number>;
  available_tiers: string[];
}

interface RetentionUpdateBody {
  retention_tier: string;
  custom_retention_days?: number | null;
  archive_before_delete: boolean;
}

// -- Constants ---------------------------------------------------------------

const TIER_LABELS: Record<string, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  "90d": "90 Days",
  "1yr": "1 Year",
  "2yr": "2 Years",
  "custom": "Custom",
};

const TIER_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1yr": 365,
  "2yr": 730,
};

const DATA_TYPE_INFO: { key: string; label: string; description: string; icon: React.ReactNode }[] = [
  {
    key: "audit_logs",
    label: "Audit Logs",
    description: "API request/response audit trail and compliance records",
    icon: <Shield className="w-4 h-4" />,
  },
  {
    key: "dream_cycles",
    label: "Dream Cycles",
    description: "Agent dream cycle history and memory consolidation logs",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    key: "billing_records",
    label: "Billing Records",
    description: "Usage metering and billing aggregation data",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "detection_results",
    label: "Detection Results",
    description: "SoulWatch anomaly detection results and alert history",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    key: "quarantine_history",
    label: "Quarantine History",
    description: "Agent quarantine events, release records, and approval trails",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
];

// -- Component ---------------------------------------------------------------

export default function RetentionSettingsPage() {
  const { session } = useAuth();
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [tierMinimums, setTierMinimums] = useState<Record<string, number>>({});
  const [availableTiers, setAvailableTiers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit state
  const [editTier, setEditTier] = useState<string>("");
  const [editCustomDays, setEditCustomDays] = useState<number>(30);
  const [editArchive, setEditArchive] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const tenantTier = session?.tier || "community";
  const planMinimum = tierMinimums[tenantTier] || 7;

  const fetchPolicy = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<RetentionResponse>("/v1/admin/retention");
      setPolicy(data.policy);
      setTierMinimums(data.tier_minimums);
      setAvailableTiers(data.available_tiers);
      if (data.policy) {
        setEditTier(data.policy.retention_tier);
        setEditCustomDays(data.policy.custom_retention_days || 30);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load retention policy");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const body: RetentionUpdateBody = {
        retention_tier: editTier,
        archive_before_delete: editArchive,
      };
      if (editTier === "custom") {
        body.custom_retention_days = editCustomDays;
      }

      const data = await api.put<RetentionResponse>("/v1/admin/retention", body);
      setPolicy(data.policy);
      setIsEditing(false);
      setSuccess("Retention policy updated successfully");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to update retention policy");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (policy) {
      setEditTier(policy.retention_tier);
      setEditCustomDays(policy.custom_retention_days || 30);
    }
    setIsEditing(false);
    setError(null);
  };

  const isOnPrem = policy?.deployment_mode === "on_prem";
  const effectiveDays = editTier === "custom"
    ? editCustomDays
    : (TIER_DAYS[editTier] || 0);
  const hasChanges = policy && (
    editTier !== policy.retention_tier ||
    (editTier === "custom" && editCustomDays !== policy.custom_retention_days)
  );

  // Filter available tiers based on plan minimum
  const filteredTiers = availableTiers.filter((t) => {
    const days = TIER_DAYS[t];
    return days !== undefined && days >= planMinimum;
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link
          href="/dashboard/settings"
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Data Retention
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Configure how long Tiresias retains your data before automatic purge
          </p>
        </div>
      </div>

      {/* Success banner */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
        </div>
      ) : !policy ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <Archive className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No retention policy configured for this tenant.</p>
          <p className="text-sm text-gray-500 mt-1">
            Contact support or run migration 0033 to initialize retention policies.
          </p>
        </div>
      ) : (
        <>
          {/* Current Policy Summary */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-400" />
                Current Policy
              </h2>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-teal-500/10 text-teal-400 border border-teal-500/25 hover:bg-teal-500/20 transition-colors"
                >
                  Edit Policy
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Retention Period</p>
                <p className="text-xl font-bold text-white">
                  {policy.retention_tier === "custom"
                    ? `${policy.custom_retention_days} days`
                    : TIER_LABELS[policy.retention_tier] || policy.retention_tier}
                </p>
                <p className="text-xs text-gray-500 mt-1">{policy.effective_days} days effective</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Deployment Mode</p>
                <p className="text-xl font-bold text-white capitalize">
                  {policy.deployment_mode === "on_prem" ? "On-Premise" : "SaaS"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {isOnPrem ? "Fully customizable" : `Plan minimum: ${planMinimum}d`}
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Last Updated</p>
                <p className="text-sm font-medium text-white">
                  {new Date(policy.updated_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(policy.updated_at).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Edit Section */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-teal-500/20 bg-teal-500/[0.03] p-6 space-y-5">
                  <h3 className="text-lg font-semibold text-white">Edit Retention Policy</h3>

                  {/* Plan minimum info */}
                  {!isOnPrem && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-blue-300">
                        Your <span className="font-medium capitalize">{tenantTier}</span> plan
                        requires a minimum retention period of <span className="font-medium">{planMinimum} days</span>.
                        Tiers below this minimum are hidden.
                      </p>
                    </div>
                  )}

                  {/* Tier selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Retention Period
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {filteredTiers.map((tier) => (
                        <button
                          key={tier}
                          onClick={() => setEditTier(tier)}
                          className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
                            editTier === tier
                              ? "bg-teal-500/15 border-teal-500/40 text-teal-300"
                              : "bg-white/[0.02] border-white/[0.06] text-gray-400 hover:bg-white/[0.04] hover:border-white/[0.1]"
                          }`}
                        >
                          <span className="block text-base font-bold">
                            {TIER_LABELS[tier]}
                          </span>
                          <span className="block text-xs mt-0.5 opacity-60">
                            {TIER_DAYS[tier]} days
                          </span>
                        </button>
                      ))}
                      {isOnPrem && (
                        <button
                          onClick={() => setEditTier("custom")}
                          className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
                            editTier === "custom"
                              ? "bg-teal-500/15 border-teal-500/40 text-teal-300"
                              : "bg-white/[0.02] border-white/[0.06] text-gray-400 hover:bg-white/[0.04] hover:border-white/[0.1]"
                          }`}
                        >
                          <span className="block text-base font-bold">Custom</span>
                          <span className="block text-xs mt-0.5 opacity-60">7 to 2555 days</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Custom days input */}
                  <AnimatePresence>
                    {editTier === "custom" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Custom Retention (days)
                        </label>
                        <input
                          type="number"
                          min={7}
                          max={2555}
                          value={editCustomDays}
                          onChange={(e) => setEditCustomDays(Math.max(7, Math.min(2555, parseInt(e.target.value) || 7)))}
                          className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition-colors"
                        />
                        <p className="text-xs text-gray-500 mt-1.5">
                          Minimum 7 days. Maximum 2,555 days (~7 years) for tax compliance.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Archive toggle */}
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <Archive className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-300">Archive Before Delete</p>
                        <p className="text-xs text-gray-500">
                          Export data to cold storage before permanent deletion
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditArchive(!editArchive)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        editArchive ? "bg-teal-500" : "bg-gray-600"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          editArchive ? "translate-x-[22px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Preview */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-300">
                      Data older than <span className="font-bold">{effectiveDays} days</span> will
                      be {editArchive ? "archived then " : ""}permanently deleted during the next
                      retention sweep.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges}
                      className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-5 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Data Types Table */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Affected Data Types</h2>
            <p className="text-sm text-gray-500 mb-4">
              The retention policy applies uniformly to all data types below.
            </p>
            <div className="space-y-2">
              {DATA_TYPE_INFO.map((dt) => (
                <div
                  key={dt.key}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-teal-400">{dt.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-200">{dt.label}</p>
                      <p className="text-xs text-gray-500">{dt.description}</p>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-gray-400 shrink-0">
                    {policy.effective_days}d
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance note */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <Info className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-500">
              Retention enforcement runs on a scheduled CronJob. Changes take effect on the next sweep cycle
              (typically within 24 hours). Soft-deleted data is held for an additional 7-day grace period
              before permanent removal.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
