"use client";

/**
 * /trial — Community (free) tier signup
 *
 * Self-service registration for the Community tier.
 * No Stripe required. Calls POST /v1/trial/register via Resend.
 * Implements TRIAL-04.
 *
 * For paid plans (Starter/Pro/Enterprise), user is directed to /pricing.
 */

import { useState, FormEvent, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const COMMUNITY_FEATURES = [
  "Full observability dashboard",
  "PRH prompt risk scoring (read-only)",
  "18-type anomaly detection",
  "Self-hosted — your data stays on your infra",
  "Unlimited team seats",
  "25 agent identities",
  "7-day log retention",
  "Community support",
  "No credit card. No time limit.",
];

interface FormState {
  contact_name: string;
  contact_email: string;
  company_name: string;
  company_domain: string;
  use_case: string;
}

type PageStatus = "form" | "submitting" | "success" | "error";

function deriveDomain(email: string): string {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : "";
}

export default function TrialPage() {
  const [form, setForm] = useState<FormState>({
    contact_name: "",
    contact_email: "",
    company_name: "",
    company_domain: "",
    use_case: "",
  });
  const [status, setStatus] = useState<PageStatus>("form");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [domainLocked, setDomainLocked] = useState(false);

  const apiUrl =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL || ""
      : "";

  // Auto-derive company domain from email
  useEffect(() => {
    if (form.contact_email.includes("@")) {
      const derived = deriveDomain(form.contact_email);
      if (derived && !domainLocked) {
        setForm((prev) => ({ ...prev, company_domain: derived }));
      }
    }
  }, [form.contact_email, domainLocked]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "company_domain") setDomainLocked(true);
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch(`${apiUrl}/v1/trial/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: form.contact_name,
          contact_email: form.contact_email,
          company_name: form.company_name,
          company_domain: form.company_domain,
          use_case: form.use_case || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMessage(
          data.message ||
            "Verification email sent. Check your inbox to activate your account."
        );
        setStatus("success");
        return;
      }

      // Error handling — map status codes to user-friendly messages
      const detail = data.detail || "";
      if (res.status === 409) {
        setErrorMessage(
          `An account for ${form.company_domain} already exists. Check your email or contact support@saluca.com.`
        );
      } else if (res.status === 400 && detail.toLowerCase().includes("disposable")) {
        setErrorMessage(
          "Disposable email addresses are not allowed. Please use a work or personal email."
        );
      } else if (res.status === 429) {
        setErrorMessage(
          "Too many registration attempts from this address. Please try again in an hour."
        );
      } else {
        setErrorMessage(detail || "Registration failed. Please try again.");
      }

      setStatus("error");
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm text-teal-400 mb-5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Free forever. No credit card.
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              Get started with{" "}
              <span className="text-gradient-gold">Community</span>
            </h1>
            <p className="text-lg text-foreground-muted max-w-xl mx-auto">
              Full Tiresias observability dashboard, self-hosted, unlimited seats.
              Start in 60 seconds.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-10 items-start">
            {/* Left: Features */}
            <div>
              <div className="glass-card rounded-2xl p-7 mb-6">
                <h2 className="font-semibold mb-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
                  Community tier includes
                </h2>
                <ul className="space-y-3">
                  {COMMUNITY_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-foreground-muted">
                      <svg
                        className="h-4 w-4 flex-shrink-0 mt-0.5 text-teal-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Upgrade nudge */}
              <div className="glass-card rounded-xl p-5 border-gold-500/20">
                <p className="text-sm text-foreground-muted mb-3">
                  Need PRH enforcement, alerting, Sigma rules, or more agents?
                </p>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 text-sm font-medium text-gold-400 hover:text-gold-300 transition-colors"
                >
                  See paid plans starting at $49/mo
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Right: Form or success state */}
            <div className="glass-card rounded-2xl p-8">
              {status === "success" ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-teal-500/15 rounded-full flex items-center justify-center mx-auto mb-5">
                    <svg className="w-7 h-7 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold mb-2">Check your email</h2>
                  <p className="text-sm text-foreground-muted mb-1">{successMessage}</p>
                  <p className="text-sm text-foreground-subtle mt-4">
                    Sent to{" "}
                    <span className="text-foreground">{form.contact_email}</span>
                  </p>
                  <p className="text-xs text-foreground-subtle mt-5">
                    Didn&apos;t get it? Check spam or{" "}
                    <a
                      href="mailto:support@saluca.com?subject=Trial%20Verification%20Email"
                      className="text-teal-400 hover:text-teal-300 underline"
                    >
                      contact support
                    </a>
                    .
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">Create your account</h2>
                    <p className="text-sm text-foreground-muted">
                      Free forever. No credit card required.
                    </p>
                  </div>

                  {status === "error" && errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
                      {errorMessage}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1.5">
                        Your name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        name="contact_name"
                        value={form.contact_name}
                        onChange={handleChange}
                        required
                        placeholder="Jane Smith"
                        className="w-full bg-navy-800/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-500/50 placeholder:text-foreground-subtle"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1.5">
                        Work email <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        name="contact_email"
                        value={form.contact_email}
                        onChange={handleChange}
                        required
                        placeholder="jane@yourcompany.com"
                        className="w-full bg-navy-800/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-500/50 placeholder:text-foreground-subtle"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1.5">
                        Company name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        name="company_name"
                        value={form.company_name}
                        onChange={handleChange}
                        required
                        placeholder="Acme Corp"
                        className="w-full bg-navy-800/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-500/50 placeholder:text-foreground-subtle"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1.5">
                        Company domain <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        name="company_domain"
                        value={form.company_domain}
                        onChange={handleChange}
                        required
                        placeholder="yourcompany.com"
                        className="w-full bg-navy-800/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-500/50 placeholder:text-foreground-subtle"
                      />
                      <p className="text-xs text-foreground-subtle mt-1">
                        Auto-filled from your email. One account per domain.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1.5">
                        What will you use Tiresias for?{" "}
                        <span className="text-foreground-subtle">(optional)</span>
                      </label>
                      <textarea
                        name="use_case"
                        value={form.use_case}
                        onChange={handleChange}
                        rows={2}
                        placeholder="Monitoring AI agents in production, detecting prompt injection..."
                        className="w-full bg-navy-800/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-500/50 placeholder:text-foreground-subtle resize-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="w-full rounded-lg border border-teal-500/30 text-teal-400 hover:bg-teal-500/10 px-6 py-3 text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-wait"
                  >
                    {status === "submitting" ? "Creating account..." : "Get started free"}
                  </button>

                  <p className="text-xs text-center text-foreground-subtle">
                    By signing up you agree to our{" "}
                    <Link href="/legal/terms" className="text-foreground-muted hover:text-foreground underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/legal/privacy" className="text-foreground-muted hover:text-foreground underline">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
