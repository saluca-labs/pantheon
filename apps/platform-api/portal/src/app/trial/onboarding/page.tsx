"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { config } from "@/lib/config";

/** Trial onboarding wizard -- walks new users through SoulKey setup and SDK install. */

const steps = [
  {
    number: 1,
    title: "Copy your SoulKey",
    description:
      "Your SoulKey was shown on the verification page. If you saved it, paste it below to confirm. This key authenticates all your API requests.",
    hasInput: true,
  },
  {
    number: 2,
    title: "Install the SDK",
    description:
      "Install the Pantheon Python SDK to integrate agent authentication into your application.",
    code: `pip install tiresias-sdk`,
    language: "bash",
  },
  {
    number: 3,
    title: "Test your connection",
    description:
      "Verify your SoulKey works by calling the whoami endpoint. Replace YOUR_SOULKEY with your actual key.",
    code: `curl -s -H "X-SoulKey: YOUR_SOULKEY" \\
  ${config.apiUrl}/v1/auth/whoami | python3 -m json.tool`,
    language: "bash",
  },
  {
    number: 4,
    title: "Evaluate your first policy",
    description:
      "Run a policy evaluation to check if your agent can access a resource.",
    code: `curl -s -X POST ${config.apiUrl}/v1/auth/evaluate \\
  -H "X-SoulKey: YOUR_SOULKEY" \\
  -H "Content-Type: application/json" \\
  -d '{"resource": "memory", "action": "read", "scope": "*"}' \\
  | python3 -m json.tool`,
    language: "bash",
  },
  {
    number: 5,
    title: "Explore the dashboard",
    description:
      "Sign in to the Pantheon dashboard with your SoulKey to monitor your agents, view audit logs, and manage policies.",
    hasLink: true,
  },
];

export default function OnboardingPage() {
  const [soulkey, setSoulkey] = useState("");
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const copyCode = (code: string, stepNum: number) => {
    const finalCode = soulkey
      ? code.replace(/YOUR_SOULKEY/g, soulkey)
      : code;
    navigator.clipboard.writeText(finalCode);
    setCopiedStep(stepNum);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.08),transparent_60%)]" />
          <div className="relative mx-auto max-w-3xl px-6 lg:px-8 py-20 lg:py-24">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-4 py-1.5 text-sm text-green-400 mb-6">
                Trial activated successfully
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Get started with{" "}
                <span className="text-of-primary">Pantheon</span>
              </h1>
              <p className="mt-4 text-of-on-surface-variant leading-relaxed">
                Follow these steps to integrate Pantheon into your agent
                infrastructure. You will be up and running in under 5 minutes.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-6">
              {steps.map((step, i) => (
                <div
                  key={step.number}
                  className={`bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-6 sm:p-8 transition-all ${
                    i <= currentStep
                      ? "border-of-primary/20"
                      : "opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Step number */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        i < currentStep
                          ? "bg-green-500/20 text-green-400"
                          : i === currentStep
                            ? "bg-of-primary/20 text-of-primary"
                            : "bg-of-surface-container text-of-outline"
                      }`}
                    >
                      {i < currentStep ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step.number
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold mb-1">
                        {step.title}
                      </h3>
                      <p className="text-sm text-of-on-surface-variant mb-4">
                        {step.description}
                      </p>

                      {/* SoulKey input */}
                      {step.hasInput && (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={soulkey}
                            onChange={(e) => setSoulkey(e.target.value)}
                            placeholder="sk_live_..."
                            className="w-full rounded-lg bg-of-background border border-of-outline-variant/15 px-4 py-3 text-sm font-mono text-foreground placeholder:text-of-outline focus:outline-none focus:border-of-primary/50 focus:ring-1 focus:ring-of-primary/20 transition-colors"
                          />
                          <button
                            onClick={() => setCurrentStep(Math.max(currentStep, 1))}
                            disabled={!soulkey.trim()}
                            className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-5 py-2 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {soulkey.trim() ? "Continue" : "Paste your SoulKey to continue"}
                          </button>
                          <p className="text-xs text-of-outline">
                            Lost your key? Check the activation email or{" "}
                            <a
                              href={`mailto:${config.supportEmail}`}
                              className="text-of-primary hover:underline"
                            >
                              contact support
                            </a>
                            .
                          </p>
                        </div>
                      )}

                      {/* Code block */}
                      {step.code && (
                        <div className="relative">
                          <pre className="bg-of-background border border-of-outline-variant/15 rounded-xl p-4 text-sm font-mono text-of-primary overflow-x-auto leading-relaxed">
                            {soulkey
                              ? step.code.replace(/YOUR_SOULKEY/g, soulkey)
                              : step.code}
                          </pre>
                          <button
                            onClick={() => copyCode(step.code!, step.number)}
                            className="absolute top-3 right-3 text-xs text-of-outline hover:text-of-primary transition-colors px-2 py-1 rounded bg-of-surface-container/50"
                          >
                            {copiedStep === step.number ? "Copied!" : "Copy"}
                          </button>
                          {i === currentStep && (
                            <button
                              onClick={() =>
                                setCurrentStep(Math.max(currentStep, i + 1))
                              }
                              className="mt-3 text-sm text-of-primary hover:text-of-primary/70 transition-colors"
                            >
                              Done, next step &rarr;
                            </button>
                          )}
                        </div>
                      )}

                      {/* Dashboard link */}
                      {step.hasLink && (
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Link
                            href="/login"
                            className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-6 py-3 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all text-center"
                          >
                            Sign In to Dashboard
                          </Link>
                          <Link
                            href="/developers"
                            className="rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-of-on-surface-variant hover:text-foreground hover:border-of-outline-variant/15-hover transition-colors text-center"
                          >
                            Full Documentation
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Help section */}
            <div className="mt-12 text-center">
              <p className="text-sm text-of-outline">
                Need help? Email{" "}
                <a
                  href={`mailto:${config.supportEmail}`}
                  className="text-of-primary hover:underline"
                >
                  {config.supportEmail}
                </a>{" "}
                or check our{" "}
                <Link href="/developers" className="text-of-primary hover:underline">
                  developer documentation
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
