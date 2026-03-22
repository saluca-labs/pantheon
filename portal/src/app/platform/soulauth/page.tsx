"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const featureCategories: Record<string, { color: string; border: string; glow: string }> = {
  identity: { color: "border-l-of-primary", border: "hover:border-of-primary/30", glow: "group-hover:shadow-of-primary/10" },
  authorization: { color: "border-l-of-primary", border: "hover:border-of-primary/30", glow: "group-hover:shadow-of-primary/10" },
  detection: { color: "border-l-red-400", border: "hover:border-red-400/30", glow: "group-hover:shadow-red-400/10" },
  integration: { color: "border-l-blue-400", border: "hover:border-blue-400/30", glow: "group-hover:shadow-blue-400/10" },
};

const features = [
  {
    title: "Soulkey Identity",
    category: "identity",
    description:
      "Durable SHA-512 agent identities that persist across sessions. Not disposable tokens - real identity anchors for your agent fleet.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    title: "Zero-Trust PDP",
    category: "authorization",
    description:
      "Just-in-time policy evaluation for every request. No standing permissions, no cached authorizations. Every action is evaluated fresh against current policy.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Capability Tokens",
    category: "authorization",
    description:
      "JWT ES256 tokens with 5-15 minute TTL. Granular scoping to specific actions and resources. Tokens expire before they can be abused.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
      </svg>
    ),
  },
  {
    title: "Policy-as-Code",
    category: "authorization",
    description:
      "YAML-based authorization rules synced from git. Version-controlled, auditable, reviewable. Your security team can PR policy changes like code.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    title: "Multi-Tenancy",
    category: "identity",
    description:
      "Full tenant isolation with row-level security. Each tenant gets their own policy namespace, audit stream, and identity pool. Zero cross-contamination.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Audit Trail",
    category: "integration",
    description:
      "Append-only, immutable event log. Every authorization decision, every policy evaluation, every identity operation - recorded and tamper-evident.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    title: "SIEM Integration",
    category: "integration",
    description:
      "Native connectors for Splunk HEC, Elastic, Syslog/CEF, Azure Sentinel, and Webhooks. Your SOC sees agent events in their existing tools.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    title: "Sigma Detection",
    category: "detection",
    description:
      "SOC-compatible detection rule engine with 6 starter rules. Write detection logic in the Sigma format your security analysts already know.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    title: "Quarantine Engine",
    category: "detection",
    description:
      "7 automated response actions when threats are detected. Isolate compromised agents, revoke tokens, and contain breaches - automatically.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
  {
    title: "Delegation",
    category: "authorization",
    description:
      "Temporary, scoped access grants between agents. Agent A can delegate a subset of its capabilities to Agent B - with time limits and audit trails.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
];

const integrations = [
  { name: "Python SDK", description: "pip install soulauth" },
  { name: "REST API", description: "OpenAPI 3.1 spec" },
  { name: "Docker", description: "Official container image" },
  { name: "Kubernetes", description: "Helm chart + operator" },
];

/* ─── Terminal Code Block ─── */

function TerminalBlock({ filename, code }: { filename: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5 }}
      className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl overflow-hidden terminal-window"
    >
      <div className="flex items-center justify-between px-6 py-3 bg-of-surface-container/50 border-b border-of-outline-variant/15">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <span className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-of-outline font-mono">
            {filename}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="text-xs text-of-outline hover:text-of-on-surface-variant transition-colors px-2 py-1 rounded border border-of-outline-variant/15 hover:border-of-outline-variant/15-hover"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-6 overflow-x-auto text-sm leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </motion.div>
  );
}

/* ─── Architecture Diagram (animated) ─── */

