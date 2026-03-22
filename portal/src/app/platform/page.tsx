import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Platform - Tiresias",
  description:
    "One platform, three pillars of AI agent security. SoulAuth, SoulWatch, and SoulGate work together to protect your agent infrastructure.",
};

const products = [
  {
    name: "SoulAuth",
    tagline: "Agent Identity & Zero-Trust Authorization",
    status: "Generally Available",
    statusColor: "bg-of-primary/20 text-of-primary border-of-primary/30",
    accent: "teal",
    href: "/platform/soulauth",
    description:
      "Every AI agent gets a durable identity. Every action is evaluated against real-time policy. No standing permissions, no over-provisioned tokens, no blind trust.",
    features: [
      "SHA-512 Soulkey identities",
      "Zero-trust policy decision point",
      "Short-lived capability tokens (JWT ES256)",
      "Policy-as-code with git sync",
      "Multi-tenancy with row-level security",
      "SIEM integration & Sigma detection",
    ],
  },
  {
    name: "SoulWatch",
    tagline: "AI Runtime Security Monitoring",
    status: "Coming Soon",
    statusColor: "bg-of-surface-container text-of-outline border-of-outline-variant/15",
    accent: "gold",
    href: "/platform/soulwatch",
    description:
      "Real-time behavioral monitoring for your agent fleet. Detect anomalies, policy drift, and threats - without ever accessing the data your agents handle.",
    features: [
      "Real-time behavior monitoring",
      "Behavioral baseline learning",
      "Anomaly detection across fleets",
      "Policy drift detection",
      "Alert routing (PagerDuty, Slack, Teams)",
      "Compliance reporting dashboards",
    ],
  },
  {
    name: "SoulGate",
    tagline: "API Security Gateway",
    status: "Coming Soon",
    statusColor: "bg-of-surface-container text-of-outline border-of-outline-variant/15",
    accent: "gold",
    href: "/platform/soulgate",
    description:
      "The API gateway that speaks agent. Zero-trust enforcement at the perimeter with agent-aware rate limiting, request validation, and automatic token exchange.",
    features: [
      "Agent-aware rate limiting",
      "Request validation against policy",
      "Automatic token exchange",
      "Traffic analysis & threat detection",
      "Agent-tuned DDoS protection",
      "Shadow API detection",
    ],
  },
];

