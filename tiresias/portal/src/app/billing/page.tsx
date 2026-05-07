"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth";

/** Billing management page -- displays current plan, usage, and Stripe portal link. */

interface BillingInfo {
  plan: string;
  tier: string;
  agent_count: number;
  status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  grace_active?: boolean;
  grace_expires_at?: string | null;
}

/** Map raw tier slug to a display-friendly plan name. */
function formatPlanName(tier: string): string {
  const names: Record<string, string> = {
    open: "Open (Free)",
    community: "Open (Free)",
    starter: "Starter ($49/mo)",
    pro: "Pro ($199/mo)",
    enterprise: "Enterprise",
    platform: "Platform",
    mssp: "Platform",
    oem: "OEM",
    saas: "OEM",
  };
  return names[tier] ?? tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function BillingPage() {
  const { session, loading: authLoading } = useAuth();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setLoading(false);
      setError("You must be logged in to view billing information.");
      return;
    }

    let cancelled = false;

    async function fetchBillingData() {
      try {
        // Fetch agent count and grace status in parallel
        const [agentsRes, graceRes] = await Promise.allSettled([
          fetch("/api/soulauth/agents"),
          fetch("/v1/billing/grace-status"),
        ]);

        let agentCount = 0;
        if (agentsRes.status === "fulfilled" && agentsRes.value.ok) {
          const agentsData = await agentsRes.value.json();
          agentCount = Array.isArray(agentsData)
            ? agentsData.length
            : (agentsData.count ?? agentsData.agent_count ?? 0);
        }

        let graceActive = false;
        let graceExpiresAt: string | null = null;
        let stripeCustomerId: string | null = null;
        let periodEnd: string | null = null;
        if (graceRes.status === "fulfilled" && graceRes.value.ok) {
          const graceData = await graceRes.value.json();
          graceActive = graceData.grace_active ?? false;
          graceExpiresAt = graceData.grace_expires_at ?? null;
          stripeCustomerId = graceData.stripe_customer_id ?? null;
          periodEnd = graceData.current_period_end ?? null;
        }

        const tier = session!.tier || "open";
        const status =
          tier === "open" || tier === "community" ? "free" : graceActive ? "grace" : "active";

        if (!cancelled) {
          setBilling({
            plan: formatPlanName(tier),
            tier,
            agent_count: agentCount,
            status,
            current_period_end: periodEnd,
            stripe_customer_id: stripeCustomerId,
            grace_active: graceActive,
            grace_expires_at: graceExpiresAt,
          });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load billing data", err);
          setError("Failed to load billing information. Please try again.");
          setLoading(false);
        }
      }
    }

    fetchBillingData();
    return () => {
      cancelled = true;
    };
  }, [session, authLoading]);

  const handleManageBilling = async () => {
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripe_customer_id: billing?.stripe_customer_id,
          return_url: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        console.error("No portal URL returned", data);
      }
    } catch (err) {
      console.error("Failed to open billing portal", err);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        <section className="mx-auto max-w-4xl px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-8">Billing & Subscription</h1>

          {loading && (
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-of-primary/30 border-t-of-primary rounded-full mx-auto" />
            </div>
          )}

          {error && (
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 border-red-500/30">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {billing && !loading && (
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">
                      Current Plan
                    </h2>
                    <p className="text-of-on-surface-variant text-sm">
                      Your subscription details
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      billing.status === "active"
                        ? "bg-of-primary/20 text-of-primary"
                        : billing.status === "free"
                          ? "bg-of-outline/20 text-of-outline"
                          : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {billing.status}
                  </span>
                </div>

                {billing.grace_active && (
                  <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3">
                    <p className="text-amber-400 text-sm font-medium">
                      Grace period active
                      {billing.grace_expires_at && (
                        <span className="font-normal text-amber-400/80">
                          {" "}— expires{" "}
                          {new Date(billing.grace_expires_at).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                <div className="mt-6 grid sm:grid-cols-3 gap-6">
                  <div>
                    <p className="text-xs text-of-outline uppercase tracking-wider mb-1">
                      Plan
                    </p>
                    <p className="text-lg font-semibold">{billing.plan}</p>
                  </div>
                  <div>
                    <p className="text-xs text-of-outline uppercase tracking-wider mb-1">
                      Agents
                    </p>
                    <p className="text-lg font-semibold">
                      {billing.agent_count}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-of-outline uppercase tracking-wider mb-1">
                      Next billing date
                    </p>
                    <p className="text-lg font-semibold">
                      {billing.current_period_end
                        ? new Date(
                            billing.current_period_end
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8">
                <h2 className="text-lg font-semibold mb-4">
                  Manage Subscription
                </h2>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/pricing"
                    className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-5 py-2.5 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all"
                  >
                    Upgrade Plan
                  </Link>
                  <button
                    onClick={handleManageBilling}
                    className="rounded-lg border border-of-outline-variant/15 px-5 py-2.5 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover transition-all"
                  >
                    Payment Methods
                  </button>
                  <button
                    onClick={handleManageBilling}
                    className="rounded-lg border border-of-outline-variant/15 px-5 py-2.5 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover transition-all"
                  >
                    Invoice History
                  </button>
                </div>
              </div>

              {/* Usage */}
              <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8">
                <h2 className="text-lg font-semibold mb-4">Usage</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-of-on-surface-variant">
                        Active Agents
                      </span>
                      <span className="font-medium">
                        {billing.agent_count} agents
                      </span>
                    </div>
                    <div className="h-2 bg-of-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-of-primary to-of-primary rounded-full"
                        style={{
                          width: `${Math.min(
                            (billing.agent_count / (
                              billing.tier === "pro" ? 250 :
                              billing.tier === "starter" ? 50 :
                              billing.tier === "enterprise" || billing.tier === "platform" || billing.tier === "oem" ? 1000 :
                              25
                            )) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cancel */}
              <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 border-red-500/10">
                <h2 className="text-lg font-semibold mb-2">
                  Cancel Subscription
                </h2>
                <p className="text-of-on-surface-variant text-sm mb-4">
                  Canceling will downgrade your account to the Open tier
                  (free) at the end of your current billing period.
                </p>
                <button
                  onClick={handleManageBilling}
                  className="rounded-lg border border-red-500/30 px-5 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
                >
                  Cancel Subscription
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
