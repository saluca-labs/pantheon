"use client";

import { useState } from "react";
import { TierGate } from "@/components/dashboard/TierGate";
import { ExternalLink, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
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
  const { data: status, loading, refetch } = useWidgetData<ConnectStatus>({
    endpoint: "/api/partner/connect/status",
    refreshInterval: 10000,
  });
  const [onboarding, setOnboarding] = useState(false);

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

  const isComplete = status?.charges_enabled && status?.payouts_enabled;

  return (
    <div className="max-w-7xl space-y-6">
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-8">
        <h2 className="text-lg font-bold text-of-on-surface mb-2">Stripe Connect Onboarding</h2>
        <p className="text-sm text-of-on-surface-variant mb-6">
          Complete Stripe verification to receive commission payouts. Stripe handles tax ID collection,
          bank account setup, and 1099 reporting.
        </p>

        {loading ? (
          <div className="h-24 rounded-xl bg-of-surface-container-high animate-pulse" />
        ) : isComplete ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-sm font-bold text-green-400">Onboarding Complete</p>
              <p className="text-xs text-of-on-surface-variant">Charges and payouts are enabled. Account: {status?.account_id}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {status?.details_submitted ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
                <AlertCircle className="h-5 w-5 text-warning" />
                <div>
                  <p className="text-sm font-bold text-warning">Under Review</p>
                  <p className="text-xs text-of-on-surface-variant">Stripe is verifying your information.</p>
                </div>
              </div>
            ) : null}

            {status?.requirements && status.requirements.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">Outstanding Requirements</p>
                <ul className="space-y-1">
                  {status.requirements.map((req, i) => (
                    <li key={i} className="text-xs text-of-on-surface-variant flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
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

      {/* Status grid */}
      {status && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Charges Enabled", value: status.charges_enabled },
            { label: "Payouts Enabled", value: status.payouts_enabled },
            { label: "Details Submitted", value: status.details_submitted },
          ].map((item) => (
            <div key={item.label} className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">{item.label}</p>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                item.value ? "bg-green-500/15 text-green-400" : "bg-of-error/20 text-of-error"
              }`}>
                {item.value ? "Yes" : "No"}
              </span>
            </div>
          ))}
        </div>
      )}
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
