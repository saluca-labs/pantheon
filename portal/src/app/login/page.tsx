"use client";

import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/** Private-beta login gate -- SoulKey entry point for authenticated access. */

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16 flex items-center justify-center">
        <section className="relative w-full max-w-md mx-auto px-6 py-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.06),transparent_60%)]" />

          <div className="relative glass-card rounded-2xl p-8 sm:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gold-500/10 mb-4">
                <svg
                  className="w-7 h-7 text-gold-400"
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
              </div>
              <h1 className="text-2xl font-bold">Tiresias is in private beta</h1>
              <p className="text-sm text-foreground-muted mt-3 leading-relaxed">
                Access to the Tiresias portal is currently limited to invited beta participants.
                If you&apos;ve received an invite, check your email for login instructions.
              </p>
            </div>

            {/* Beta info */}
            <div className="rounded-xl bg-navy-950 border border-border p-5 mb-6">
              <div className="space-y-3 text-sm text-foreground-muted">
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Beta invites include personalized onboarding</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Full platform access &mdash; SoulAuth, SoulWatch, SoulGate</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Direct line to the engineering team</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link
              href="/trial"
              className="block w-full text-center rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-6 py-3.5 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20"
            >
              Join Beta Waitlist
            </Link>

            {/* Footer links */}
            <div className="mt-8 pt-6 border-t border-border text-center space-y-3">
              <p className="text-xs text-foreground-subtle">
                <Link
                  href="/developers"
                  className="hover:text-foreground-muted transition-colors"
                >
                  Developer Docs
                </Link>
                {" | "}
                <a
                  href="mailto:support@saluca.com"
                  className="hover:text-foreground-muted transition-colors"
                >
                  Need help?
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
