"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

interface Tier {
  name: string;
  price: string;
  priceAnnual: string;
  period: string;
  agents: string;
  retention: string;
  tagline: string;
  highlight: boolean;
  cta: string;
  ctaAction: "checkout" | "link";
  ctaHref: string;
  planId: string;
  features: string[];
}

const tiers: Tier[] = [
  {
    name: "Open",
    price: "Free",
    priceAnnual: "Free",
    period: "",
    agents: "25 agents",
    retention: "7-day retention",
    tagline: "Free forever for non-business use",
    highlight: false,
    cta: "Get Started Free",
    ctaAction: "link",
    ctaHref: "/trial",
    planId: "open",
    features: [
      "Full platform (SoulAuth + SoulWatch + SoulGate)",
      "Self-hosted or cloud",
      "25 managed agents",
      "7-day data retention",
      "Unlimited seats",
      "Community support",
      "No credit card required",
    ],
  },
  {
    name: "Starter",
    price: "$49",
    priceAnnual: "$41",
    period: "/month",
    agents: "50 agents",
    retention: "30-day retention",
    tagline: "For small teams shipping to production",
    highlight: false,
    cta: "Start Free Trial",
    ctaAction: "checkout",
    ctaHref: "/trial",
    planId: "starter",
    features: [
      "Everything in Open",
      "50 managed agents",
      "30-day data retention",
      "Session replay",
      "Tagging & cost dashboard",
      "Email support (48h response)",
    ],
  },
  {
    name: "Pro",
    price: "$199",
    priceAnnual: "$165",
    period: "/month",
    agents: "250 agents",
    retention: "90-day retention",
    tagline: "Full platform for production teams",
    highlight: true,
    cta: "Start Free Trial",
    ctaAction: "checkout",
    ctaHref: "/trial",
    planId: "pro",
    features: [
      "Everything in Starter",
      "250 managed agents",
      "90-day data retention",
      "BYOK encryption",
      "Advanced analytics",
      "Custom Sigma rules & playbooks",
      "1 SIEM destination",
      "Priority support (24h response)",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceAnnual: "Custom",
    period: "",
    agents: "Unlimited agents",
    retention: "Custom retention",
    tagline: "For security-critical deployments",
    highlight: false,
    cta: "Talk to Sales",
    ctaAction: "link",
    ctaHref: "mailto:enterprise@saluca.com?subject=Tiresias%20Enterprise",
    planId: "enterprise",
    features: [
      "Everything in Pro",
      "Unlimited agents",
      "Custom data retention",
      "SSO / SAML integration",
      "Audit log export",
      "Unlimited SIEM destinations",
      "Air-gap deployment",
      "Dedicated support (4h P0 response)",
      "Custom SLA (99.9%+ typical)",
    ],
  },
];

const faqs = [
  {
    q: "What is the Open tier?",
    a: "Open is free forever for non-business use \u2014 indie developers, students, open-source projects, and companies under $1M in annual revenue. It includes the full platform (SoulAuth + SoulWatch + SoulGate) with 25 managed agents and 7-day retention. No credit card, no time limit.",
  },
  {
    q: "What counts as an agent?",
    a: "An agent is any autonomous software entity that receives a SoulAuth identity (soulkey). This includes AI agents, bots, microservices, or any automated process. Human users do not count \u2014 all tiers include unlimited seats for your team.",
  },
  {
    q: "Do you charge per seat?",
    a: "No. Every tier includes unlimited seats. Your security bill does not grow when you add team members. We believe security tooling should scale for free as your team grows.",
  },
  {
    q: "Can I self-host?",
    a: "Yes. Every tier \u2014 including Open \u2014 supports self-hosted deployment. Your data stays on your infrastructure. The open-source core (tiresias-core) is Apache 2.0 licensed.",
  },
  {
    q: "How does the free trial work?",
    a: "The 14-day trial gives you full Pro access with no credit card required. When it ends, you can subscribe to Starter or Pro, or continue on the Open tier for free.",
  },
  {
    q: "Do you offer annual discounts?",
    a: "Yes. Annual billing saves 17% (2 months free) on Starter and Pro. Starter Annual is $488/yr, Pro Annual is $1,982/yr.",
  },
  {
    q: "What about Platform and OEM pricing?",
    a: "For agent workflow platforms needing multi-tenant isolation or white-label deployment, we offer Platform ($2,499\u2013$24,999/mo) and OEM ($49,999\u2013$199,999/mo) tiers. Contact enterprise@saluca.com to discuss.",
  },
  {
    q: "Is there a startup program?",
    a: "The Open tier is free for companies under $1M ARR \u2014 that covers most startups. If you need Pro features before hitting that threshold, contact us and we will work something out.",
  },
];

function FAQItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 15 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      className="glass-card rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <h3 className="font-semibold text-sm pr-4">{q}</h3>
        <svg
          className={`w-4 h-4 text-foreground-subtle shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-all duration-400"
        style={{ maxHeight: open ? "300px" : "0px", opacity: open ? 1 : 0 }}
      >
        <p className="px-6 pb-6 text-sm text-foreground-muted leading-relaxed">{a}</p>
      </div>
    </motion.div>
  );
}

async function handleCheckout(planId: string, billingPeriod: "monthly" | "annual") {
  try {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        tenant_id: "",
        soulkey: "",
        billing_period: billingPeriod,
      }),
    });

    const data = await response.json();
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    }
  } catch (error) {
    console.error("Checkout error:", error);
  }
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const cardsRef = useRef(null);

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 text-center pt-12 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm text-teal-400 mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Free for non-business use &middot; No per-seat pricing
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
          >
            One platform.{" "}
            <span className="text-gradient-gold">Flat-rate pricing.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-6 text-lg sm:text-xl text-foreground-muted max-w-2xl mx-auto"
          >
            Your security bill should not grow every time you deploy a new AI agent.
            Unlimited seats, every tier.
          </motion.p>
        </section>

        {/* Billing toggle */}
        <section className="text-center pb-10">
          <div className="inline-flex items-center gap-3 rounded-full bg-navy-800/50 border border-border p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                !annual
                  ? "bg-gold-500/15 text-gold-400 border border-gold-500/30"
                  : "text-foreground-muted hover:text-foreground border border-transparent"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                annual
                  ? "bg-gold-500/15 text-gold-400 border border-gold-500/30"
                  : "text-foreground-muted hover:text-foreground border border-transparent"
              }`}
            >
              Annual
              <span className="text-[10px] font-semibold bg-teal-600/20 text-teal-400 px-2 py-0.5 rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
          <div ref={cardsRef} className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
            {tiers.map((tier, i) => {
              const price = annual ? tier.priceAnnual : tier.price;
              return (
                <motion.div
                  key={tier.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.1, duration: 0.4 }}
                  className={`glass-card rounded-2xl p-7 flex flex-col transition-all duration-300 ${
                    tier.highlight
                      ? "border-gold-500/40 ring-1 ring-gold-500/20 glow-gold relative lg:-mt-4 lg:mb-4"
                      : "hover:border-border-hover"
                  }`}
                >
                  {tier.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 text-xs font-semibold px-4 py-1 rounded-full whitespace-nowrap">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <h3 className="text-lg font-semibold">{tier.name}</h3>
                  <p className="mt-1 text-sm text-foreground-muted">{tier.tagline}</p>

                  <div className="mt-5 mb-2">
                    <span className="text-4xl font-bold">{price}</span>
                    {tier.period && (
                      <span className="text-foreground-muted text-sm">{tier.period}</span>
                    )}
                    {annual && tier.priceAnnual !== tier.price && tier.priceAnnual !== "Free" && tier.priceAnnual !== "Custom" && (
                      <span className="block text-xs text-foreground-subtle mt-1">billed annually</span>
                    )}
                  </div>

                  <div className="flex gap-3 text-xs text-foreground-subtle mb-5">
                    <span className="inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {tier.agents}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {tier.retention}
                    </span>
                  </div>

                  {/* CTA */}
                  {tier.ctaAction === "checkout" ? (
                    <button
                      onClick={async () => {
                        setCheckoutLoading(tier.planId);
                        await handleCheckout(tier.planId, annual ? "annual" : "monthly");
                        setCheckoutLoading(null);
                      }}
                      disabled={checkoutLoading === tier.planId}
                      className={`block w-full text-center rounded-lg px-5 py-3 text-sm font-medium transition-all ${
                        tier.highlight
                          ? "bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 hover:from-gold-500 hover:to-gold-400 shadow-lg shadow-gold-500/20"
                          : "border border-border hover:border-border-hover text-foreground hover:bg-navy-800/50"
                      } ${checkoutLoading === tier.planId ? "opacity-60 cursor-wait" : ""}`}
                    >
                      {checkoutLoading === tier.planId ? "Redirecting..." : tier.cta}
                    </button>
                  ) : (
                    <Link
                      href={tier.ctaHref}
                      className={`block text-center rounded-lg px-5 py-3 text-sm font-medium transition-all ${
                        tier.name === "Open"
                          ? "border border-teal-500/30 text-teal-400 hover:bg-teal-500/10"
                          : "border border-border hover:border-border-hover text-foreground hover:bg-navy-800/50"
                      }`}
                    >
                      {tier.cta}
                    </Link>
                  )}

                  <div className="mt-6 border-t border-border pt-5 flex-1">
                    <ul className="space-y-2.5">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground-muted">
                          <svg
                            className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                              tier.highlight ? "text-gold-500" : "text-teal-500"
                            }`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Platform/OEM callout */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-10 text-center"
          >
            <Link
              href="mailto:enterprise@saluca.com?subject=Tiresias%20Platform%20%2F%20OEM"
              className="inline-flex items-center gap-2 rounded-xl border border-gold-500/20 bg-gold-500/5 px-6 py-3 text-sm text-gold-400 hover:bg-gold-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Building an agent platform? Ask about Platform &amp; OEM tiers
            </Link>
          </motion.div>
        </section>

        {/* Comparison row */}
        <section className="mx-auto max-w-5xl px-6 lg:px-8 pb-24">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-2xl font-bold text-center mb-8"
          >
            Why teams choose Tiresias
          </motion.h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="glass-card rounded-xl p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600/15 mx-auto mb-4">
                <svg className="h-5 w-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-2">No per-seat tax</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">Unlimited users on every tier. Your security bill stays flat as your team grows.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: 0.1 }} className="glass-card rounded-xl p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600/15 mx-auto mb-4">
                <svg className="h-5 w-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-2">Self-hosted by default</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">Your data never leaves your infrastructure. Not a premium feature — the default.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: 0.2 }} className="glass-card rounded-xl p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600/15 mx-auto mb-4">
                <svg className="h-5 w-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-2">Patent-protected</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">29 provisional patents. Envelope encryption, BYOK, multi-provider failover — architecture competitors cannot replicate.</p>
            </motion.div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-6 lg:px-8 pb-24">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold text-center mb-12"
          >
            Frequently Asked Questions
          </motion.h2>
          <div className="grid gap-4 md:grid-cols-2">
            {faqs.map((faq, i) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} index={i} />
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 text-center pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="glass-card rounded-2xl p-12 glow-gold"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Ready to secure your agents?
            </h2>
            <p className="text-foreground-muted mb-8 max-w-xl mx-auto">
              Start free. No credit card. Full platform. Upgrade when you are ready.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/trial"
                className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3 text-sm font-medium text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
              >
                Start Free
              </Link>
              <Link
                href="mailto:enterprise@saluca.com?subject=Enterprise%20Inquiry"
                className="rounded-lg border border-border px-8 py-3 text-sm font-medium text-foreground hover:border-border-hover hover:bg-navy-800/50 transition-all"
              >
                Talk to Sales
              </Link>
            </div>
          </motion.div>
        </section>
      </main>
      <Footer />
    </>
  );
}
