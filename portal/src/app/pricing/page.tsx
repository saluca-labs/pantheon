"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/** Canonical pricing page — flat-rate, unified platform (SoulAuth + SoulWatch + SoulGate). */

interface Tier {
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  period: string;
  tagline: string;
  highlight: boolean;
  cta: string;
  ctaHref: string;
  agents: string;
  requests: string;
  retention: string;
  features: string[];
}

const tiers: Tier[] = [
  {
    name: "Community",
    priceMonthly: "Free",
    priceAnnual: "Free",
    period: "",
    tagline: "Run locally. Your data never leaves your network.",
    highlight: false,
    cta: "Download Free",
    ctaHref: "/docs/quickstart",
    agents: "25",
    requests: "10K/mo",
    retention: "7 days",
    features: [
      "Docker Compose deployment",
      "Encrypted audit logging",
      "Local dashboard",
      "Basic audit logging",
      "Unlimited seats",
      "Community support",
    ],
  },
  {
    name: "Starter",
    priceMonthly: "$49",
    priceAnnual: "$488",
    period: "/mo",
    tagline: "For growing teams with production agents",
    highlight: false,
    cta: "Start Free Trial",
    ctaHref: "/trial",
    agents: "50",
    requests: "100K/mo",
    retention: "30 days",
    features: [
      "Docker Compose deployment",
      "Encrypted audit logging",
      "Local dashboard",
      "Session replay",
      "Basic policies",
      "Cost alerts",
      "Email support (48h response)",
    ],
  },
  {
    name: "Pro",
    priceMonthly: "$199",
    priceAnnual: "$1,982",
    period: "/mo",
    tagline: "For security teams running at scale",
    highlight: true,
    cta: "Start Free Trial",
    ctaHref: "/trial",
    agents: "250",
    requests: "1M/mo",
    retention: "90 days",
    features: [
      "Docker Compose deployment",
      "Encrypted audit logging",
      "Local dashboard",
      "Session replay",
      "BYOK encryption",
      "Sigma detection rules",
      "PII scanning",
      "Investigation (L0\u2013L2)",
      "Priority support (24h response)",
    ],
  },
  {
    name: "Enterprise",
    priceMonthly: "$2,499",
    priceAnnual: "Negotiated",
    period: "/mo",
    tagline: "For security-critical and regulated environments",
    highlight: false,
    cta: "Contact Sales",
    ctaHref: "mailto:contact@saluca.com?subject=Tiresias%20Enterprise",
    agents: "Unlimited",
    requests: "Unlimited",
    retention: "Custom",
    features: [
      "Docker Compose deployment",
      "Encrypted audit logging",
      "Local dashboard",
      "Session replay",
      "BYOK encryption",
      "Sigma detection rules",
      "PII scanning",
      "Investigation (L0\u2013L2)",
      "SIEM forwarding",
      "Audit export",
      "Custom detection rules",
      "Delegation & RBAC",
      "Dedicated support (4h P0 response)",
    ],
  },
  {
    name: "MSSP",
    priceMonthly: "$4,999",
    priceAnnual: "Negotiated",
    period: "/mo",
    tagline: "Multi-tenant management for service providers",
    highlight: false,
    cta: "Contact Sales",
    ctaHref: "mailto:contact@saluca.com?subject=Tiresias%20MSSP",
    agents: "Unlimited",
    requests: "Unlimited",
    retention: "Custom",
    features: [
      "Everything in Enterprise",
      "Multi-tenant isolation",
      "Sub-tenant management",
      "White-label branding",
      "Partner revenue share",
      "Dedicated account team",
    ],
  },
];

