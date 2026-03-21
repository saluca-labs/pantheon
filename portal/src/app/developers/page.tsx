"use client";

import Link from "next/link";
import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const quickstartTabs = [
  {
    label: "pip install",
    code: `pip install soulauth
soulauth init
soulauth dev  # starts local server with SQLite`,
  },
  {
    label: "Docker",
    code: `docker run -p 8000:8000 saluca/soulauth:latest`,
  },
  {
    label: "API",
    code: `curl -X POST https://api.tiresias.network/v1/auth/evaluate \\
  -H "X-Soulkey: sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"action": "read", "resource": "customer-data"}'`,
  },
];

const sdkCode = `from soulauth import SoulAuthClient

client = SoulAuthClient(soulkey="sk_live_...")

# Get agent identity
identity = client.whoami()

# Authorize an action
token = client.authorize(action="read", resource="data")

# Check authorization inline
if client.can("write", "config"):
    update_config()`;

const apiEndpoints = [
  {
    category: "Identity",
    color: "teal",
    endpoints: ["/v1/auth/identity", "/v1/auth/whoami"],
  },
  {
    category: "Authorization",
    color: "gold",
    endpoints: ["/v1/auth/evaluate"],
  },
  {
    category: "Admin",
    color: "teal",
    endpoints: ["/v1/soulauth/admin/tenants", "/v1/soulauth/admin/keys", "/v1/soulauth/admin/policy"],
  },
  {
    category: "Trial",
    color: "gold",
    endpoints: ["/v1/trial/register", "/v1/trial/verify"],
  },
  {
    category: "Analytics",
    color: "teal",
    endpoints: ["/v1/analytics/anomalies", "/v1/analytics/baseline", "/v1/analytics/dashboard"],
  },
  {
    category: "Detection",
    color: "gold",
    endpoints: ["/v1/detection/rules", "/v1/detection/playbooks", "/v1/detection/matches"],
  },
  {
    category: "Enforcement",
    color: "teal",
    endpoints: ["/v1/enforcement/quarantine"],
  },
];

const cliCommands = [
  { cmd: "soulauth init", desc: "Initialize a new SoulAuth project" },
  { cmd: "soulauth dev", desc: "Start local dev server with SQLite" },
  { cmd: "soulauth playground", desc: "Interactive policy playground" },
  { cmd: "soulauth key issue", desc: "Issue a new SoulKey" },
  { cmd: "soulauth key list", desc: "List all active keys" },
  { cmd: "soulauth key rotate", desc: "Rotate an existing key" },
  { cmd: "soulauth key suspend", desc: "Temporarily suspend a key" },
  { cmd: "soulauth key revoke", desc: "Permanently revoke a key" },
  { cmd: "soulauth policy validate", desc: "Validate policy files" },
  { cmd: "soulauth policy sync", desc: "Sync policies from Git" },
  { cmd: "soulauth status", desc: "Check system health" },
  { cmd: "soulauth version", desc: "Print version info" },
];

const integrationGuides = [
  {
    title: "Python SDK",
    desc: "Full-featured client library with async support and type hints.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    title: "REST API",
    desc: "Direct HTTP integration for any language or framework.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: "Docker / Kubernetes",
    desc: "Container-ready deployment with Helm charts and K8s manifests.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="8" height="8" rx="1" />
        <rect x="14" y="2" width="8" height="8" rx="1" />
        <rect x="2" y="14" width="8" height="8" rx="1" />
        <rect x="14" y="14" width="8" height="8" rx="1" />
      </svg>
    ),
  },
  {
    title: "CI/CD (GitHub Actions)",
    desc: "Automate policy validation and key rotation in your pipeline.",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
  },
];

