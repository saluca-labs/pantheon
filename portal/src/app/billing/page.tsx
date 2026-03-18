"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

interface BillingInfo {
  plan: string;
  tier: string;
  agent_count: number;
  status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SOULAUTH_API_URL =
  process.env.NEXT_PUBLIC_SOULAUTH_API_URL || "http://localhost:8000";

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In production, fetch billing info from the backend
    // For now, show placeholder data from local storage / session
    const timer = setTimeout(() => {
      setBilling({
        plan: "Platform Pro",
        tier: "pro",
        agent_count: 10,
        status: "active",
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        stripe_customer_id: null,
      });
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleManageBilling = async () => {
    // In production, create a Stripe Customer Portal session
    // and redirect the user to manage their subscription
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: billing?.stripe_customer_id,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.url;
      }
    } catch {
      // Stripe portal not yet configured - show upgrade options
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        <section className="mx-auto max-w-4xl px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-8">Billing & Subscription</h1>

          {loading && (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-gold-500/30 border-t-gold-500 rounded-full mx-auto" />
            </div>
          )}

          {error && (
            <div className="glass-card rounded-2xl p-8 border-red-500/30">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {billing && !loading && (
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="glass-card rounded-2xl p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">
                      Current Plan
                    </h2>
                    <p className="text-foreground-muted text-sm">
                      Your subscription details
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      billing.status === "active"
                        ? "bg-teal-500/20 text-teal-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {billing.status}
                  </span>
                </div>

                <div className="mt-6 grid sm:grid-cols-3 gap-6">
                  <div>
                    <p className="text-xs text-foreground-subtle uppercase tracking-wider mb-1">
                      Plan
                    </p>
                    <p className="text-lg font-semibold">{billing.plan}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-subtle uppercase tracking-wider mb-1">
                      Agents
                    </p>
                    <p className="text-lg font-semibold">
                      {billing.agent_count}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-subtle uppercase tracking-wider mb-1">
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
              <div className="glass-card rounded-2xl p-8">
                <h2 className="text-lg font-semibold mb-4">
                  Manage Subscription
                </h2>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/pricing"
                    className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-5 py-2.5 text-sm font-medium text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all"
                  >
                    Upgrade Plan
                  </Link>
                  <button
                    onClick={handleManageBilling}
                    className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:border-border-hover transition-all"
                  >
                    Payment Methods
                  </button>
                  <button
                    onClick={handleManageBilling}
                    className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:border-border-hover transition-all"
                  >
                    Invoice History
                  </button>
                </div>
              </div>

              {/* Usage */}
              <div className="glass-card rounded-2xl p-8">
                <h2 className="text-lg font-semibold mb-4">Usage</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-foreground-muted">
                        Active Agents
                      </span>
                      <span className="font-medium">
                        {billing.agent_count} agents
                      </span>
                    </div>
                    <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gold-600 to-gold-500 rounded-full"
                        style={{
                          width: `${Math.min(
                            (billing.agent_count / 50) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cancel */}
              <div className="glass-card rounded-2xl p-8 border-red-500/10">
                <h2 className="text-lg font-semibold mb-2">
                  Cancel Subscription
                </h2>
                <p className="text-foreground-muted text-sm mb-4">
                  Canceling will downgrade your account to SoulAuth Community
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