const featureMatrix: { feature: string; community: string; starter: string; pro: string; enterprise: string; mssp: string }[] = [
  { feature: "On-prem Docker Compose", community: "check", starter: "check", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "Encrypted audit logging", community: "check", starter: "check", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "Dashboard (local)", community: "check", starter: "check", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "Managed agents", community: "25", starter: "50", pro: "250", enterprise: "Unlimited", mssp: "Unlimited" },
  { feature: "Requests", community: "10K/mo", starter: "100K/mo", pro: "1M/mo", enterprise: "Unlimited", mssp: "Unlimited" },
  { feature: "Data retention", community: "7 days", starter: "30 days", pro: "90 days", enterprise: "Custom", mssp: "Custom" },
  { feature: "Session replay", community: "dash", starter: "check", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "Basic policies", community: "dash", starter: "check", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "Cost alerts", community: "dash", starter: "check", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "BYOK encryption", community: "dash", starter: "dash", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "Sigma detection rules", community: "dash", starter: "dash", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "PII scanning", community: "dash", starter: "dash", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "Investigation (L0\u2013L2)", community: "dash", starter: "dash", pro: "check", enterprise: "check", mssp: "check" },
  { feature: "SIEM forwarding", community: "dash", starter: "dash", pro: "dash", enterprise: "check", mssp: "check" },
  { feature: "Audit export", community: "dash", starter: "dash", pro: "dash", enterprise: "check", mssp: "check" },
  { feature: "Custom detection rules", community: "dash", starter: "dash", pro: "dash", enterprise: "check", mssp: "check" },
  { feature: "Multi-tenant", community: "dash", starter: "dash", pro: "dash", enterprise: "dash", mssp: "check" },
  { feature: "White-label", community: "dash", starter: "dash", pro: "dash", enterprise: "dash", mssp: "check" },
  { feature: "Managed cloud proxy", community: "Add-on", starter: "Add-on", pro: "Add-on", enterprise: "Add-on", mssp: "Add-on" },
  { feature: "Support", community: "Community", starter: "Email (48h)", pro: "Priority (24h)", enterprise: "Dedicated (4h P0)", mssp: "Dedicated account team" },
];

