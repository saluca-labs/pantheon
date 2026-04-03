"use client";

import { useState } from "react";
import { TierGate } from "@/components/dashboard/TierGate";
import { ExternalLink, CheckCircle2, AlertCircle, RefreshCw, CreditCard, ShieldCheck, FileText, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { useWidgetData } from "@/lib/useWidgetData";

interface ConnectStatus {
  account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: string[];
}

function ConnectContent() {
  const { data: status, loading } = useWidgetData<ConnectStatus>({
    endpoint: "/api/partner/connect/status",
    refreshInterval: 10000,
  });
  const [onboarding, setOnboarding] = useState(false);
  const [dashLoading, setDashLoading] = useState(false);

  const startOnboarding = async () => {
    setOnboarding(true);
    try {
      const res = await api.post<{ account_id: string; onboarding_url: string }>("/api/partner/connect/onboard", {});
      if (res.onboarding_url) {
        window.open(res.onboarding_url, "_blank");
      }
    } catch {
      // handled inline
    }
    setOnboarding(false);
  };

  const openStripeDashboard = async () => {
    setDashLoading(true);
    try {
      const res = await api.get<{ url: string }>("/api/partner/connect/dashboard-link");
      if (res.url) {
        window.open(res.url, "_blank");
      }
    } catch {
      // handled inline
    }
    setDashLoading(false);
  };

  const isComplete = status?.charges_enabled && status?.payouts_enabled;

  // KYC checklist items
  const kycChecklist = [
    { label: "Identity verification", done: status?.details_submitted ?? false },
    { label: "Bank account or debit card", done: status?.payouts_enabled ?? false },
    { label: "Charges enabled", done: status?.charges_enabled ?? false },
    { label: "Tax information (1099)", done: status?.details_submitted ?? false },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      {/* Main onboarding card */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-8">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-lg font-bold text-of-on-surface">Stripe Connect Onboarding</h2>
          {status?.account_id && (
            <span className="text-[10px] font-mono text-of-on-surface-variant/40">{status.account_id}</span>
          )}
        </div>
        <p className="text-sm text-of-on-surface-variant mb-6">
          Complete Stripe verification to receive commission payouts. Stripe handles tax ID collection,
          bank account setup, and 1099 reporting.
        </p>

        {loading ? (
          <div className="h-24 rounded-xl bg-of-surface-container-high animate-pulse" />
        ) : isComplete ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-green-400">Onboarding Complete</p>
                <p className="text-xs text-of-on-surface-variant">Charges and payouts are enabled. You will receive commissions on the next payout cycle.</p>
              </div>
            </div>
            <button onClick={openStripeDashboard} disabled={dashLoading}
              className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 disabled:opacity-50 transition-colors flex items-center gap-2">
              {dashLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              View Stripe Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {status?.details_submitted ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
                <AlertCircle className="h-5 w-5 text-warning shrink-0" />
                <div>
                  <p className="text-sm font-bold text-warning">Under Review</p>
                  <p className="text-xs text-of-on-surface-variant">Stripe is verifying your information. This usually takes 1-2 business days.</p>
                </div>
              </div>
            ) : null}

            {status?.requirements && status.requirements.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">Outstanding Requirements</p>
                <ul className="space-y-1.5">
                  {status.requirements.map((req, i) => (
                    <li key={i} className="text-xs text-of-on-surface-variant flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={startOnboarding} disabled={onboarding}
              className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 disabled:opacity-50 transition-colors flex items-center gap-2">
              {onboarding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              {status?.account_id ? "Continue Onboarding" : "Start Onboarding"}
            </button>
          </div>
        )}
      </div>

      {/* KYC Requirements Checklist */}
      {status && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-4">KYC Requirements</p>
          <div className="space-y-3">
            {kycChecklist.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-of-outline-variant/30 shrink-0" />
                )}
                <span className={`text-sm ${item.done ? "text-of-on-surface" : "text-of-on-surface-variant"}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status grid */}
      {status && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Charges Enabled", value: status.charges_enabled, icon: CreditCard },
            { label: "Payouts Enabled", value: status.payouts_enabled, icon: Building2 },
            { label: "Details Submitted", value: status.details_submitted, icon: FileText },
          ].map((item) => (
            <div key={item.label} className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <item.icon className="h-4 w-4 text-of-on-surface-variant/50" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{item.label}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                item.value ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-of-error/20 text-of-error border border-of-error/20"
              }`}>
                {item.value ? "Yes" : "No"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* What Stripe Connect provides */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-4">What Stripe Connect Provides</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: ShieldCheck, title: "Secure Payouts", desc: "Automatic monthly payouts to your verified bank account." },
            { icon: FileText, title: "Tax Reporting", desc: "Stripe generates 1099 forms for US-based partners." },
            { icon: Building2, title: "Business Verification", desc: "One-time KYC to verify your identity and business details." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <item.icon className="h-4 w-4 text-of-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-of-on-surface mb-0.5">{item.title}</p>
                <p className="text-xs text-of-on-surface-variant">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="Stripe Connect">
      <ConnectContent />
    </TierGate>
  );
}
