"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import {
  Users,
  Link2,
  DollarSign,
  ExternalLink,
  Copy,
  Tag,
  CreditCard,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldOff,
} from "lucide-react";

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

function StripeStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    active: {
      bg: "bg-green-500/15 border-green-500/20",
      text: "text-green-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    reviewing: {
      bg: "bg-warning/15 border-warning/20",
      text: "text-warning",
      icon: <Clock className="h-3 w-3" />,
    },
    pending: {
      bg: "bg-warning/15 border-warning/20",
      text: "text-warning",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${s.bg} ${s.text}`}>
      {s.icon}
      {status}
    </span>
  );
}

function NotActivated() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-12 text-center space-y-4">
        <ShieldOff className="h-10 w-10 text-of-on-surface-variant/30 mx-auto" />
        <h2 className="text-lg font-bold text-of-on-surface">Partner Program Not Activated</h2>
        <p className="text-sm text-of-on-surface-variant max-w-md mx-auto">
          The Pantheon Partner Program lets MSSPs and resellers earn recurring commissions
          on referred customers. Partners get branded promo codes, commission tracking, and
          payouts through Stripe Connect.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-left">
          {[
            { icon: DollarSign, title: "Recurring Commissions", desc: "Up to 40% rev share on every referred subscription, paid monthly." },
            { icon: Tag, title: "Custom Promo Codes", desc: "Create branded discount codes for your clients. Track redemptions in real time." },
            { icon: TrendingUp, title: "Cascading Splits", desc: "Recruit sub-partners and earn override commissions on their referrals." },
          ].map((item) => (
            <div key={item.title} className="bg-of-surface-container-high rounded-lg p-4 border border-of-outline-variant/10">
              <item.icon className="h-4 w-4 text-of-primary mb-2" />
              <p className="text-sm font-bold text-of-on-surface mb-1">{item.title}</p>
              <p className="text-xs text-of-on-surface-variant">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-of-on-surface-variant pt-2">
          Contact <a href="mailto:partners@saluca.com" className="text-of-primary hover:underline">partners@saluca.com</a> to request an invitation.
        </p>
      </div>
    </div>
  );
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
      navigator.clipboard.writeText(`https://pantheon.saluca.com/signup?ref=${dashboard.referral_code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
          ))}
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="h-40 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
        ))}
      </div>
    );
  }

  // 404 from backend = no partner record
  if (error?.startsWith("404") || (!error && !dashboard)) {
    return <NotActivated />;
  }

  if (error) {
    return (
      <div className="max-w-7xl">
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-12 text-center">
          <AlertTriangle className="h-8 w-8 text-of-error/50 mx-auto mb-3" />
          <p className="text-sm text-of-on-surface-variant">{error}</p>
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="max-w-7xl space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-of-primary" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Commission Rate</p>
          </div>
          <p className="text-2xl font-bold text-of-on-surface">{(dashboard.commission_rate * 100).toFixed(0)}%</p>
          {split && (
            <p className="text-[10px] text-of-on-surface-variant mt-1">
              Net: {(split.seller_net_rate * 100).toFixed(0)}% after platform
            </p>
          )}
        </div>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-of-primary" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Total Referrals</p>
          </div>
          <p className="text-2xl font-bold text-of-on-surface">{dashboard.total_referrals}</p>
        </div>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Active Referrals</p>
          </div>
          <p className="text-2xl font-bold text-green-400">{dashboard.active_referrals}</p>
        </div>
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-of-primary" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Stripe Status</p>
          </div>
          <div className="mt-1">
            <StripeStatusBadge status={dashboard.stripe_connect_status} />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <a href="/dashboard/partner/promos"
          className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 transition-colors inline-flex items-center gap-2">
          <Tag className="h-3.5 w-3.5" />
          Create Promo
        </a>
        {dashboard.stripe_connect_status !== "active" ? (
          <a href="/dashboard/partner/connect"
            className="px-4 h-9 rounded-lg bg-warning/15 border border-warning/25 text-sm font-bold text-warning hover:bg-warning/25 transition-colors inline-flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5" />
            Connect Stripe
          </a>
        ) : (
          <a href="/dashboard/partner/connect"
            className="px-4 h-9 rounded-lg bg-green-500/15 border border-green-500/25 text-sm font-bold text-green-400 hover:bg-green-500/25 transition-colors inline-flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            View Payouts
          </a>
        )}
      </div>

      {/* Referral Link */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">Your Referral Link</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 px-4 py-2 rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 text-sm text-of-on-surface font-mono truncate">
            https://pantheon.saluca.com/signup?ref={dashboard.referral_code}
          </code>
          <button onClick={copyReferralLink}
            className="px-4 h-9 rounded-lg bg-of-primary/15 border border-of-primary/25 text-sm font-bold text-of-primary hover:bg-of-primary/25 transition-colors flex items-center gap-2 shrink-0">
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Commission Split */}
      {split && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-4">Revenue Split</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-of-on-surface-variant">Platform (Saluca)</p>
              <p className="text-lg font-bold text-of-on-surface">{(split.platform_rate * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-of-on-surface-variant">Gross Commission</p>
              <p className="text-lg font-bold text-of-on-surface">{(split.seller_rate * 100).toFixed(0)}%</p>
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
          {split.is_cascading && (
            <p className="text-[10px] text-of-on-surface-variant/60 mt-3">
              Cascading split active -- recruiter override is deducted from gross commission.
            </p>
          )}
        </div>
      )}

      {/* Referred Tenants Table */}
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
            <div className="px-5 py-12 text-center">
              <Link2 className="h-5 w-5 text-of-on-surface-variant/30 mx-auto mb-2" />
              <p className="text-sm text-of-on-surface-variant">No referrals yet</p>
              <p className="text-xs text-of-on-surface-variant/60 mt-1">Share your referral link to start earning commissions</p>
            </div>
          ) : (
            (Array.isArray(referrals) ? referrals : []).map((ref) => (
              <div key={ref.tenant_id} className="grid grid-cols-[1fr_100px_100px_140px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center">
                <span className="text-sm text-of-on-surface font-medium">{ref.tenant_name}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit bg-of-primary/20 text-of-primary">{ref.tier}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                  ref.status === "active" ? "bg-green-500/15 text-green-400" : "bg-of-error/20 text-of-error"
                }`}>{ref.status}</span>
                <span className="text-xs text-of-on-surface-variant">{ref.created_at ? new Date(ref.created_at).toLocaleDateString() : "\u2014"}</span>
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
