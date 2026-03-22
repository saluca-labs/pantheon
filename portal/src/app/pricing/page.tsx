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
    name: "Community",
    price: "Free",
    priceAnnual: "Free",
    period: "",
    agents: "25 agents",
    retention: "7-day retention",
    tagline: "Free forever. Own your data.",
    highlight: false,
    cta: "Get Started Free",
    ctaAction: "link",
    ctaHref: "/trial",
    planId: "community",
    features: [
      "Full observability dashboard",
      "PRH prompt risk scoring (read-only)",
      "18-type anomaly detection (baselines only)",
      "Self-hosted",
      "Unlimited seats",
      "Community support",
    ],
  },
  {
    name: "Starter",
    price: "$49",
    priceAnnual: "$39",
    period: "/month",
    agents: "50 agents",
    retention: "30-day retention",
    tagline: "Production visibility for teams that ship fast",
    highlight: false,
    cta: "Start Free Trial",
    ctaAction: "checkout",
    ctaHref: "/trial",
    planId: "starter",
    features: [
      "Everything in Community",
      "Session replay + cost dashboard",
      "Provider health monitoring",
      "Basic analytics",
      "Email support (48h)",
    ],
  },
  {
    name: "Pro",
    price: "$199",
    priceAnnual: "$169",
    period: "/month",
    agents: "250 agents",
    retention: "90-day retention",
    tagline: "Detection + response for AI-native security teams",
    highlight: true,
    cta: "Start Free Trial",
    ctaAction: "checkout",
    ctaHref: "/trial",
    planId: "pro",
    features: [
      "Everything in Starter",
      "PRH Engine (full \u2014 60 patterns, 6 categories)",
      "Behavioral anomaly detection with alerting",
      "Sigma detection rules + response playbooks",
      "Quarantine management + prompt forensics",
      "Delegation + RBAC",
      "Priority support (24h)",
    ],
  },
  {
    name: "Enterprise",
    price: "$799",
    priceAnnual: "$699",
    period: "/month",
    agents: "Unlimited agents",
    retention: "Custom retention",
    tagline: "Enforcement-grade AI security. CISO-ready.",
    highlight: false,
    cta: "Start Free Trial",
    ctaAction: "checkout",
    ctaHref: "/trial",
    planId: "enterprise",
    features: [
      "Everything in Pro",
      "SIEM connectors (CEF/syslog/webhook)",
      "Policy enforcement (audit \u2192 warn \u2192 enforce)",
      "Custom detection rules",
      "Audit log export (tamper-evident)",
      "Dedicated support (8h SLA)",
    ],
  },
];

const partnerTiers: Tier[] = [
  {
    name: "MSSP",
    price: "$2,499",
    priceAnnual: "Contact Us",
    period: "/month base",
    agents: "Unlimited agents",
    retention: "Per-tenant configurable",
    tagline: "One platform. Every client. Your brand.",
    highlight: false,
    cta: "Talk to Partner Team",
    ctaAction: "link",
    ctaHref: "mailto:partners@saluca.com?subject=Tiresias%20MSSP",
    planId: "mssp",
    features: [
      "Everything in Enterprise",
      "Multi-tenant hierarchy (parent-child)",
      "Cross-tenant detection + quarantine views",
      "White-label branding",
      "Tenant provisioning API",
      "Per-tenant pricing from $199/tenant",
    ],
  },
  {
    name: "SaaS",
    price: "Custom",
    priceAnnual: "Custom",
    period: "",
    agents: "Unlimited agents",
    retention: "Managed",
    tagline: "Fully managed AI security operations",
    highlight: false,
    cta: "Talk to Sales",
    ctaAction: "link",
    ctaHref: "mailto:enterprise@saluca.com?subject=Tiresias%20SaaS",
    planId: "saas",
    features: [
      "Everything in MSSP",
      "Managed detection + response (Tier 1 triage)",
      "Usage metering + billing integration",
      "Tenant lifecycle management",
      "Monthly executive reporting",
      "4hr critical SLA",
    ],
  },
];