export default function PlatformPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 lg:py-32">
          <div className="absolute inset-0 bg-gradient-to-b from-of-surface-container-low/50 to-transparent" />
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8 text-center">
            <p className="text-sm font-medium tracking-widest uppercase text-of-primary mb-4">
              The Tiresias Platform
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
              One platform, three pillars
              <br />
              <span className="text-of-primary">of AI agent security</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-of-on-surface-variant leading-relaxed">
              Identity. Monitoring. Enforcement. Tiresias delivers zero-knowledge
              security across your entire agent infrastructure - seeing threats,
              never data.
            </p>
          </div>
        </section>

        {/* Architecture Diagram */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 lg:p-12">
              <h2 className="text-center text-2xl font-semibold mb-12">
                How the platform works together
              </h2>

              {/* Visual flow diagram */}
              <div className="flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-4">
                {/* Agent */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-of-surface-container border border-of-outline-variant/15 flex items-center justify-center mb-3">
                    <svg className="w-10 h-10 text-of-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">AI Agent</span>
                </div>

                {/* Arrow */}
                <div className="hidden lg:block text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <div className="lg:hidden text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
                  </svg>
                </div>

                {/* SoulAuth */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-of-primary/10 border border-of-primary/30 flex items-center justify-center mb-3 glow-teal">
                    <svg className="w-10 h-10 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-of-primary">SoulAuth</span>
                  <span className="text-xs text-of-outline">Identity & AuthZ</span>
                </div>

                {/* Arrow */}
                <div className="hidden lg:block text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <div className="lg:hidden text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
                  </svg>
                </div>

                {/* SoulWatch */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-of-primary/10 border border-of-primary/30 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(90,218,206,0.15)]">
                    <svg className="w-10 h-10 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-of-primary">SoulWatch</span>
                  <span className="text-xs text-of-outline">Monitoring</span>
                </div>

                {/* Arrow */}
                <div className="hidden lg:block text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <div className="lg:hidden text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
                  </svg>
                </div>

                {/* SoulGate */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-of-primary/10 border border-of-primary/30 flex items-center justify-center mb-3">
                    <svg className="w-10 h-10 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-of-primary">SoulGate</span>
                  <span className="text-xs text-of-outline">Gateway</span>
                </div>

                {/* Arrow */}
                <div className="hidden lg:block text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <div className="lg:hidden text-of-outline">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
                  </svg>
                </div>

                {/* Resource */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-of-surface-container border border-of-outline-variant/15 flex items-center justify-center mb-3">
                    <svg className="w-10 h-10 text-of-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">Resources</span>
                </div>
              </div>

              <p className="text-center text-sm text-of-outline mt-8">
                Agent requests flow through identity verification, real-time monitoring, and gateway enforcement - end to end.
              </p>
            </div>
          </div>
        </section>

        {/* Better Together */}
        <section className="py-16 lg:py-24 bg-of-surface-container-low/30">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Better <span className="text-of-primary">Together</span>
              </h2>
              <p className="mx-auto max-w-2xl text-of-on-surface-variant leading-relaxed">
                Each product is powerful on its own, but the real magic happens when they
                work as an integrated platform. Identity feeds monitoring. Monitoring
                informs enforcement. Enforcement validates identity.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-of-primary mb-2">Identity</div>
                <p className="text-sm text-of-on-surface-variant">
                  SoulAuth establishes who an agent is and what it can do. Every action
                  starts with verified identity.
                </p>
              </div>
              <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-of-primary mb-2">Visibility</div>
                <p className="text-sm text-of-on-surface-variant">
                  SoulWatch monitors what agents actually do against what they should do.
                  Zero-knowledge behavioral analysis.
                </p>
              </div>
              <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-of-primary mb-2">Enforcement</div>
                <p className="text-sm text-of-on-surface-variant">
                  SoulGate enforces policy at the API perimeter. Bad requests never
                  reach your services.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Product Cards */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Three products. One mission.
              </h2>
              <p className="text-of-on-surface-variant">
                Secure every agent, every action, every API call.
              </p>
            </div>

            <div className="space-y-8">
              {products.map((product) => (
                <div
                  key={product.name}
                  className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 lg:p-10 hover:border-of-outline-variant/15-hover transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-2xl font-bold">{product.name}</h3>
                        <span
                          className={`text-[11px] font-medium px-3 py-1 rounded-full border ${product.statusColor}`}
                        >
                          {product.status}
                        </span>
                      </div>
                      <p className="text-lg text-of-on-surface-variant mb-2">
                        {product.tagline}
                      </p>
                      <p className="text-of-on-surface-variant leading-relaxed mb-6">
                        {product.description}
                      </p>
                      <Link
                        href={product.href}
                        className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
                          product.accent === "teal"
                            ? "text-of-primary hover:text-of-primary/70"
                            : "text-of-primary hover:text-of-primary/70"
                        }`}
                      >
                        Learn more
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    </div>
                    <div className="lg:w-72 shrink-0">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-of-outline mb-3">
                        Key capabilities
                      </h4>
                      <ul className="space-y-2">
                        {product.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-start gap-2 text-sm text-of-on-surface-variant"
                          >
                            <svg
                              className={`w-4 h-4 mt-0.5 shrink-0 ${
                                product.accent === "teal"
                                  ? "text-of-primary"
                                  : "text-of-primary"
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 lg:py-24 bg-of-surface-container-low/30">
          <div className="mx-auto max-w-3xl px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to secure your agents?
            </h2>
            <p className="text-of-on-surface-variant mb-8 leading-relaxed">
              SoulAuth is live and ready. Start with a free trial - no credit card
              required. Full platform access in minutes.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/trial"
                className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-8 py-3 text-sm font-semibold text-of-background hover:from-of-primary hover:to-of-primary transition-all shadow-lg shadow-of-primary/20"
              >
                Start Free Trial
              </Link>
              <Link
                href="/platform/soulauth"
                className="rounded-lg border border-of-outline-variant/15 px-8 py-3 text-sm font-medium text-of-on-surface-variant hover:text-foreground hover:border-of-outline-variant/15-hover transition-all"
              >
                Explore SoulAuth
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
