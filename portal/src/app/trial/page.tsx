"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { config } from "@/lib/config";

/** Free trial signup — 14-day full Pro access, no credit card required. */

interface TrialResponse {
  trial_id?: string;
  message?: string;
  detail?: string;
}

const platformProducts = [
  {
    name: "SoulAuth",
    tagline: "Agent Identity & Zero-Trust Auth",
    color: "text-gold-400",
    borderColor: "border-gold-500/20",
    bgColor: "bg-gold-500/5",
    features: [
      "Up to 10 agent identities (soulkeys)",
      "Zero-trust policy evaluation (PDP/PEP)",
      "Capability tokens (JWT ES256, 5-15 min TTL)",
      "Key lifecycle - issue, rotate, suspend, revoke",
      "Policy-as-code with Git sync",
      "Delegation and escalation workflows",
      "Python SDK and CLI access",
    ],
  },
  {
    name: "SoulWatch",
    tagline: "AI Runtime Security Monitoring",
    color: "text-teal-400",
    borderColor: "border-teal-500/20",
    bgColor: "bg-teal-500/5",
    features: [
      "Anomaly detection (8 types, behavioral baselines)",
      "Sigma rule engine (7 built-in rules)",
      "Response playbooks with auto-quarantine",
      "Agent risk scoring (0-100 composite)",
      "Real-time WebSocket event feed",
      "Compliance-ready reporting",
      "SIEM forwarding (Splunk, Elastic, Syslog)",
    ],
  },
  {
    name: "SoulGate",
    tagline: "API Security Gateway",
    color: "text-amber-400",
    borderColor: "border-amber-500/20",
    bgColor: "bg-amber-500/5",
    features: [
      "Reverse proxy with 7-stage security pipeline",
      "Prompt injection detection (36 patterns)",
      "Rate limiting (sliding window, per-agent)",
      "Circuit breakers for downstream protection",
      "IP and geographic access controls",
      "API key management with rotation",
      "Full request audit logging",
    ],
  },
];

const trustSignals = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: "14-day free trial",
    desc: "Full Pro access for 14 days. No credit card required.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: "Full platform access",
    desc: "All three products, every endpoint, every feature. No limits.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Direct line to the team",
    desc: "Trial users get direct access to the engineering team for feedback.",
  },
];