const faqs = [
  {
    q: "How does deployment work?",
    a: "Every tier ships as a Docker Compose stack you run on your own infrastructure. Pull the images, run docker compose up, and your proxy is live in minutes. Your data never leaves your network unless you explicitly enable the managed cloud proxy add-on.",
  },
  {
    q: "How does billing work?",
    a: "Tiresias uses flat-rate pricing. You pay a fixed monthly or annual fee based on your tier \u2014 not per agent, not per seat. Your security bill should not grow every time you deploy a new AI agent.",
  },
  {
    q: "What is the managed cloud proxy?",
    a: "An optional add-on for any tier. Instead of running Docker Compose yourself, point your agents at proxy.tiresias.network and we handle the infrastructure. Same features, same security \u2014 just hosted by us. Available as a supplementary option alongside your on-prem deployment or as a standalone.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel at any time from your billing dashboard. Your access continues through the end of the current billing period, then downgrades to the Community (free) tier.",
  },
  {
    q: "What is your refund policy?",
    a: "All purchases are final \u2014 there are no refunds. You can cancel your subscription at any time to prevent future charges. Monthly plans stop at the end of the current billing period. Annual plans stop auto-renewal at the end of the term. Enterprise and MSSP contracts have separate cancellation terms negotiated at signing.",
  },
  {
    q: "Who qualifies for the free Community tier?",
    a: "The Community tier is free forever for individuals, students, open-source projects, and businesses under $1M ARR. No credit card required. No time-limited trial \u2014 natural feature limits enforce tier boundaries.",
  },
  {
    q: "What products are included?",
    a: "Every tier includes all three products: SoulAuth (agent identity & auth), SoulWatch (runtime monitoring & anomaly detection), and SoulGate (API gateway & threat protection). There is no need to purchase products separately.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Starter and Pro plans include a 14-day free trial with full access to all features in your tier. No credit card is required to start. At the end of the trial you can subscribe or your account downgrades to the Community (free) tier automatically.",
  },
  {
    q: "Do you offer annual discounts?",
    a: "Yes. Annual billing saves 17% compared to monthly pricing on all paid tiers. Enterprise and MSSP contracts include negotiated terms.",
  },
  {
    q: "Is there a per-agent or per-seat fee?",
    a: "No. Tiresias pricing is flat-rate. Unlimited seats at every tier, and managed agent limits are generous. If you need more than 250 agents, the Enterprise and MSSP tiers include unlimited.",
  },
  {
    q: "What is the MSSP tier?",
    a: "The MSSP tier is designed for managed security service providers who need multi-tenant isolation, sub-tenant management, white-label branding, and partner revenue share. Contact sales for custom pricing and onboarding.",
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4 text-teal-500"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function DashIcon() {
  return (
    <span className="text-foreground-subtle">&mdash;</span>
  );
}

function FeatureCell({ value }: { value: string }) {
  if (value === "check") return <CheckIcon className="h-4 w-4 text-teal-500 mx-auto" />;
  if (value === "dash") return <DashIcon />;
  if (value === "Add-on") return <span className="text-xs font-medium text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full">Add-on</span>;
  return <span className="text-sm text-foreground-muted">{value}</span>;
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const cardsRef = useRef(null);

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 text-center pt-12 pb-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
          >
            On-prem by default.{" "}
            <span className="text-gradient-gold">Flat-rate pricing.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-6 text-lg sm:text-xl text-foreground-muted max-w-2xl mx-auto"
          >
            Every tier ships as a Docker Compose stack you run on your infrastructure.
            <br />
            <span className="text-foreground-subtle text-base">
              Your data never leaves your network. One platform. All three products. No per-agent fees.
            </span>
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
          <div ref={cardsRef} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5 items-start">
            {tiers.map((tier, i) => {
              const isNegotiated = tier.name === "Enterprise" || tier.name === "MSSP";
              const isFree = tier.priceMonthly === "Free";

              let displayPrice: string;
              let displayPeriod = tier.period;
              let billedNote = "";

              if (isFree) {
                displayPrice = "Free";
                displayPeriod = "";
              } else if (isNegotiated && annual) {
                displayPrice = "Negotiated";
                displayPeriod = "";
              } else if (annual) {
                displayPrice = tier.priceAnnual;
                displayPeriod = "/yr";
                billedNote = "billed annually";
              } else {
                displayPrice = tier.priceMonthly;
              }

              return (
                <motion.div
                  key={tier.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.1, duration: 0.4 }}
                  className={`glass-card rounded-2xl p-6 flex flex-col transition-all duration-300 ${
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

                  <div className="mt-6 mb-6">
                    <span className={`font-bold ${displayPrice.length > 6 ? "text-2xl" : "text-4xl"}`}>
                      {displayPrice}
                    </span>
                    {displayPeriod && (
                      <span className="text-foreground-muted text-sm">{displayPeriod}</span>
                    )}
                    {billedNote && (
                      <span className="block text-xs text-foreground-subtle mt-1">{billedNote}</span>
                    )}
                  </div>

                  <Link
                    href={tier.ctaHref}
                    className={`block text-center rounded-lg px-5 py-3 text-sm font-medium transition-all ${
                      tier.highlight
                        ? "bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 hover:from-gold-500 hover:to-gold-400 shadow-lg shadow-gold-500/20"
                        : isFree
                          ? "border border-border hover:border-border-hover text-foreground hover:bg-navy-800/50"
                          : "border border-border hover:border-border-hover text-foreground hover:bg-navy-800/50"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                  {(tier.name === "Starter" || tier.name === "Pro") && (
                    <p className="text-xs text-foreground-subtle text-center mt-2">14-day free trial &mdash; no credit card required</p>
                  )}

                  <div className="mt-6 pt-4 border-t border-border text-sm text-foreground-subtle space-y-1">
                    <div className="flex justify-between">
                      <span>Agents</span>
                      <span className="font-medium text-foreground">{tier.agents}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Requests</span>
                      <span className="font-medium text-foreground">{tier.requests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Retention</span>
                      <span className="font-medium text-foreground">{tier.retention}</span>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border pt-6 flex-1">
                    <ul className="space-y-3">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm text-foreground-muted">
                          <CheckIcon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${tier.highlight ? "text-gold-500" : "text-teal-500"}`} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="mx-auto max-w-6xl px-6 lg:px-8 pb-24">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold text-center mb-12"
          >
            Compare Plans
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass-card rounded-2xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 font-semibold text-foreground-muted">Feature</th>
                    <th className="text-center p-4 font-semibold">Community</th>
                    <th className="text-center p-4 font-semibold">Starter</th>
                    <th className="text-center p-4 font-semibold text-gold-400">Pro</th>
                    <th className="text-center p-4 font-semibold">Enterprise</th>
                    <th className="text-center p-4 font-semibold">MSSP</th>
                  </tr>
                </thead>
                <tbody>
                  {featureMatrix.map((row, i) => (
                    <tr key={row.feature} className={i % 2 === 0 ? "bg-navy-800/20" : ""}>
                      <td className="p-4 text-foreground-muted">{row.feature}</td>
                      <td className="p-4 text-center"><FeatureCell value={row.community} /></td>
                      <td className="p-4 text-center"><FeatureCell value={row.starter} /></td>
                      <td className="p-4 text-center"><FeatureCell value={row.pro} /></td>
                      <td className="p-4 text-center"><FeatureCell value={row.enterprise} /></td>
                      <td className="p-4 text-center"><FeatureCell value={row.mssp} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </section>

        {/* Managed Cloud Proxy Add-on */}
        <section className="mx-auto max-w-5xl px-6 lg:px-8 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="glass-card rounded-2xl p-10"
          >
            <div className="text-center mb-8">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">Optional Add-on</span>
              <h2 className="text-2xl sm:text-3xl font-bold mt-3">Managed Cloud Proxy</h2>
              <p className="text-foreground-muted mt-3 max-w-xl mx-auto">
                Don&apos;t want to run infrastructure? Point your agents at{" "}
                <code className="text-teal-400 font-mono text-sm">proxy.tiresias.network</code>{" "}
                and we&apos;ll handle everything. Available as an add-on for any tier.
              </p>
            </div>
            <div className="max-w-lg mx-auto">
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <svg className="h-6 w-6 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                  </svg>
                  <h3 className="font-semibold text-lg">Cloud Proxy</h3>
                </div>
                <p className="text-sm text-foreground-muted mb-4">
                  Same features as your on-prem tier, fully managed. No Docker, no infrastructure, no maintenance.
                  We run the proxy &mdash; you just point your agents at it.
                </p>
                <ul className="text-sm text-foreground-muted space-y-2 mb-6 text-left max-w-xs mx-auto">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-teal-500" />
                    <span>Zero infrastructure overhead</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-teal-500" />
                    <span>Automatic updates & patching</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-teal-500" />
                    <span>Same encryption & audit guarantees</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-teal-500" />
                    <span>Available for any tier</span>
                  </li>
                </ul>
                <Link
                  href="/cloud-proxy"
                  className="inline-block rounded-lg border border-teal-500/40 bg-teal-500/10 px-8 py-3 text-sm font-medium text-teal-400 hover:bg-teal-500/20 transition-all"
                >
                  Enable Cloud Proxy
                </Link>
              </div>
            </div>
          </motion.div>
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
              Ready to secure your AI agents?
            </h2>
            <p className="text-foreground-muted mb-8 max-w-xl mx-auto">
              Download the Community tier free. Docker Compose up in minutes. Your data stays yours.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/docs/quickstart"
                className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3 text-sm font-medium text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
              >
                Download Free
              </Link>
              <Link
                href="/trial"
                className="rounded-lg border border-border px-8 py-3 text-sm font-medium text-foreground hover:border-border-hover hover:bg-navy-800/50 transition-all"
              >
                Start Free Trial
              </Link>
              <Link
                href="mailto:contact@saluca.com?subject=Enterprise%20Inquiry"
                className="rounded-lg border border-border px-8 py-3 text-sm font-medium text-foreground hover:border-border-hover hover:bg-navy-800/50 transition-all"
              >
                Contact Sales
              </Link>
            </div>
          </motion.div>
        </section>
      </main>
      <Footer />
    </>
  );
}