function CodeBlock({ code }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-navy-950 border border-border rounded-xl p-5 overflow-x-auto text-sm font-mono leading-relaxed text-foreground-muted">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 px-3 py-1.5 text-xs rounded-lg bg-navy-800 text-foreground-muted hover:text-foreground border border-border hover:border-border-hover transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export default function DevelopersPage() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,212,191,0.08),transparent_60%)]" />
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-24 lg:py-32">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-600/10 border border-teal-500/20 px-4 py-1.5 text-sm text-teal-400 mb-6">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Developer Hub
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
                Build secure AI agents{" "}
                <span className="text-gradient-teal">in minutes</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-foreground-muted leading-relaxed max-w-2xl">
                SDKs, APIs, and documentation to integrate SoulAuth into your agent infrastructure.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/trial"
                  className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-6 py-3 text-sm font-medium text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
                >
                  Get API Key
                </Link>
                <a
                  href="https://api.tiresias.network/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-border-hover transition-colors"
                >
                  Full API Docs
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Quickstart */}
        <section id="quickstart" className="mx-auto max-w-7xl px-6 lg:px-8 py-20">
          <h2 className="text-3xl font-bold tracking-tight mb-2">Quickstart</h2>
          <p className="text-foreground-muted mb-10">Get up and running in under 60 seconds.</p>

          {/* Tabs */}
          <div className="flex border-b border-border mb-0">
            {quickstartTabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === i
                    ? "border-teal-500 text-teal-400"
                    : "border-transparent text-foreground-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-6">
            <CodeBlock code={quickstartTabs[activeTab].code} language="bash" />
          </div>
        </section>

        {/* SDK Reference */}
        <section id="sdk" className="bg-navy-900/50">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 py-20">
            <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">
              <div className="lg:w-2/5 lg:sticky lg:top-24">
                <h2 className="text-3xl font-bold tracking-tight mb-2">Python SDK</h2>
                <p className="text-foreground-muted mb-6 leading-relaxed">
                  Type-safe, async-ready client with built-in caching and automatic key rotation.
                </p>
                <ul className="space-y-3 text-sm text-foreground-muted">
                  <li className="flex items-center gap-2">
                    <span className="text-teal-400">&#10003;</span> Full type hints and IDE autocomplete
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-teal-400">&#10003;</span> Async/await support
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-teal-400">&#10003;</span> Automatic retry with exponential backoff
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-teal-400">&#10003;</span> Built-in response caching
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-teal-400">&#10003;</span> Zero external dependencies
                  </li>
                </ul>
              </div>
              <div className="lg:w-3/5 w-full">
                <CodeBlock code={sdkCode} language="python" />
              </div>
            </div>
          </div>
        </section>

        {/* API Endpoints */}
        <section id="api" className="mx-auto max-w-7xl px-6 lg:px-8 py-20">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">API Endpoints</h2>
              <p className="text-foreground-muted">35+ endpoints across 7 domains. RESTful, JSON-native, SoulKey-authenticated.</p>
            </div>
            <a
              href="https://api.tiresias.network/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 shrink-0"
            >
              Interactive docs
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M17 7H7M17 7v10" />
              </svg>
            </a>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {apiEndpoints.map((group) => (
              <div key={group.category} className="glass-card rounded-xl p-5">
                <h3
                  className={`text-sm font-semibold mb-3 ${
                    group.color === "gold" ? "text-gold-400" : "text-teal-400"
                  }`}
                >
                  {group.category}
                </h3>
                <ul className="space-y-2">
                  {group.endpoints.map((ep) => (
                    <li key={ep} className="text-sm font-mono text-foreground-muted">
                      {ep}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* CLI */}
        <section id="cli" className="bg-navy-900/50">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 py-20">
            <h2 className="text-3xl font-bold tracking-tight mb-2">CLI Reference</h2>
            <p className="text-foreground-muted mb-10">12 commands to manage your entire SoulAuth lifecycle from the terminal.</p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cliCommands.map((item) => (
                <div
                  key={item.cmd}
                  className="flex items-start gap-3 rounded-xl border border-border bg-navy-950/50 p-4 hover:border-border-hover transition-colors"
                >
                  <span className="text-teal-500 mt-0.5 shrink-0 font-mono text-xs">$</span>
                  <div>
                    <p className="text-sm font-mono font-medium text-foreground">{item.cmd}</p>
                    <p className="text-xs text-foreground-muted mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integration Guides */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 py-20">
          <h2 className="text-3xl font-bold tracking-tight mb-2">Integration Guides</h2>
          <p className="text-foreground-muted mb-10">Step-by-step guides for your stack.</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {integrationGuides.map((guide) => (
              <div
                key={guide.title}
                className="glass-card rounded-xl p-6 hover:border-teal-500/30 transition-all group cursor-pointer"
              >
                <div className="text-teal-400 mb-4 group-hover:text-teal-300 transition-colors">
                  {guide.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{guide.title}</h3>
                <p className="text-sm text-foreground-muted leading-relaxed">{guide.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-border bg-navy-900/30">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Ready to start building?</h2>
            <p className="text-foreground-muted mb-8 max-w-xl mx-auto">
              Get your API key in under a minute. 14-day Pro trial, no credit card required.
            </p>
            <Link
              href="/trial"
              className="inline-flex rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3.5 text-sm font-medium text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
            >
              Start Building
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
