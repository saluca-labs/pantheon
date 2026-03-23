"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/** Pricing tier comparison page with Stripe checkout integration. */

type Product = "all" | "soulauth" | "soulwatch" | "soulgate";

// Map tier names to checkout plan IDs
const TIER_TO_PLAN: Record<string, Record<string, string>> = {
  soulauth: {
    Community: "soulauth_community",
    Pro: "soulauth_pro",
  },
  soulwatch: {
    Starter: "soulwatch_starter",
    Pro: "soulwatch_pro",
  },
  soulgate: {
    Starter: "soulgate_starter",
    Pro: "soulgate_pro",
  },
  all: {
    "Platform Starter": "bundle_starter",
    "Platform Pro": "bundle_pro",
  },
};

const products: { id: Product; name: string; tagline: string; color: string; bgColor: string; borderColor: string }[] = [
  { id: "all", name: "Tiresias Platform", tagline: "All three products, bundled", color: "text-gold-400", bgColor: "bg-gold-500/10", borderColor: "border-gold-500/30" },
  { id: "soulauth", name: "SoulAuth", tagline: "Agent Identity & Auth", color: "text-gold-400", bgColor: "bg-gold-500/10", borderColor: "border-gold-500/30" },
  { id: "soulwatch", name: "SoulWatch", tagline: "Runtime Monitoring", color: "text-teal-400", bgColor: "bg-teal-500/10", borderColor: "border-teal-500/30" },
  { id: "soulgate", name: "SoulGate", tagline: "API Gateway", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
];

interface Tier {
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  period: string;
  tagline: string;
  highlight: boolean;
  cta: string;
  ctaHref: string;
  features: string[];
}

const pricing: Record<Product, Tier[]> = {
  soulauth: [
    {
      name: "Community",
      priceMonthly: "Free",
      priceAnnual: "Free",
      period: "",
      tagline: "For indie devs and small projects",
      highlight: false,
      cta: "Get Started Free",
      ctaHref: "/developers",
      features: [
        "1 agent identity (soulkey)",
        "1,000 API calls/month",
        "Basic policy evaluation",
        "Local SQLite mode",
        "Python SDK and CLI",
        "Community support",
      ],
    },
    {
      name: "Pro",
      priceMonthly: "$15",
      priceAnnual: "$12",
      period: "/agent/month",
      tagline: "For teams running production agents",
      highlight: true,
      cta: "Join Waitlist",
      ctaHref: "/trial",
      features: [
        "Unlimited agents",
        "50,000 API calls/month",
        "Full policy engine with Git sync",
        "Capability tokens (JWT ES256)",
        "Key lifecycle (rotate, suspend, revoke)",
        "Delegation and escalation",
        "Managed Postgres deployment",
        "Email support (24h response)",
      ],
    },
    {
      name: "Enterprise",
      priceMonthly: "Custom",
      priceAnnual: "Custom",
      period: "",
      tagline: "For security-critical deployments",
      highlight: false,
      cta: "Talk to Sales",
      ctaHref: "mailto:contact@saluca.com?subject=SoulAuth%20Enterprise",
      features: [
        "Everything in Pro",
        "Unlimited API calls",
        "User-agent ABAC with clearance hierarchy",
        "SSO / SAML integration",
        "Custom policy consulting",
        "On-premise deployment option",
        "Dedicated account manager",
        "99.99% uptime SLA",
      ],
    },
  ],
  soulwatch: [
    {
      name: "Starter",
      priceMonthly: "$10",
      priceAnnual: "$8",
      period: "/agent/month",
      tagline: "Basic monitoring for small fleets",
      highlight: false,
      cta: "Join Waitlist",
      ctaHref: "/trial",
      features: [
        "Anomaly detection (8 types)",
        "Behavioral baselines",
        "7 built-in Sigma rules",
        "Agent risk scoring",
        "7-day data retention",
        "Email alerts",
        "Community support",
      ],
    },
    {
      name: "Pro",
      priceMonthly: "$20",
      priceAnnual: "$16",
      period: "/agent/month",
      tagline: "Full monitoring for production",
      highlight: true,
      cta: "Join Waitlist",
      ctaHref: "/trial",
      features: [
        "Everything in Starter",
        "Custom Sigma rules",
        "Response playbooks with auto-quarantine",
        "30-day data retention",
        "1 SIEM destination",
        "WebSocket live feed",
        "Email support (24h response)",
      ],
    },
    {
      name: "Enterprise",
      priceMonthly: "Custom",
      priceAnnual: "Custom",
      period: "",
      tagline: "SOC-grade security monitoring",
      highlight: false,
      cta: "Talk to Sales",
      ctaHref: "mailto:contact@saluca.com?subject=SoulWatch%20Enterprise",
      features: [
        "Everything in Pro",
        "90-day data retention",
        "Unlimited SIEM destinations",
        "SOC2, ISO 27001, NIST reports",
        "PagerDuty, Slack, Teams, OpsGenie",
        "Investigation workflows",
        "Dedicated account manager",
        "99.99% uptime SLA",
      ],
    },
  ],
  soulgate: [
    {
      name: "Starter",
      priceMonthly: "$10",
      priceAnnual: "$8",
      period: "/agent/month",
      tagline: "Basic gateway protection",
      highlight: false,
      cta: "Join Waitlist",
      ctaHref: "/trial",
      features: [
        "Reverse proxy gateway",
        "Rate limiting (sliding window)",
        "Prompt injection detection",
        "Circuit breakers",
        "Request audit logging",
        "7-day audit retention",
        "Community support",
      ],
    },
    {
      name: "Pro",
      priceMonthly: "$20",
      priceAnnual: "$16",
      period: "/agent/month",
      tagline: "Full gateway for production",
      highlight: true,
      cta: "Join Waitlist",
      ctaHref: "/trial",
      features: [
        "Everything in Starter",
        "API key management with rotation",
        "IP access controls (CIDR)",
        "Custom threat patterns",
        "30-day audit retention",
        "Upstream health monitoring",
        "Email support (24h response)",
      ],
    },
    {
      name: "Enterprise",
      priceMonthly: "Custom",
      priceAnnual: "Custom",
      period: "",
      tagline: "Dedicated gateway infrastructure",
      highlight: false,
      cta: "Talk to Sales",
      ctaHref: "mailto:contact@saluca.com?subject=SoulGate%20Enterprise",
      features: [
        "Everything in Pro",
        "Geographic access controls",
        "90-day audit retention",
        "Full audit export (CSV/API)",
        "Dedicated gateway instance",
        "Custom payload inspection rules",
        "Dedicated account manager",
        "99.99% uptime SLA",
      ],
    },
  ],
  all: [
    {
      name: "Platform Starter",
      priceMonthly: "$29",
      priceAnnual: "$23",
      period: "/agent/month",
      tagline: "All three products, one price",
      highlight: false,
      cta: "Join Waitlist",
      ctaHref: "/trial",
      features: [
        "SoulAuth Pro (full identity & auth)",
        "SoulWatch Starter (anomaly detection)",
        "SoulGate Starter (gateway & rate limiting)",
        "Single tenant, unified dashboard",
        "Save 17% vs buying separately",
        "Email support (24h response)",
      ],
    },
    {
      name: "Platform Pro",
      priceMonthly: "$45",
      priceAnnual: "$36",
      period: "/agent/month",
      tagline: "Full platform, best value",
      highlight: true,
      cta: "Join Waitlist",
      ctaHref: "/trial",
      features: [
        "SoulAuth Pro (full identity & auth)",
        "SoulWatch Pro (SIEM, playbooks, custom rules)",
        "SoulGate Pro (API keys, access controls)",
        "Single tenant, unified dashboard",
        "Save 18% vs buying separately",
        "Priority email support",
      ],
    },
    {
      name: "Platform Enterprise",
      priceMonthly: "Custom",
      priceAnnual: "Custom",
      period: "",
      tagline: "Complete security for the enterprise",
      highlight: false,
      cta: "Talk to Sales",
      ctaHref: "mailto:contact@saluca.com?subject=Tiresias%20Enterprise",
      features: [
        "SoulAuth Enterprise",
        "SoulWatch Enterprise",
        "SoulGate Enterprise",
        "Volume discounts",
        "Custom SLAs and deployment",
        "Dedicated account manager",
        "Quarterly security reviews",
        "On-premise option",
      ],
    },
  ],
};

const faqs = [
  {
    q: "Can I buy products separately?",
    a: "Yes. Each product - SoulAuth, SoulWatch, and SoulGate - has its own pricing and can be purchased independently. SoulWatch and SoulGate work best alongside SoulAuth but are not required to bundle.",
  },
  {
    q: "How does the bundle save money?",
    a: "The Platform bundles save 17-18% compared to purchasing each product separately at the same tier. Enterprise bundles include additional volume discounts.",
  },
  {
    q: "What counts as an agent?",
    a: "An agent is any autonomous software entity that receives a SoulAuth identity (soulkey). This includes AI agents, bots, microservices, or any automated process. Human users do not count toward your agent limit.",
  },
  {
    q: "How does the beta work?",
    a: "Tiresias is currently in private beta. Join the waitlist and we'll invite you in waves. Beta users get full platform access to all three products. When we launch publicly, you'll have priority access to all tiers.",
  },
  {
    q: "Can I mix tiers across products?",
    a: "Yes. You can run SoulAuth Pro with SoulWatch Starter and no SoulGate, for example. Each product is billed independently unless you choose a platform bundle.",
  },
  {
    q: "Is there a free tier?",
    a: "SoulAuth Community is free forever - 1 agent, basic policy evaluation, local SQLite. SoulWatch and SoulGate start at their Starter tiers. Beta users get full platform access during the beta period.",
  },
  {
    q: "Do you offer annual discounts?",
    a: "Yes. Annual billing saves 20% compared to monthly pricing on all products and bundles. Enterprise contracts include custom terms and additional volume discounts.",
  },
  {
    q: "Is there a startup program?",
    a: "Yes. Qualified startups (under $5M in funding, fewer than 50 employees) can receive the Platform Pro bundle free for 12 months. Contact us at contact@saluca.com to apply.",
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

async function handleCheckout(product: Product, tierName: string, billingPeriod: "monthly" | "annual") {
  const planId = TIER_TO_PLAN[product]?.[tierName];
  if (!planId) return; // Enterprise tiers go to mailto, free tiers go to /developers

  try {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        quantity: 1,
        tenant_id: "", // Will be populated from session in production
        soulkey: "",    // Will be populated from session in production
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
  const [activeProduct, setActiveProduct] = useState<Product>("all");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const cardsRef = useRef(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cardsInView = useInView(cardsRef, { once: true, margin: "-60px" });

  const tiers = pricing[activeProduct];

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
            Pricing that{" "}
            <span className="text-gradient-gold">scales with you</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-6 text-lg sm:text-xl text-foreground-muted max-w-2xl mx-auto"
          >
            Buy each product independently, or bundle the full platform and save.
          </motion.p>
        </section>

        {/* Product selector */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-6">
          <div className="flex flex-wrap justify-center gap-3">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => setActiveProduct(product.id)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  activeProduct === product.id
                    ? `${product.bgColor} ${product.color} ${product.borderColor}`
                    : "border-border text-foreground-muted hover:text-foreground hover:border-border-hover"
                }`}
              >
                <span className="font-semibold">{product.name}</span>
                <span className="hidden sm:inline text-foreground-subtle ml-2">- {product.tagline}</span>
              </button>
            ))}
          </div>
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
                Save 20%
              </span>
            </button>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
          <div ref={cardsRef} className="grid md:grid-cols-3 gap-8 items-start">
            {tiers.map((tier, i) => {
              const price = annual ? tier.priceAnnual : tier.priceMonthly;
              return (
                <motion.div
                  key={`${activeProduct}-${tier.name}`}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.1, duration: 0.4 }}
                  className={`glass-card rounded-2xl p-8 flex flex-col transition-all duration-300 ${
                    tier.highlight
                      ? "border-gold-500/40 ring-1 ring-gold-500/20 glow-gold relative md:-mt-4 md:mb-4"
                      : "hover:border-border-hover"
                  }`}
                >
                  {tier.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 text-xs font-semibold px-4 py-1 rounded-full whitespace-nowrap">
                        {activeProduct === "all" ? "Best Value" : "Most Popular"}
                      </span>
                    </div>
                  )}

                  <h3 className="text-lg font-semibold">{tier.name}</h3>
                  <p className="mt-1 text-sm text-foreground-muted">{tier.tagline}</p>

                  <div className="mt-6 mb-6">
                    <span className="text-4xl font-bold">{price}</span>
                    {tier.period && (
                      <span className="text-foreground-muted text-sm">{tier.period}</span>
                    )}
                    {annual && tier.priceAnnual !== tier.priceMonthly && tier.priceAnnual !== "Free" && tier.priceAnnual !== "Custom" && (
                      <span className="block text-xs text-foreground-subtle mt-1">billed annually</span>
                    )}
                  </div>

                  {/* CTA: checkout for paid tiers, link for free/enterprise */}
                  {TIER_TO_PLAN[activeProduct]?.[tier.name] &&
                  tier.priceMonthly !== "Free" &&
                  tier.priceMonthly !== "Custom" ? (
                    <button
                      onClick={async () => {
                        setCheckoutLoading(tier.name);
                        await handleCheckout(
                          activeProduct,
                          tier.name,
                          annual ? "annual" : "monthly"
                        );
                        setCheckoutLoading(null);
                      }}
                      disabled={checkoutLoading === tier.name}
                      className={`block w-full text-center rounded-lg px-5 py-3 text-sm font-medium transition-all ${
                        tier.highlight
                          ? "bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 hover:from-gold-500 hover:to-gold-400 shadow-lg shadow-gold-500/20"
                          : "border border-border hover:border-border-hover text-foreground hover:bg-navy-800/50"
                      } ${checkoutLoading === tier.name ? "opacity-60 cursor-wait" : ""}`}
                    >
                      {checkoutLoading === tier.name
                        ? "Redirecting..."
                        : tier.cta}
                    </button>
                  ) : (
                    <Link
                      href={tier.ctaHref}
                      className={`block text-center rounded-lg px-5 py-3 text-sm font-medium transition-all ${
                        tier.highlight
                          ? "bg-gradient-to-r from-gold-600 to-gold-500 text-navy-950 hover:from-gold-500 hover:to-gold-400 shadow-lg shadow-gold-500/20"
                          : "border border-border hover:border-border-hover text-foreground hover:bg-navy-800/50"
                      }`}
                    >
                      {tier.cta}
                    </Link>
                  )}

                  <div className="mt-8 border-t border-border pt-6 flex-1">
                    <ul className="space-y-3">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm text-foreground-muted">
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

          {/* Bundle savings callout */}
          {activeProduct !== "all" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mt-10 text-center"
            >
              <button
                onClick={() => setActiveProduct("all")}
                className="inline-flex items-center gap-2 rounded-xl border border-gold-500/20 bg-gold-500/5 px-6 py-3 text-sm text-gold-400 hover:bg-gold-500/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Save up to 18% with the Tiresias Platform bundle
              </button>
            </motion.div>
          )}
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
              Join the waitlist for early access to the full platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/trial"
                className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3 text-sm font-medium text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
              >
                Join Waitlist
              </Link>
              <Link
                href="mailto:contact@saluca.com?subject=Enterprise%20Inquiry"
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