function ArchitectureDiagram() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const steps = [
    {
      label: "Agent",
      sublabel: "Presents Soulkey",
      color: "border-foreground-subtle text-of-on-surface-variant",
      bg: "bg-of-surface-container",
    },
    {
      label: "Soulkey Verify",
      sublabel: "SHA-512 identity check",
      color: "border-of-primary/40 text-of-primary",
      bg: "bg-of-primary/10",
    },
    {
      label: "PDP",
      sublabel: "Policy evaluation",
      color: "border-of-primary/40 text-of-primary",
      bg: "bg-of-primary/10",
    },
    {
      label: "Capability Token",
      sublabel: "JWT ES256, 5-15 min TTL",
      color: "border-of-primary/40 text-of-primary",
      bg: "bg-of-primary/10",
    },
    {
      label: "PEP",
      sublabel: "Enforcement point",
      color: "border-of-primary/40 text-of-primary",
      bg: "bg-of-primary/10",
    },
    {
      label: "Resource",
      sublabel: "Access granted",
      color: "border-foreground-subtle text-of-on-surface-variant",
      bg: "bg-of-surface-container",
    },
  ];

  return (
    <div ref={ref} className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 lg:p-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {steps.map((step, i) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.15 * i, duration: 0.4, ease: "easeOut" }}
              className="flex items-center gap-4"
            >
              <div
                className={`flex flex-col items-center justify-center w-28 h-20 rounded-xl border ${step.color} ${step.bg} text-center px-2 transition-all duration-300 hover:scale-105`}
              >
                <span className="text-xs font-semibold">{step.label}</span>
                <span className="text-[10px] text-of-outline mt-0.5 leading-tight">
                  {step.sublabel}
                </span>
              </div>
              {i < steps.length - 1 && (
                <motion.svg
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.15 * i + 0.3, duration: 0.3 }}
                  className="hidden lg:block w-5 h-5 text-of-outline shrink-0"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </motion.svg>
              )}
              {i < steps.length - 1 && (
                <motion.svg
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.15 * i + 0.3, duration: 0.3 }}
                  className="lg:hidden w-5 h-5 text-of-outline shrink-0"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
                </motion.svg>
              )}
            </motion.div>
          ))}
        </div>

        {/* Labels */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 1.2, duration: 0.4 }}
          className="flex flex-col lg:flex-row items-center justify-center gap-6 pt-4 border-t border-of-outline-variant/15 mt-4"
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-of-primary/30 border border-of-primary/40" />
            <span className="text-xs text-of-outline">SoulAuth components</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-of-primary/20 border border-of-primary/40" />
            <span className="text-xs text-of-outline">Enforcement layer</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-of-surface-container border border-foreground-subtle/30" />
            <span className="text-xs text-of-outline">External</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function SoulAuthPage() {
  const featuresRef = useRef(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: "-60px" });
  const integrationsRef = useRef(null);
  const integrationsInView = useInView(integrationsRef, { once: true, margin: "-60px" });

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 lg:py-32">
          <div className="absolute inset-0 bg-gradient-to-b from-of-primary/5 to-transparent" />
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
            <div className="max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex items-center gap-3 mb-6"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-of-primary/15 border border-of-primary/30 px-3 py-1 text-xs font-medium text-of-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-of-primary pulse-glow-teal" />
                  Generally Available
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6"
              >
                <span className="text-gradient-teal">SoulAuth</span>
                <br />
                Agent Identity &amp;
                <br />
                Zero-Trust Authorization
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="text-xl text-of-on-surface-variant leading-relaxed mb-4"
              >
                Every AI agent deserves an identity. Every action deserves authorization.
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="text-of-on-surface-variant leading-relaxed mb-8"
              >
                SoulAuth gives your AI agents durable cryptographic identities and
                evaluates every action against real-time policy. No standing permissions.
                No over-provisioned access. No blind trust.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Link
                  href="/trial"
                  className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-8 py-3 text-center text-sm font-semibold text-of-background hover:from-of-primary hover:to-of-primary transition-all shadow-lg shadow-of-primary/20"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/developers"
                  className="rounded-lg border border-of-outline-variant/15 px-8 py-3 text-center text-sm font-medium text-of-on-surface-variant hover:text-foreground hover:border-of-outline-variant/15-hover transition-all"
                >
                  Read the Docs
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 lg:py-24 bg-of-surface-container-low/30">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Everything you need to secure
                <br />
                <span className="text-gradient-teal">your agent fleet</span>
              </h2>
              <p className="mx-auto max-w-2xl text-of-on-surface-variant">
                Ten deeply integrated capabilities, from identity to incident response.
                Built for production. Built for scale.
              </p>
            </motion.div>

            <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map((feature, i) => {
                const cat = featureCategories[feature.category] || featureCategories.identity;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ delay: i * 0.06, duration: 0.4 }}
                    className={`bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 border-l-4 ${cat.color} ${cat.border} transition-all group card-hover-lift`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 w-10 h-10 rounded-lg bg-of-primary/10 border border-of-primary/20 flex items-center justify-center text-of-primary group-hover:bg-of-primary/20 transition-colors">
                        {feature.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{feature.title}</h3>
                        <p className="text-sm text-of-on-surface-variant leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Architecture Diagram */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                How SoulAuth works
              </h2>
              <p className="text-of-on-surface-variant">
                Every request follows a zero-trust path from agent to resource.
              </p>
            </motion.div>

            <ArchitectureDiagram />
          </div>
        </section>

        {/* Code Example */}
        <section className="py-16 lg:py-24 bg-of-surface-container-low/30">
          <div className="mx-auto max-w-4xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Simple to integrate
              </h2>
              <p className="text-of-on-surface-variant">
                A few lines of Python. That&apos;s all it takes.
              </p>
            </motion.div>

            <div className="space-y-6">
              <TerminalBlock
                filename="agent.py"
                code={`from soulauth import SoulAuthClient

client = SoulAuthClient(soulkey="sk_live_...")
token = client.authorize(
    action="read",
    resource="customer-data",
    context={"department": "analytics"}
)
# token.jwt - short-lived capability token
# token.expires_in - 300 seconds`}
              />

              <TerminalBlock
                filename="policy.yaml"
                code={`# policy-as-code: git-synced, version-controlled
policies:
  - name: analytics-read
    effect: allow
    soulkeys: ["sk_analytics_*"]
    actions: ["read"]
    resources: ["customer-data", "reports"]
    conditions:
      department: analytics
      time_window: "09:00-18:00"`}
              />
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Works with your stack
              </h2>
              <p className="text-of-on-surface-variant">
                Deploy however you want. Integrate with what you already use.
              </p>
            </motion.div>

            <div ref={integrationsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {integrations.map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={integrationsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 text-center card-hover-lift"
                >
                  <h3 className="font-semibold mb-1">{item.name}</h3>
                  <p className="text-sm text-of-on-surface-variant font-mono">
                    {item.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 lg:py-24 bg-of-surface-container-low/30">
          <div className="mx-auto max-w-3xl px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Secure your agents today
              </h2>
              <p className="text-of-on-surface-variant mb-8 leading-relaxed">
                SoulAuth is production-ready. Start with a free trial - full platform
                access, no credit card required. Your agents are one soulkey away from
                zero-trust security.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  href="/trial"
                  className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-8 py-3 text-sm font-semibold text-of-background hover:from-of-primary hover:to-of-primary transition-all shadow-lg shadow-of-primary/20"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/developers"
                  className="rounded-lg border border-of-outline-variant/15 px-8 py-3 text-sm font-medium text-of-on-surface-variant hover:text-foreground hover:border-of-outline-variant/15-hover transition-all"
                >
                  Read the Docs
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
