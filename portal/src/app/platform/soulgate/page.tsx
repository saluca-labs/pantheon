"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const features = [
  {
    title: "Agent-Aware Rate Limiting",
    description:
      "Per-soulkey, per-capability rate limits that follow the agent, not the IP. Burst-friendly defaults with configurable RPM, sliding windows, and automatic backoff.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Prompt Injection Detection",
    description:
      "Real-time scanning for prompt injection, jailbreak attempts, and payload manipulation in request bodies. Purpose-built for LLM agent traffic patterns.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    title: "Token Validation",
    description:
      "SoulAuth capability tokens validated at the edge before requests reach your services. Expired, revoked, or malformed tokens rejected instantly.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Circuit Breakers",
    description:
      "Automatic circuit breakers per upstream service. When a backend is unhealthy, requests fail fast instead of cascading. Auto-recovery with configurable thresholds.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "IP and Geo Access Controls",
    description:
      "Allowlist and blocklist by IP, CIDR range, or country. Priority-ordered rule evaluation with test-before-deploy tooling. Block entire regions in one click.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    title: "Request Audit Logging",
    description:
      "Every request through the gateway is logged with method, path, status, source IP, latency, and block reason. Filterable, exportable, and retention-configurable.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    title: "API Key Management",
    description:
      "Issue, rotate, and revoke API keys with grace periods. Blur-to-reveal display, prefix-based identification, and automatic expiration policies.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    title: "Upstream Health Monitoring",
    description:
      "Continuous health checks on every registered upstream. Green/yellow/red status with latency tracking, automatic failover, and configurable check intervals.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
];

/* Terminal Code Block */
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
      className="glass-card rounded-2xl overflow-hidden terminal-window"
    >
      <div className="flex items-center justify-between px-6 py-3 bg-navy-800/50 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <span className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-foreground-subtle font-mono">
            {filename}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="text-xs text-foreground-subtle hover:text-foreground-muted transition-colors px-2 py-1 rounded border border-border hover:border-border-hover"
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

