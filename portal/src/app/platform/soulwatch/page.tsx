"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const features = [
  {
    title: "Real-Time Anomaly Detection",
    description:
      "Detect behavioral anomalies the moment they happen. Statistical analysis across your entire agent fleet catches threats that single-agent monitoring misses.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "Behavioral Baselines",
    description:
      "SoulWatch learns what normal looks like for each agent. When behavior deviates from the established baseline, you know immediately - before damage is done.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: "Sigma Rule Engine",
    description:
      "SOC-compatible detection rules in the Sigma format your security analysts already know. 6 built-in rules, unlimited custom rules, full YAML editing.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    title: "Response Playbooks",
    description:
      "Automated response workflows triggered by detection rules. Chain multiple actions - rate limiting, alerting, quarantine - into repeatable playbooks.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    title: "Quarantine Orchestration",
    description:
      "7 automated response actions when threats are detected. Isolate compromised agents, revoke tokens, and contain breaches - all without human intervention.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
  {
    title: "SIEM Forwarding",
    description:
      "Native connectors for Splunk HEC, Elastic, Syslog/CEF, Azure Sentinel, and Webhooks. Your SOC sees agent events in their existing tools, zero friction.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    title: "Agent Risk Scoring",
    description:
      "Continuous risk scores calculated from behavioral signals, policy violations, and anomaly patterns. Prioritize investigation on the agents that matter most.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
  },
  {
    title: "Compliance Reporting",
    description:
      "Auto-generated reports mapped to SOC2, ISO 27001, and NIST 800-53 controls. Export to PDF or CSV. Built to support your compliance journey, not block it.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
  },
  {
    title: "WebSocket Live Feed",
    description:
      "Real-time event stream delivered over WebSocket. Build custom dashboards, trigger external workflows, or simply watch your agent fleet operate in real time.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    title: "Custom Rule Builder",
    description:
      "Visual and YAML-based rule creation. Test rules against historical data before deploying. Associate rules with playbooks for full detection-to-response pipelines.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
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
      label: "Events",
      sublabel: "Agent telemetry stream",
      color: "border-foreground-subtle text-foreground-muted",
      bg: "bg-navy-800",
    },
    {
      label: "Detection",
      sublabel: "Sigma rules + baselines",
      color: "border-teal-500/40 text-teal-400",
      bg: "bg-teal-600/10",
    },
    {
      label: "Analysis",
      sublabel: "Risk scoring + correlation",
      color: "border-teal-500/40 text-teal-400",
      bg: "bg-teal-600/10",
    },
    {
      label: "Response",
      sublabel: "Playbooks + quarantine",
      color: "border-gold-500/40 text-gold-400",
      bg: "bg-gold-500/10",
    },
    {
      label: "Forward",
      sublabel: "SIEM + notifications",
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
                className={`flex flex-col items-center justify-center w-32 h-20 rounded-xl border ${step.color} ${step.bg} text-center px-2 transition-all duration-300 hover:scale-105`}
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
          transition={{ delay: 1.0, duration: 0.4 }}
          className="flex flex-col lg:flex-row items-center justify-center gap-6 pt-4 border-t border-border mt-4"
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-teal-600/30 border border-teal-500/40" />
            <span className="text-xs text-foreground-subtle">SoulWatch processing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gold-500/20 border border-gold-500/40" />
            <span className="text-xs text-foreground-subtle">Response layer</span>
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

export default function SoulWatchPage() {
  const featuresRef = useRef(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: "-60px" });

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 lg:py-32">
          <div className="absolute inset-0 bg-gradient-to-b from-gold-500/5 to-transparent" />
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
            <div className="max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex items-center gap-3 mb-6"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 px-3 py-1 text-xs font-medium text-gold-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold-400 pulse-glow" />
                  Now Available
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6"
              >
                <span className="text-gradient-gold">SoulWatch</span>
                <br />
                AI Runtime Security
                <br />
                Monitoring
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="text-xl text-foreground-muted leading-relaxed mb-4"
              >
                See what your agents are actually doing. Without seeing anything they handle.
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="text-foreground-muted leading-relaxed mb-8"
              >
                Your AI agents are running in production right now. Do you know what
                they&apos;re doing? SoulWatch gives you full behavioral visibility
                across your agent fleet - real-time anomaly detection, automated response
                playbooks, and compliance reporting. Zero-knowledge monitoring, done right.
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
                  Start Free Trial
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
                The problem: blind spots in agent operations
              </h2>
              <div className="space-y-4 text-foreground-muted leading-relaxed">
                <p>
                  You deployed 50 AI agents last quarter. They process customer data,
                  make API calls, and execute business logic autonomously. But you have
                  no idea what they&apos;re actually doing at runtime.
                </p>
                <p>
                  Traditional APM tools track latency and errors. They don&apos;t track
                  whether your agent just accessed data it shouldn&apos;t have. They
                  don&apos;t detect behavioral drift. They don&apos;t know that your
                  analytics agent is suddenly making admin-level API calls at 3 AM.
                </p>
                <p className="text-foreground font-medium">
                  SoulWatch does. And it does it without ever seeing your data.
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
                Ten capabilities for complete
                <br />
                <span className="text-gradient-gold">agent fleet visibility</span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground-muted">
                From real-time event streaming to automated incident response.
                Everything your SOC needs to monitor AI agents at scale.
              </p>
            </motion.div>

            <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  className="glass-card rounded-xl p-6 border-l-4 border-l-gold-500 hover:border-gold-500/30 transition-all group card-hover-lift"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-400 group-hover:bg-gold-500/20 transition-colors">
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
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                How SoulWatch works
              </h2>
              <p className="text-foreground-muted">
                Every agent event flows through a five-stage pipeline from ingestion to response.
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
                Stream events, query anomalies, and manage rules - all through a clean REST API.
              </p>
            </motion.div>

            <div className="space-y-6">
              <TerminalBlock
                filename="stream_events.py"
                code={`import asyncio
import websockets
import json

async def watch_agents():
    uri = "wss://tiresias.saluca.com/watch/v1/stream"
    headers = {"Authorization": "Bearer sk_watch_live_..."}

    async with websockets.connect(uri, extra_headers=headers) as ws:
        async for message in ws:
            event = json.loads(message)
            if event["risk_score"] > 80:
                print(f"HIGH RISK: {event['agent_persona']}")
                print(f"  Action: {event['action']}")
                print(f"  Score: {event['risk_score']}/100")

asyncio.run(watch_agents())`}
              />

              <TerminalBlock
                filename="query_anomalies.sh"
                code={`# Get open anomalies for the last 24 hours
curl -s https://tiresias.saluca.com/watch/v1/anomalies \\
  -H "Authorization: Bearer sk_watch_live_..." \\
  -d '{"status": "open", "hours": 24}' | jq

# Response:
# {
#   "anomalies": [
#     {
#       "id": "anom_8f2c...",
#       "type": "behavioral_drift",
#       "agent": "analytics-agent",
#       "risk_score": 87,
#       "description": "Admin API calls outside business hours",
#       "detected_at": "2026-03-18T03:14:22Z"
#     }
#   ],
#   "total": 1
# }`}
              />

              <TerminalBlock
                filename="sigma_rule.yaml"
                code={`# Custom Sigma rule for SoulWatch
title: Suspicious Admin API Access
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
level: high
description: >
  Detects agents making admin-level API calls
  outside of configured business hours.
detection:
  selection:
    event_type: EVALUATE
    action: admin.*
  condition: selection
  time_filter:
    hours: "22:00-06:00"
  group_by: agent_soulkey
falsepositives:
  - Scheduled maintenance agents
tags:
  - soulwatch.temporal_anomaly
  - soulwatch.privilege_escalation`}
              />
            </div>
          </div>
        </section>

        {/* Pairs with SoulAuth */}
        <section className="py-16 lg:py-24 bg-navy-900/30">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Pairs with <span className="text-gradient-teal">SoulAuth</span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground-muted leading-relaxed">
                SoulAuth tells you who an agent is and what it&apos;s allowed to do.
                SoulWatch tells you what it&apos;s actually doing. Together, they close
                the loop between authorization and accountability.
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
                  <h3 className="font-semibold text-teal-400">SoulAuth provides</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Agent identity via Soulkeys",
                    "Policy-based authorization decisions",
                    "Capability token issuance",
                    "Audit events for every decision",
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
                  <div className="w-8 h-8 rounded-lg bg-gold-500/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gold-400">SoulWatch adds</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Real-time behavioral visibility",
                    "Anomaly detection + risk scoring",
                    "Automated quarantine + response",
                    "SIEM forwarding + compliance reports",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-foreground-muted">
                      <svg className="w-4 h-4 mt-0.5 shrink-0 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                SoulWatch is included with SoulAuth Pro plans at no additional cost.
                Standalone pricing for teams using third-party authorization is coming soon.
              </p>
              <div className="glass-card rounded-xl p-8 inline-block">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-foreground">Included with SoulAuth Pro</p>
                    <p className="text-sm text-foreground-muted">Full SoulWatch access, no extra charge</p>
                  </div>
                </div>
                <ul className="text-left space-y-2 mb-6">
                  {[
                    "All 10 monitoring capabilities",
                    "Unlimited Sigma rules",
                    "5 SIEM destinations included",
                    "WebSocket live feed",
                    "Compliance report export",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-foreground-muted">
                      <svg className="w-4 h-4 text-gold-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                Monitor your agents today
              </h2>
              <p className="text-foreground-muted mb-8 leading-relaxed">
                SoulWatch is production-ready and included with every SoulAuth Pro trial.
                Start monitoring your agent fleet in minutes - no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  href="/trial"
                  className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 cta-breathe"
                >
                  Start Free Trial
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
