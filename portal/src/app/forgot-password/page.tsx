"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Swallow — always show success to prevent enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16 flex items-center justify-center">
        <section className="relative w-full max-w-md mx-auto px-6 py-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.06),transparent_60%)]" />
          <div className="relative glass-card rounded-2xl p-8 sm:p-10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gold-500/10 mb-4">
                <svg className="w-7 h-7 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold">Reset your password</h1>
              <p className="text-sm text-foreground-muted mt-2">
                {submitted
                  ? "Check your email for a reset link"
                  : "Enter your email and we'll send you a reset link"}
              </p>
            </div>

            {submitted ? (
              <div className="space-y-6">
                <div className="rounded-lg bg-gold-500/10 border border-gold-500/20 px-4 py-3 text-sm text-gold-400">
                  If an account exists for <strong>{email}</strong>, you'll receive a password reset email shortly.
                </div>
                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm text-gold-400 hover:text-gold-300 transition-colors"
                  >
                    Back to sign in
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-foreground-muted mb-2">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-border bg-navy-950 px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-6 py-3.5 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>

                <div className="text-center pt-2">
                  <Link
                    href="/login"
                    className="text-sm text-foreground-subtle hover:text-foreground-muted transition-colors"
                  >
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