/* Architecture Pipeline Diagram */
function PipelineDiagram() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const steps = [
    {
      label: "Request",
      sublabel: "Inbound agent traffic",
      color: "border-foreground-subtle text-foreground-muted",
      bg: "bg-navy-800",
    },
    {
      label: "Auth",
      sublabel: "Token + identity check",
      color: "border-amber-500/40 text-amber-400",
      bg: "bg-amber-600/10",
    },
    {
      label: "Access",
      sublabel: "IP + geo rules",
      color: "border-amber-500/40 text-amber-400",
      bg: "bg-amber-600/10",
    },
    {
      label: "Rate Limit",
      sublabel: "Per-key throttle",
      color: "border-amber-500/40 text-amber-400",
      bg: "bg-amber-600/10",
    },
    {
      label: "Inspect",
      sublabel: "Injection scanning",
      color: "border-gold-500/40 text-gold-400",
      bg: "bg-gold-500/10",
    },
    {
      label: "Proxy",
      sublabel: "Upstream forwarding",
      color: "border-teal-500/40 text-teal-400",
      bg: "bg-teal-600/10",
    },
    {
      label: "Audit",
      sublabel: "Log + metrics",
      color: "border-foreground-subtle text-foreground-muted",
      bg: "bg-navy-800",
    },
  ];

  return (
    <div ref={ref} className="glass-card rounded-2xl p-8 lg:p-12">
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
                <span className="text-[10px] text-foreground-subtle mt-0.5 leading-tight">
                  {step.sublabel}
                </span>
              </div>
              {i < steps.length - 1 && (
                <motion.svg
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.15 * i + 0.3, duration: 0.3 }}
                  className="hidden lg:block w-5 h-5 text-foreground-subtle shrink-0"
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
                  className="lg:hidden w-5 h-5 text-foreground-subtle shrink-0"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
                </motion.svg>
              )}
            </motion.div>
          ))}
        </div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 1.2, duration: 0.4 }}
          className="flex flex-col lg:flex-row items-center justify-center gap-6 pt-4 border-t border-border mt-4"
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-600/30 border border-amber-500/40" />
            <span className="text-xs text-foreground-subtle">SoulGate enforcement</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gold-500/20 border border-gold-500/40" />
            <span className="text-xs text-foreground-subtle">Threat inspection</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-teal-600/30 border border-teal-500/40" />
            <span className="text-xs text-foreground-subtle">Upstream proxy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-navy-800 border border-foreground-subtle/30" />
            <span className="text-xs text-foreground-subtle">External</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function SoulGatePage() {
  const featuresRef = useRef(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: "-60px" });

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 lg:py-32">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent" />
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
            <div className="max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex items-center gap-3 mb-6"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-medium text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-glow" />
                  Now Available
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6"
              >
                <span className="text-gradient-gold">SoulGate</span>
                <br />
                API Security
                <br />
                Gateway
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="text-xl text-foreground-muted leading-relaxed mb-4"
              >
                Protect your agent APIs at the edge. Zero-trust enforcement before requests reach your services.
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="text-foreground-muted leading-relaxed mb-8"
              >
                Your APIs were built for human traffic. Now AI agents are making
                thousands of requests per minute. SoulGate is an API security gateway
                purpose-built for agent traffic - with identity-aware rate limiting,
                prompt injection detection, circuit breakers, and full request auditing.
                Every request validated, every threat blocked, every action logged.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Link
                  href="/trial"
                  className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3 text-center text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
                >
                  Join Waitlist
                </Link>
                <Link
                  href="/developers"
                  className="rounded-lg border border-border px-8 py-3 text-center text-sm font-medium text-foreground-muted hover:text-foreground hover:border-border-hover transition-all"
                >
                  Read the Docs
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Problem Statement */}
        <section className="py-16 lg:py-24 bg-navy-900/30">
          <div className="mx-auto max-w-4xl px-6 lg:px-8">
            <div className="glass-card rounded-2xl p-8 lg:p-12 border-gold-500/20">
              <h2 className="text-2xl font-bold mb-4">
                The problem: APIs designed for humans, attacked at agent scale
              </h2>
              <div className="space-y-4 text-foreground-muted leading-relaxed">
                <p>
                  Your APIs were designed for human users making a few requests per
                  minute. Now AI agents are making hundreds. Traditional API gateways
                  rate-limit by IP address - but agents can come from anywhere. They
                  validate OAuth tokens - but agents need capability-scoped tokens with
                  minute-level TTLs.
                </p>
                <p>
                  Worse, the attack surface has changed. Agents are vulnerable to
                  prompt injection, tool-use manipulation, and automated data
                  exfiltration. Your existing WAF does not know what an AI agent is,
                  let alone how to protect one.
                </p>
                <p className="text-foreground font-medium">
                  SoulGate is the API gateway built for the agent era.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Eight capabilities for complete
                <br />
                <span className="text-gradient-gold">API perimeter security</span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground-muted">
                From rate limiting to request inspection. Everything your agent APIs
                need to stay secure at scale.
              </p>
            </motion.div>

            <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  className="glass-card rounded-xl p-6 border-l-4 border-l-amber-500 hover:border-amber-500/30 transition-all group card-hover-lift"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{feature.title}</h3>
                      <p className="text-sm text-foreground-muted leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Architecture Diagram */}
        <section className="py-16 lg:py-24 bg-navy-900/30">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                How SoulGate works
              </h2>
              <p className="text-foreground-muted">
                Every request flows through a seven-stage pipeline from ingestion to audit.
              </p>
            </motion.div>

            <PipelineDiagram />
          </div>
        </section>

        {/* Code Examples */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                See the API in action
              </h2>
              <p className="text-foreground-muted">
                Register upstreams, configure rate limits, and query the audit log - all through a clean REST API.
              </p>
            </motion.div>

            <div className="space-y-6">
              <TerminalBlock
                filename="register_upstream.sh"
                code={`# Register an upstream service with SoulGate
curl -X POST https://tiresias.saluca.com/gate/v1/upstreams \\
  -H "Authorization: Bearer sk_gate_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "analytics-api",
    "base_url": "https://analytics.internal:8080",
    "timeout_ms": 5000,
    "retries": 3,
    "health_check": {
      "path": "/healthz",
      "interval_sec": 30
    }
  }' | jq

# Response:
# {
#   "id": "ups_7f3a...",
#   "name": "analytics-api",
#   "status": "healthy",
#   "circuit_breaker": "closed",
#   "created_at": "2026-03-18T14:22:00Z"
# }`}
              />

              <TerminalBlock
                filename="configure_rate_limit.sh"
                code={`# Set a rate limit policy
curl -X POST https://tiresias.saluca.com/gate/v1/rate-limits \\
  -H "Authorization: Bearer sk_gate_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "standard-agent-limit",
    "target": "per_soulkey",
    "requests_per_minute": 120,
    "burst": 20,
    "action": "reject_429"
  }' | jq

# Response:
# {
#   "id": "rl_a2c8...",
#   "name": "standard-agent-limit",
#   "status": "active",
#   "current_usage": 0
# }`}
              />

              <TerminalBlock
                filename="query_audit.py"
                code={`import requests

# Query the gateway audit log
resp = requests.get(
    "https://tiresias.saluca.com/gate/v1/audit",
    headers={"Authorization": "Bearer sk_gate_live_..."},
    params={
        "status": "blocked",
        "hours": 24,
        "limit": 5
    }
)

for entry in resp.json()["entries"]:
    print(f"{entry['method']} {entry['path']}")
    print(f"  Blocked: {entry['block_reason']}")
    print(f"  Source:  {entry['source_ip']}")
    print(f"  Agent:   {entry['agent_soulkey']}")
    print()`}
              />
            </div>
          </div>
        </section>

        {/* Completes the Platform */}
        <section className="py-16 lg:py-24 bg-navy-900/30">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Completes the <span className="text-gradient-gold">platform</span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground-muted leading-relaxed">
                SoulGate is the enforcement layer of the Tiresias platform. Identity
                (SoulAuth) + Monitoring (SoulWatch) + Enforcement (SoulGate) = complete
                agent security.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-teal-600/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-teal-400">SoulAuth + SoulWatch provide</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Agent identity via Soulkeys",
                    "Policy-based authorization decisions",
                    "Real-time behavioral monitoring",
                    "Anomaly detection and risk scoring",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-foreground-muted">
                      <svg className="w-4 h-4 mt-0.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-amber-400">SoulGate adds</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Edge enforcement before services",
                    "Rate limiting and circuit breakers",
                    "Prompt injection detection",
                    "Full request audit logging",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-foreground-muted">
                      <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-3xl px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Pricing
              </h2>
              <p className="text-foreground-muted mb-8 leading-relaxed">
                SoulGate is included with every Tiresias platform tier at no additional cost.
                Standalone gateway pricing for teams using third-party auth is available on request.
              </p>
              <div className="glass-card rounded-xl p-8 inline-block">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-foreground">Included with Tiresias platform</p>
                    <p className="text-sm text-foreground-muted">Full SoulGate access on every tier</p>
                  </div>
                </div>
                <ul className="text-left space-y-2 mb-6">
                  {[
                    "All 8 gateway capabilities",
                    "Unlimited upstreams",
                    "10M requests/month included",
                    "Full audit log with 90-day retention",
                    "API key management",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-foreground-muted">
                      <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 lg:py-24 bg-navy-900/30">
          <div className="mx-auto max-w-3xl px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Secure your agent APIs today
              </h2>
              <p className="text-foreground-muted mb-8 leading-relaxed">
                SoulGate is production-ready and included on the Open tier.
                Start protecting your APIs in minutes - no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  href="/trial"
                  className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 cta-breathe"
                >
                  Join Waitlist
                </Link>
                <Link
                  href="/developers"
                  className="rounded-lg border border-border px-8 py-3 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-border-hover transition-all"
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
