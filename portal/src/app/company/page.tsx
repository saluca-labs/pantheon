import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Company - Tiresias",
  description:
    "Tiresias was founded to answer a critical question: who are your AI agents, and what are they allowed to do? Built by Saluca LLC.",
};

const values = [
  {
    title: "Privacy by Architecture",
    description:
      "We don't just promise privacy - our architecture makes data access impossible. Zero-knowledge design means we never see, store, or process your data.",
    icon: (
      <svg
        className="h-6 w-6 text-gold-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
  {
    title: "Zero Trust, Zero Exceptions",
    description:
      "Every agent, every action, every time. No implicit trust, no shortcuts, no exceptions. Trust is earned through cryptographic proof, not configuration.",
    icon: (
      <svg
        className="h-6 w-6 text-teal-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </svg>
    ),
  },
  {
    title: "Open Standards",
    description:
      "Policy-as-code, Sigma rules, standard protocols - no vendor lock-in. Your security policies are portable, auditable, and version-controlled.",
    icon: (
      <svg
        className="h-6 w-6 text-gold-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
        />
      </svg>
    ),
  },
  {
    title: "Founder-Led",
    description:
      "Backed by 29 USPTO provisional patents and deep conviction. Tiresias is built with a long-term vision, not quarterly targets.",
    icon: (
      <svg
        className="h-6 w-6 text-teal-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
  },
];

export default function CompanyPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 text-center pt-12 pb-20">
          <div className="mx-auto w-32 h-32 rounded-2xl overflow-hidden border border-border-accent/30 shadow-xl shadow-gold-500/10 mb-8">
            <img src="/tiresias-icon.png" alt="Tiresias" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            Built by engineers who saw{" "}
            <span className="text-gradient-gold">the blind spot</span>
          </h1>
        </section>

        {/* Founding Story */}
        <section className="mx-auto max-w-4xl px-6 lg:px-8 pb-24">
          <div className="glass-card rounded-2xl p-8 sm:p-12 space-y-6">
            <h2 className="text-2xl font-bold text-gradient-teal">
              The Origin Story
            </h2>
            <p className="text-foreground-muted leading-relaxed text-lg">
              In a world racing to deploy AI agents, nobody was asking: who are
              these agents, and what are they allowed to do?
            </p>
            <p className="text-foreground-muted leading-relaxed text-lg">
              Tiresias was founded by Cristian, head of Saluca Labs, to answer that question
              - with cryptographic proof, not promises.
            </p>
            <p className="text-foreground-muted leading-relaxed text-lg">
              Named after the blind prophet of Greek mythology who could see
              truths hidden from the gods, Tiresias embodies our core belief:{" "}
              <span className="text-foreground font-medium">
                you can protect what you cannot see.
              </span>
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24 text-center">
          <h2 className="text-sm font-semibold text-gold-500 uppercase tracking-wider mb-4">
            Our Mission
          </h2>
          <p className="text-2xl sm:text-3xl font-bold max-w-3xl mx-auto leading-snug">
            To make AI agent security{" "}
            <span className="text-gradient-teal">invisible</span>,{" "}
            <span className="text-gradient-teal">automatic</span>, and{" "}
            <span className="text-gradient-teal">absolute</span> - without
            ever compromising privacy.
          </p>
        </section>

        {/* Values */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
          <h2 className="text-3xl font-bold text-center mb-12">What We Believe</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {values.map((value) => (
              <div key={value.title} className="glass-card rounded-xl p-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-800">
                    {value.icon}
                  </div>
                  <h3 className="text-lg font-semibold">{value.title}</h3>
                </div>
                <p className="text-foreground-muted leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
          <h2 className="text-3xl font-bold text-center mb-12">Leadership</h2>
          <div className="max-w-xl mx-auto">
            <div className="glass-card rounded-2xl p-8 text-center">
              <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-gradient-to-br from-gold-500 to-gold-600 mb-6">
                <span className="text-2xl font-bold text-navy-950">C</span>
              </div>
              <h3 className="text-xl font-bold">Cristian</h3>
              <p className="text-gold-500 text-sm font-medium mt-1">
                Head of Saluca Labs
              </p>
              <p className="text-foreground-muted mt-4 leading-relaxed max-w-md mx-auto">
                Engineer and entrepreneur with deep expertise in AI
                infrastructure, distributed systems, and enterprise security.
                Founded Saluca LLC to build the security layer the AI agent
                ecosystem was missing - one rooted in cryptographic proof and
                zero-knowledge architecture.
              </p>
            </div>
          </div>
        </section>

        {/* Patents */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24 text-center">
          <div className="glass-card rounded-2xl p-12 glow-teal">
            <h2 className="text-sm font-semibold text-teal-500 uppercase tracking-wider mb-4">
              Intellectual Property
            </h2>
            <p className="text-4xl font-bold mb-2">29</p>
            <p className="text-lg text-foreground-muted mb-2">
              USPTO Provisional Patents
            </p>
            <p className="text-sm text-foreground-subtle max-w-lg mx-auto">
              Our technology is backed by a comprehensive patent portfolio
              covering zero-knowledge agent identity, policy-as-code
              enforcement, runtime anomaly detection, and cryptographic
              capability delegation.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="mx-auto max-w-7xl px-6 lg:px-8 pb-8">
          <div className="glass-card rounded-2xl p-12 text-center glow-gold">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Get in Touch
            </h2>
            <p className="text-foreground-muted mb-8 max-w-xl mx-auto">
              Whether you&apos;re evaluating agent security, exploring enterprise
              deployment, or want to learn more about Tiresias - we&apos;d love
              to hear from you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Link
                href="/trial"
                className="rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3 text-sm font-medium text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
              >
                Join Beta Waitlist
              </Link>
              <Link
                href="mailto:contact@saluca.com?subject=Enterprise%20Inquiry"
                className="rounded-lg border border-border px-8 py-3 text-sm font-medium text-foreground hover:border-border-hover hover:bg-navy-800/50 transition-all"
              >
                Talk to Sales
              </Link>
            </div>
            <p className="text-sm text-foreground-subtle">
              <a
                href="mailto:contact@saluca.com"
                className="text-foreground-muted hover:text-foreground transition-colors underline underline-offset-4"
              >
                contact@saluca.com
              </a>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
