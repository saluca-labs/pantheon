"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { Users, Link2, DollarSign, ExternalLink, Copy, RefreshCw } from "lucide-react";


interface PartnerDashboard {
  partner_id: string;
  name: string;
  referral_code: string;
  commission_rate: number;
  stripe_connect_status: string;
  status: string;
  total_referrals: number;
  active_referrals: number;
}

interface CommissionSplit {
  platform_rate: number;
  seller_rate: number;
  seller_net_rate: number;
  recruiter_rate: number;
  is_cascading: boolean;
}

interface Referral {
  tenant_id: string;
  tenant_name: string;
  tier: string;
  status: string;
  created_at: string | null;
}

function PartnerContent() {
  const { data: dashboard, loading, error } = useWidgetData<PartnerDashboard>({
    endpoint: "/api/partner/me",
    refreshInterval: 30000,
  });
  const { data: split } = useWidgetData<CommissionSplit>({
    endpoint: "/api/partner/commissions/split",
    refreshInterval: 60000,
  });
  const { data: referrals } = useWidgetData<Referral[]>({
    endpoint: "/api/partner/referrals",
    refreshInterval: 30000,
  });
  const [copied, setCopied] = useState(false);

  const copyReferralLink = () => {
    if (dashboard?.referral_code) {
      navigator.clipboard.writeText(`https://tiresias.network/signup?ref=${dashboard.referral_code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
        ))}
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="max-w-7xl">
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-12 text-center">
          <Users className="h-8 w-8 text-of-on-surface-variant/30 mx-auto mb-3" />
          <p className="text-sm text-of-on-surface-variant">{error || "No partner account found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      {/* Overview KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Referral Code", value: dashboard.referral_code, icon: Link2 },
          { label: "Total Referrals", value: dashboard.total_referrals, icon: Users },
          { label: "Active Referrals", value: dashboard.active_referrals, icon: Users },
          { label: "Commission Rate", value: `${(dashboard.commission_rate * 100).toFixed(0)}%`, icon: DollarSign },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="h-4 w-4 text-of-primary" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{kpi.label}</p>
            </div>
            <p className="text-xl font-bold text-of-on-surface">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Referral Link */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">Your Referral Link</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 px-4 py-2 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface font-mono">
            https://tiresias.network/signup?ref={dashboard.referral_code}
          </code>
          <button onClick={copyReferralLink}
            className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 transition-colors flex items-center gap-2">
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Commission Split */}
      {split && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">Revenue Split</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-of-on-surface-variant">Platform (Saluca)</p>
              <p className="text-lg font-bold text-of-on-surface">{(split.platform_rate * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-of-on-surface-variant">Your Net Commission</p>
              <p className="text-lg font-bold text-of-primary">{(split.seller_net_rate * 100).toFixed(0)}%</p>
            </div>
            {split.is_cascading && (
              <div>
                <p className="text-xs text-of-on-surface-variant">Recruiter Override</p>
                <p className="text-lg font-bold text-of-on-surface">{(split.recruiter_rate * 100).toFixed(0)}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connect Status */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">Stripe Connect</p>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
            dashboard.stripe_connect_status === "active"
              ? "bg-green-500/15 text-green-400 border border-green-500/20"
              : "bg-warning/15 text-warning border border-warning/20"
          }`}>
            {dashboard.stripe_connect_status}
          </span>
          {dashboard.stripe_connect_status !== "active" && (
            <a href="/dashboard/partner/connect"
              className="text-xs text-of-primary hover:underline flex items-center gap-1">
              Complete onboarding <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Referred Tenants */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">Referred Tenants</p>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px_100px_140px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Tenant", "Tier", "Status", "Created"].map((h) => (
              <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{h}</span>
            ))}
          </div>
          {/* Rows */}
          {(!referrals || referrals.length === 0) ? (
            <div className="px-5 py-12 text-center text-sm text-of-on-surface-variant">No referrals yet</div>
          ) : (
            (Array.isArray(referrals) ? referrals : []).map((ref) => (
              <div key={ref.tenant_id} className="grid grid-cols-[1fr_100px_100px_140px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center">
                <span className="text-sm text-of-on-surface font-medium">{ref.tenant_name}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit bg-of-primary/20 text-of-primary">{ref.tier}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                  ref.status === "active" ? "bg-green-500/15 text-green-400" : "bg-of-error/20 text-of-error"
                }`}>{ref.status}</span>
                <span className="text-xs text-of-on-surface-variant">{ref.created_at ? new Date(ref.created_at).toLocaleDateString() : "—"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function PartnerPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="Partner Dashboard">
      <PartnerContent />
    </TierGate>
  );
}