const faqs = [
  {
    q: "What is the Community tier?",
    a: "Community is free forever \u2014 for developers, open-source projects, and teams who want full observability without a bill. It includes the full dashboard, PRH prompt risk scoring in read-only mode, and 18-type anomaly detection baselines. No credit card, no time limit.",
  },
  {
    q: "What counts as an agent?",
    a: "An agent is any autonomous software entity that receives a Tiresias identity. This includes AI agents, bots, microservices, or any automated process. Human users do not count \u2014 all tiers include unlimited seats for your team.",
  },
  {
    q: "Do you charge per seat?",
    a: "No. Every tier includes unlimited seats. Your security bill does not grow when you add team members. We believe security tooling should scale for free as your team grows.",
  },
  {
    q: "Can I self-host?",
    a: "Yes. Every tier \u2014 including Community \u2014 supports self-hosted deployment. Your data stays on your infrastructure. The open-source core is Apache 2.0 licensed.",
  },
  {
    q: "How does the free trial work?",
    a: "The 14-day trial gives you full Pro access with no credit card required. When it ends, you can subscribe to any paid tier, or continue on the Community tier for free.",
  },
  {
    q: "Do you offer annual discounts?",
    a: "Yes. Annual billing saves approximately 20% on Starter ($39/mo vs $49), Pro ($169/mo vs $199), and Enterprise ($699/mo vs $799).",
  },
  {
    q: "What is PRH?",
    a: "PRH stands for Prompt Risk Heuristic \u2014 our real-time prompt analysis engine. It scores every prompt against 60 threat patterns across 6 categories (injection, exfiltration, manipulation, privilege escalation, evasion, and data leakage). Community gets read-only scores; Pro and above get full alerting, forensics, and response.",
  },
  {
    q: "What is the MSSP tier?",
    a: "MSSP is designed for managed security providers who want to offer AI agent security as a service to their clients. It includes multi-tenant hierarchy, cross-tenant detection views, white-label branding, and a tenant provisioning API \u2014 so you can run one Tiresias instance and bill your clients separately starting from $199/tenant.",
  },
  {
    q: "Is there a startup program?",
    a: "The Community tier is free for anyone \u2014 that covers most early-stage teams. If you need Pro features before you can justify the cost, contact us and we will work something out.",
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
      className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <h3 className="font-semibold text-sm pr-4">{q}</h3>
        <svg
          className={`w-4 h-4 text-of-outline shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-all duration-400"
        style={{ maxHeight: open ? "300px" : "0px", opacity: open ? 1 : 0 }}
      >
        <p className="px-6 pb-6 text-sm text-of-on-surface-variant leading-relaxed">{a}</p>
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

function TierCard({
  tier,
  i,
  annual,
  checkoutLoading,
  setCheckoutLoading,
}: {
  tier: Tier;
  i: number;
  annual: boolean;
  checkoutLoading: string | null;
  setCheckoutLoading: (v: string | null) => void;
}) {
  const price = annual ? tier.priceAnnual : tier.price;
  return (
    <motion.div
      key={tier.name}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + i * 0.1, duration: 0.4 }}
      className={`bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-7 flex flex-col transition-all duration-300 ${
        tier.highlight
          ? "border-of-primary/40 ring-1 ring-of-primary/20 shadow-[0_0_20px_rgba(90,218,206,0.15)] relative lg:-mt-4 lg:mb-4"
          : "hover:border-of-outline-variant/15-hover"
      }`}
    >
      {tier.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-of-primary text-of-on-primary text-xs font-semibold px-4 py-1 rounded-full whitespace-nowrap">
            Most Popular
          </span>
        </div>
      )}

      <h3 className="text-lg font-semibold">{tier.name}</h3>
      <p className="mt-1 text-sm text-of-on-surface-variant">{tier.tagline}</p>

      <div className="mt-5 mb-2">
        <span className="text-4xl font-bold">{price}</span>
        {tier.period && (
          <span className="text-of-on-surface-variant text-sm">{tier.period}</span>
        )}
        {annual && tier.priceAnnual !== tier.price && tier.priceAnnual !== "Free" && tier.priceAnnual !== "Custom" && tier.priceAnnual !== "Contact Us" && (
          <span className="block text-xs text-of-outline mt-1">billed annually</span>
        )}
      </div>

      <div className="flex gap-3 text-xs text-of-outline mb-5">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {tier.agents}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              ? "bg-of-primary text-of-on-primary hover:from-of-primary hover:to-of-primary shadow-lg shadow-of-primary/20"
              : "border border-of-outline-variant/15 hover:border-of-outline-variant/15-hover text-foreground hover:bg-of-surface-container/50"
          } ${checkoutLoading === tier.planId ? "opacity-60 cursor-wait" : ""}`}
        >
          {checkoutLoading === tier.planId ? "Redirecting..." : tier.cta}
        </button>
      ) : (
        <Link
          href={tier.ctaHref}
          className={`block text-center rounded-lg px-5 py-3 text-sm font-medium transition-all ${
            tier.name === "Community"
              ? "border border-of-primary/30 text-of-primary hover:bg-of-primary/10"
              : "border border-of-outline-variant/15 hover:border-of-outline-variant/15-hover text-foreground hover:bg-of-surface-container/50"
          }`}
        >
          {tier.cta}
        </Link>
      )}

      <div className="mt-6 border-t border-of-outline-variant/15 pt-5 flex-1">
        <ul className="space-y-2.5">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-of-on-surface-variant">
              <svg
                className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                  tier.highlight ? "text-of-primary" : "text-of-primary"
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
            className="inline-flex items-center gap-2 rounded-full border border-of-primary/30 bg-of-primary/10 px-4 py-1.5 text-sm text-of-primary mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Free forever for the Community tier &middot; No per-seat pricing
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
          >
            One platform.{" "}
            <span className="text-of-primary">Flat-rate pricing.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-6 text-lg sm:text-xl text-of-on-surface-variant max-w-2xl mx-auto"
          >
            Your security bill should not grow every time you deploy a new AI agent.
            Unlimited seats, every tier.
          </motion.p>
        </section>

        {/* Billing toggle */}
        <section className="text-center pb-10">
          <div className="inline-flex items-center gap-3 rounded-full bg-of-surface-container/50 border border-of-outline-variant/15 p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                !annual
                  ? "bg-of-primary/15 text-of-primary border border-of-primary/30"
                  : "text-of-on-surface-variant hover:text-foreground border border-transparent"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                annual
                  ? "bg-of-primary/15 text-of-primary border border-of-primary/30"
                  : "text-of-on-surface-variant hover:text-foreground border border-transparent"
              }`}
            >
              Annual
              <span className="text-[10px] font-semibold bg-of-primary/20 text-of-primary px-2 py-0.5 rounded-full">
                Save ~20%
              </span>
            </button>
          </div>
        </section>

        {/* Core Pricing Cards */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-16">
          <div ref={cardsRef} className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
            {tiers.map((tier, i) => (
              <TierCard
                key={tier.name}
                tier={tier}
                i={i}
                annual={annual}
                checkoutLoading={checkoutLoading}
                setCheckoutLoading={setCheckoutLoading}
              />
            ))}
          </div>
        </section>

        {/* Partner & Managed Tiers */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-of-primary/20 bg-of-primary/5 px-4 py-1.5 text-sm text-of-primary mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Partner &amp; Managed Tiers
            </span>
            <h2 className="text-2xl font-bold">For platforms, MSSPs, and managed deployments</h2>
            <p className="mt-3 text-sm text-of-on-surface-variant max-w-xl mx-auto">
              Build your own AI security practice on top of Tiresias, or let us run it for you.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {partnerTiers.map((tier, i) => (
              <TierCard
                key={tier.name}
                tier={tier}
                i={i}
                annual={annual}
                checkoutLoading={checkoutLoading}
                setCheckoutLoading={setCheckoutLoading}
              />
            ))}
          </div>
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
            <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-of-primary/15 mx-auto mb-4">
                <svg className="h-5 w-5 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-2">No per-seat tax</h3>
              <p className="text-xs text-of-on-surface-variant leading-relaxed">Unlimited users on every tier. Your security bill stays flat as your team grows.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: 0.1 }} className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-of-primary/15 mx-auto mb-4">
                <svg className="h-5 w-5 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-2">Self-hosted by default</h3>
              <p className="text-xs text-of-on-surface-variant leading-relaxed">Your data never leaves your infrastructure. Not a premium feature — the default.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: 0.2 }} className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-of-primary/15 mx-auto mb-4">
                <svg className="h-5 w-5 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm mb-2">Security-first, not observability-only</h3>
              <p className="text-xs text-of-on-surface-variant leading-relaxed">PRH prompt risk engine, 18-type anomaly detection, Sigma rules, quarantine — capabilities no LLM observability tool offers at any price.</p>
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
            className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12 shadow-[0_0_20px_rgba(90,218,206,0.15)]"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Ready to secure your agents?
            </h2>
            <p className="text-of-on-surface-variant mb-8 max-w-xl mx-auto">
              Start free. No credit card. Full platform. Upgrade when you are ready.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/trial"
                className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-8 py-3 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all shadow-lg shadow-of-primary/20"
              >
                Start Free
              </Link>
              <Link
                href="mailto:enterprise@saluca.com?subject=Enterprise%20Inquiry"
                className="rounded-lg border border-of-outline-variant/15 px-8 py-3 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover hover:bg-of-surface-container/50 transition-all"
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