export default function TrialPage() {
  const [formData, setFormData] = useState({
    contact_name: "",
    contact_email: "",
    company_name: "",
    company_domain: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<TrialResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const handleEmailChange = (email: string) => {
    setFormData((prev) => {
      const domain = email.includes("@") ? email.split("@")[1] : prev.company_domain;
      return { ...prev, contact_email: email, company_domain: domain || prev.company_domain };
    });
  };

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${config.apiUrl}/v1/trial/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          company_name: formData.company_name,
          company_domain: formData.company_domain || formData.contact_email.split("@")[1] || "",
        }),
      });

      if (res.status === 409) {
        throw new Error(
          "This email already has an active trial. Check your inbox for the verification email."
        );
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "60", 10);
        startCooldown(retryAfter);
        throw new Error(
          `Too many attempts. Please wait ${retryAfter} seconds before trying again.`
        );
      }

      const data: TrialResponse = await res.json();

      if (!res.ok) {
        const msg = data.detail || data.message || `Something went wrong (${res.status})`;
        throw new Error(msg);
      }

      setSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.08),transparent_60%)]" />
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-20 lg:py-28">
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/5 px-4 py-1.5 text-sm text-teal-400 mb-6">
                14-day free trial &mdash; no credit card required
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                Start your{" "}
                <span className="text-gradient-gold">free trial</span>
              </h1>
              <p className="mt-6 text-lg text-foreground-muted leading-relaxed max-w-2xl mx-auto">
                Get full Pro access to the Tiresias platform for 14 days &mdash;
                SoulAuth, SoulWatch, and SoulGate. No credit card. No commitment.
              </p>
            </div>
          </div>
        </section>

        {/* Form + sidebar */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-12">
          <div className="grid lg:grid-cols-5 gap-12 lg:gap-16">
            {/* Form */}
            <div className="lg:col-span-3">
              {success ? (
                <div className="glass-card rounded-2xl p-8 sm:p-10 glow-gold">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                      <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold">Check your email</h2>
                  </div>
                  <p className="text-foreground-muted mb-6 leading-relaxed">
                    We&apos;ve sent a verification link to <span className="text-foreground font-medium">{formData.contact_email}</span>.
                    Click the link to activate your 14-day trial. Your SoulKey and tenant will be provisioned automatically.
                  </p>
                  <div className="rounded-xl bg-navy-950 border border-border p-4 mb-6">
                    <p className="text-xs text-foreground-subtle uppercase tracking-wide mb-3">Your trial includes</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gold-400">SoulAuth</p>
                        <p className="text-xs text-foreground-subtle">Identity & Auth</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-teal-400">SoulWatch</p>
                        <p className="text-xs text-foreground-subtle">Monitoring</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-amber-400">SoulGate</p>
                        <p className="text-xs text-foreground-subtle">Gateway</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-foreground-subtle">
                    Didn&apos;t get the email? Check your spam folder or{" "}
                    <button
                      onClick={() => { setSuccess(null); setError(null); }}
                      className="text-gold-400 hover:underline"
                    >
                      try again
                    </button>.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 sm:p-10">
                  <h2 className="text-2xl font-bold mb-2">Start your free trial</h2>
                  <p className="text-sm text-foreground-muted mb-8">14 days of full Pro access. We&apos;ll send a verification email to get you started.</p>

                  {error && (
                    <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  <div className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="contact_name" className="block text-sm font-medium text-foreground-muted mb-2">
                          Full name
                        </label>
                        <input
                          id="contact_name"
                          name="contact_name"
                          type="text"
                          required
                          value={formData.contact_name}
                          onChange={handleChange}
                          placeholder="Jane Smith"
                          className="w-full rounded-lg bg-navy-950 border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="contact_email" className="block text-sm font-medium text-foreground-muted mb-2">
                          Work email
                        </label>
                        <input
                          id="contact_email"
                          name="contact_email"
                          type="email"
                          required
                          value={formData.contact_email}
                          onChange={(e) => handleEmailChange(e.target.value)}
                          placeholder="jane@company.com"
                          className="w-full rounded-lg bg-navy-950 border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="company_name" className="block text-sm font-medium text-foreground-muted mb-2">
                          Company name
                        </label>
                        <input
                          id="company_name"
                          name="company_name"
                          type="text"
                          required
                          value={formData.company_name}
                          onChange={handleChange}
                          placeholder="Your Company"
                          className="w-full rounded-lg bg-navy-950 border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="company_domain" className="block text-sm font-medium text-foreground-muted mb-2">
                          Company domain
                        </label>
                        <input
                          id="company_domain"
                          name="company_domain"
                          type="text"
                          required
                          value={formData.company_domain}
                          onChange={handleChange}
                          placeholder="example.com"
                          className="w-full rounded-lg bg-navy-950 border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || cooldown > 0}
                      className="w-full rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-6 py-3.5 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {cooldown > 0 ? (
                        `Please wait ${cooldown}s...`
                      ) : isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Starting trial...
                        </span>
                      ) : (
                        "Start Free Trial"
                      )}
                    </button>
                  </div>

                  <p className="mt-4 text-xs text-foreground-subtle text-center">
                    By signing up, you agree to our{" "}
                    <Link href="/legal#terms" className="text-foreground-muted hover:text-foreground underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/legal" className="text-foreground-muted hover:text-foreground underline">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card rounded-2xl p-6 sm:p-8">
                <h3 className="text-lg font-semibold mb-4">How it works</h3>
                <div className="space-y-4 text-sm text-foreground-muted leading-relaxed">
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-500/10 text-gold-400 flex items-center justify-center text-xs font-bold">1</span>
                    <p>Enter your work email and company details above.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-500/10 text-gold-400 flex items-center justify-center text-xs font-bold">2</span>
                    <p>Click the verification link in your email.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-500/10 text-gold-400 flex items-center justify-center text-xs font-bold">3</span>
                    <p>Your tenant and SoulKey are provisioned instantly. Start securing your agents.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Per-product feature breakdown */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">What&apos;s included in your trial</h2>
            <p className="mt-3 text-foreground-muted">Three products, one platform. Full Pro access for 14 days.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {platformProducts.map((product) => (
              <div
                key={product.name}
                className={`glass-card rounded-2xl p-6 sm:p-8 border ${product.borderColor}`}
              >
                <div className={`inline-flex items-center gap-2 rounded-lg ${product.bgColor} px-3 py-1.5 mb-4`}>
                  <span className={`text-sm font-bold ${product.color}`}>{product.name}</span>
                </div>
                <p className="text-sm text-foreground-muted mb-5">{product.tagline}</p>
                <ul className="space-y-2.5">
                  {product.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground-muted">
                      <svg className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${product.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 pt-4 border-t border-border">
                  <Link
                    href={`/platform/${product.name.toLowerCase()}`}
                    className={`text-sm font-medium ${product.color} hover:underline`}
                  >
                    Learn more about {product.name} &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust signals */}
        <section className="border-t border-border bg-navy-900/30">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
            <div className="grid sm:grid-cols-3 gap-8">
              {trustSignals.map((signal) => (
                <div key={signal.title} className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gold-500/10 text-gold-400 mb-4">
                    {signal.icon}
                  </div>
                  <h3 className="text-sm font-semibold mb-2">{signal.title}</h3>
                  <p className="text-sm text-foreground-muted">{signal.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
