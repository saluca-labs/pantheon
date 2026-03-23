import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/** Use-case showcase targeting enterprise buyers with problem/solution framing. */

const useCases = [
  {
    title: "Secure Multi-Agent Systems",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.514a4.5 4.5 0 00-6.364-6.364L4.5 8.257" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a4.5 4.5 0 018.484 2.854" />
      </svg>
    ),
    iconColor: "text-teal-400",
    iconBg: "bg-teal-600/15",
    borderColor: "border-teal-500/30",
    problem:
      "Your agents talk to each other, to APIs, and to data stores. Who authorized that?",
    solution:
      "SoulAuth gives every agent a cryptographic identity and evaluates every request in real-time. No implicit trust, no blanket permissions - every interaction is verified against your policies before it executes.",
    benefits: [
      "Agent-to-agent trust with cryptographic verification",
      "Granular, attribute-based permissions",
      "Full audit trail of every interaction",
    ],
    audience: ["AI platform teams", "MLOps engineers"],
  },
  {
    title: "AI Compliance & Governance",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    iconColor: "text-gold-400",
    iconBg: "bg-gold-500/15",
    borderColor: "border-gold-500/30",
    problem:
      "Regulators are asking about your AI agents' access patterns. Can you answer?",
    solution:
      "Immutable audit trails, policy-as-code, and compliance-ready reporting. Every policy change is versioned. Every decision is logged. Every access pattern is queryable.",
    benefits: [
      "Architecture designed for data protection by design",
      "Auditor-friendly logs with tamper-evident integrity",
      "Full policy version history with rollback",
    ],
    audience: [
      "CISOs",
      "Compliance officers",
      "Regulated industries (finance, healthcare)",
    ],
  },
  {
    title: "Zero-Trust Agent-to-Agent Communication",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    iconColor: "text-teal-400",
    iconBg: "bg-teal-600/15",
    borderColor: "border-teal-500/30",
    problem:
      "Traditional perimeter security doesn't work when agents are the perimeter.",
    solution:
      "Every agent interaction requires a capability token. No standing permissions. No implicit trust. Tokens are scoped, time-limited, and cryptographically bound to the requesting agent's identity.",
    benefits: [
      "Eliminate lateral movement between agents",
      "Detect anomalous behavior in real-time",
      "Automated quarantine of compromised agents",
    ],
    audience: ["Security teams", "SOC analysts", "Infrastructure engineers"],
  },
];

export default function UseCasesPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        {/* Hero */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center mb-20">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            <span className="text-gradient-gold">How teams use Tiresias</span>
          </h1>
          <p className="text-xl text-foreground-muted max-w-2xl mx-auto">
            From startup AI assistants to enterprise agent fleets &mdash; secure every interaction, satisfy every auditor.
          </p>
        </div>

        {/* Use Case Cards */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 space-y-16">
          {useCases.map((uc, index) => (
            <div
              key={uc.title}
              className={`glass-card rounded-2xl p-8 md:p-10 border-l-2 ${uc.borderColor} hover:border-border-hover transition-colors`}
            >
              <div className="grid md:grid-cols-[1fr_1fr] gap-10">
                {/* Left: Problem + Solution */}
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${uc.iconBg}`}>
                      <span className={uc.iconColor}>{uc.icon}</span>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-foreground-subtle uppercase tracking-wider">
                        Use Case {index + 1}
                      </span>
                      <h2 className="text-2xl font-bold text-foreground">
                        {uc.title}
                      </h2>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground-subtle uppercase tracking-wider mb-2">
                        The Problem
                      </h3>
                      <p className="text-lg text-foreground-muted leading-relaxed">
                        &ldquo;{uc.problem}&rdquo;
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-foreground-subtle uppercase tracking-wider mb-2">
                        The Solution
                      </h3>
                      <p className="text-foreground-muted leading-relaxed">
                        {uc.solution}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right: Benefits + Audience */}
                <div className="flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground-subtle uppercase tracking-wider mb-4">
                      Key Benefits
                    </h3>
                    <ul className="space-y-3">
                      {uc.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-start gap-3">
                          <svg
                            className={`h-5 w-5 mt-0.5 flex-shrink-0 ${uc.iconColor}`}
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
                          <span className="text-foreground-muted">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-foreground-subtle uppercase tracking-wider mb-3">
                      Built For
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {uc.audience.map((role) => (
                        <span
                          key={role}
                          className="text-xs font-medium px-3 py-1.5 rounded-full bg-navy-800 text-foreground-muted border border-border"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-24 text-center">
          <div className="glass-card rounded-2xl p-12 glow-gold">
            <h2 className="text-3xl font-bold mb-4">
              <span className="text-gradient-gold">See it in action</span>
            </h2>
            <p className="text-foreground-muted text-lg mb-8 max-w-xl mx-auto">
              Join the beta waitlist. Be among the first to secure your AI agents.
            </p>
            <Link
              href="/trial"
              className="inline-block rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-8 py-3.5 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
            >
              Join Beta Waitlist
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
