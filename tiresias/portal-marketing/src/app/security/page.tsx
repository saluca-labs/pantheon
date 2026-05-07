import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {

/** Security practices and compliance information page (Trust Center). */
  title: "Security & Trust Center - Tiresias",
  description:
    "Our security posture, compliance roadmap, architecture overview, and responsible disclosure policy. Trust, verified.",
};

const architectureItems = [
  {
    label: "Zero-Knowledge Design",
    description:
      "We never access, store, or process your data. Policy decisions happen locally or in isolated tenant environments. Tiresias sees threats - never data.",
    icon: (
      <svg className="h-6 w-6 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      </svg>
    ),
  },
  {
    label: "Encryption",
    description:
      "TLS 1.3 for all data in transit. AES-256 encryption for all data at rest. No exceptions, no fallbacks.",
    icon: (
      <svg className="h-6 w-6 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    label: "Authentication",
    description:
      "ES256 JWT capability tokens with short-lived expiry, cryptographic signature verification, and automatic key rotation.",
    icon: (
      <svg className="h-6 w-6 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    label: "Infrastructure Isolation",
    description:
      "Isolated tenant environments with row-level security. Each tenant operates in a cryptographically separated context with no cross-tenant data access.",
    icon: (
      <svg className="h-6 w-6 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
];

const complianceTimeline = [
  {
    label: "GDPR Compliance",
    subtitle: "Privacy policies, DPA, and data processing agreements in place — not a third-party certification",
    status: "Implemented",
    statusColor: "text-of-primary bg-of-primary/10",
    year: "",
  },
  {
    label: "SOC 2 Type I",
    subtitle: "Security & Availability — targeted Q3 2026",
    status: "In Progress",
    statusColor: "text-of-primary bg-of-primary/10",
    year: "",
  },
  {
    label: "SOC 2 Type II",
    subtitle: "Sustained Compliance — targeted Q1 2027",
    status: "Planned",
    statusColor: "text-of-outline bg-of-surface-container/50",
    year: "",
  },
  {
    label: "ISO 27001",
    subtitle: "Information Security Management — targeted Q3 2026",
    status: "Planned",
    statusColor: "text-of-outline bg-of-surface-container/50",
    year: "",
  },
];

const securityPractices = [
  {
    title: "Immutable Audit Logging",
    description:
      "Every policy decision, token issuance, and agent action is logged to an append-only audit trail. Logs cannot be modified or deleted - even by us.",
  },
  {
    title: "Automated Anomaly Detection",
    description:
      "Behavioral analysis powered by Sigma detection rules continuously monitors agent activity for deviations from established baselines.",
  },
  {
    title: "Policy-as-Code",
    description:
      "All security policies are version-controlled, auditable, and deployed through CI/CD. No manual configuration, no drift, no surprises.",
  },
  {
    title: "Least Privilege at Every Layer",
    description:
      "The principle of least privilege is enforced at every layer - from agent tokens to infrastructure access to internal operations.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 text-center pt-12 pb-20">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            Trust, <span className="text-of-primary">Verified</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-of-on-surface-variant max-w-2xl mx-auto">
            A security company that doesn&apos;t publish its own security
            posture isn&apos;t one.
          </p>
        </section>

        {/* Architecture Overview */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
          <h2 className="text-sm font-semibold text-of-primary uppercase tracking-wider mb-2 text-center">
            Architecture
          </h2>
          <h3 className="text-3xl font-bold text-center mb-12">
            Security by Design
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            {architectureItems.map((item) => (
              <div key={item.label} className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-of-surface-container">
                    {item.icon}
                  </div>
                  <h4 className="text-lg font-semibold">{item.label}</h4>
                </div>
                <p className="text-of-on-surface-variant leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance Roadmap */}
        <section className="mx-auto max-w-4xl px-6 lg:px-8 pb-24">
          <h2 className="text-sm font-semibold text-of-primary uppercase tracking-wider mb-2 text-center">
            Compliance
          </h2>
          <h3 className="text-3xl font-bold text-center mb-4">
            Compliance Goals
          </h3>
          <p className="text-of-on-surface-variant text-center mb-12 max-w-2xl mx-auto">
            Our architecture is built with compliance in mind from day one. Formal certifications are on our roadmap as the platform matures.
          </p>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-border hidden sm:block" />
            <div className="space-y-6">
              {complianceTimeline.map((item, i) => (
                <div key={item.label} className="flex gap-6 items-start">
                  {/* Dot */}
                  <div className="relative z-10 hidden sm:flex h-12 w-12 flex-shrink-0 items-center justify-center">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        i === 0
                          ? "bg-of-primary ring-4 ring-of-primary/20"
                          : "bg-of-surface-container ring-4 ring-of-surface-container"
                      }`}
                    />
                  </div>
                  <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6 flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <h4 className="font-semibold">{item.label}</h4>
                      <span
                        className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${item.statusColor}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm text-of-on-surface-variant">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security Practices */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
          <h2 className="text-sm font-semibold text-of-primary uppercase tracking-wider mb-2 text-center">
            Practices
          </h2>
          <h3 className="text-3xl font-bold text-center mb-12">
            How We Operate
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            {securityPractices.map((practice) => (
              <div key={practice.title} className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-8">
                <h4 className="font-semibold mb-3">{practice.title}</h4>
                <p className="text-sm text-of-on-surface-variant leading-relaxed">
                  {practice.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Data Processing */}
        <section className="mx-auto max-w-4xl px-6 lg:px-8 pb-24">
          <h2 className="text-sm font-semibold text-of-primary uppercase tracking-wider mb-2 text-center">
            Data Governance
          </h2>
          <h3 className="text-3xl font-bold text-center mb-12">
            Data Processing
          </h3>
          <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 sm:p-12">
            <div className="grid sm:grid-cols-2 gap-8">
              <div>
                <h4 className="font-semibold mb-2">Data Processing Agreement</h4>
                <p className="text-sm text-of-on-surface-variant leading-relaxed">
                  Enterprise customers receive a comprehensive DPA covering
                  GDPR, CCPA, and other applicable privacy frameworks.
                  Available upon request for evaluation.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Data Residency</h4>
                <p className="text-sm text-of-on-surface-variant leading-relaxed">
                  Customer-controlled data residency. Choose where your
                  policy evaluations and audit logs reside. On-premise
                  deployment available on Enterprise plans and above.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Sub-processors</h4>
                <p className="text-sm text-of-on-surface-variant leading-relaxed">
                  We maintain a minimal sub-processor list, published and
                  versioned. Each sub-processor is documented with its
                  purpose and data scope. Customers are notified of changes.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Data Retention</h4>
                <p className="text-sm text-of-on-surface-variant leading-relaxed">
                  Configurable per tenant. Set retention policies for audit
                  logs, token history, and policy evaluation records. Default
                  retention aligns with industry best practices.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Responsible Disclosure */}
        <section
          id="disclosure"
          className="mx-auto max-w-4xl px-6 lg:px-8 pb-24"
        >
          <h2 className="text-sm font-semibold text-of-primary uppercase tracking-wider mb-2 text-center">
            Vulnerability Reporting
          </h2>
          <h3 className="text-3xl font-bold text-center mb-12">
            Responsible Disclosure
          </h3>
          <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 sm:p-12 shadow-[0_0_20px_rgba(90,218,206,0.15)]">
            <p className="text-of-on-surface-variant leading-relaxed mb-6">
              We take security reports seriously and respond within 24 hours.
              If you believe you have discovered a vulnerability in Tiresias,
              we encourage you to report it responsibly.
            </p>
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <svg
                  className="h-5 w-5 text-of-primary flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm text-of-on-surface-variant">
                  Email your findings to{" "}
                  <a
                    href="mailto:security@saluca.com"
                    className="text-of-primary hover:text-of-primary transition-colors font-medium"
                  >
                    security@saluca.com
                  </a>
                </span>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="h-5 w-5 text-of-primary flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm text-of-on-surface-variant">
                  Include detailed reproduction steps and potential impact assessment
                </span>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="h-5 w-5 text-of-primary flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm text-of-on-surface-variant">
                  Allow reasonable time for remediation before public disclosure
                </span>
              </div>
              <div className="flex items-start gap-3">
                <svg
                  className="h-5 w-5 text-of-primary flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm text-of-on-surface-variant">
                  Do not access or modify data belonging to other users or tenants
                </span>
              </div>
            </div>
            <p className="text-sm text-of-outline">
              We commit to acknowledging reports within 24 hours and providing
              a detailed response within 72 hours. We will not pursue legal
              action against researchers who follow these guidelines.
            </p>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 text-center pb-8">
          <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Questions about our security posture?
            </h2>
            <p className="text-of-on-surface-variant mb-8 max-w-xl mx-auto">
              We&apos;re happy to discuss our architecture, compliance plans, or
              share additional documentation under NDA.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="mailto:security@saluca.com?subject=Security%20Inquiry"
                className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-8 py-3 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all shadow-lg shadow-of-primary/20"
              >
                Contact Security Team
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-of-outline-variant/15 px-8 py-3 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover hover:bg-of-surface-container/50 transition-all"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
