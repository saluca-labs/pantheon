"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loading, error: authError } = useAuth();

  const [soulkey, setSoulkey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirect = searchParams.get("redirect") || "/dashboard";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const key = soulkey.trim();

    if (!key) {
      setError("Please enter your SoulKey.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await login(key);
      router.push(redirect);
    } catch {
      setError(authError || "Invalid SoulKey. Please check and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-of-background pt-16 flex items-center justify-center">
      <section className="relative w-full max-w-md mx-auto px-6 py-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,218,206,0.06),transparent_60%)]" />

        <div className="relative bg-of-surface-container border border-of-outline-variant/20 rounded-2xl p-8 sm:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-of-primary/10 mb-4">
              <svg
                className="w-7 h-7 text-of-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                />
              </svg>
            </div>
            <h1 className="text-headline-md text-of-on-surface">Sign in to Tiresias</h1>
            <p className="text-body-sm text-of-on-surface-variant mt-2">
              Enter your SoulKey to access the platform dashboard.
            </p>
          </div>

          {/* Error */}
          {(error || authError) && (
            <div className="mb-6 rounded-xl bg-of-error-container/20 border border-of-error/30 p-4 text-body-sm text-of-error">
              {error || authError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="soulkey"
                className="block text-label-md text-of-on-surface-variant mb-2"
              >
                SoulKey
              </label>
              <input
                id="soulkey"
                type="password"
                value={soulkey}
                onChange={(e) => setSoulkey(e.target.value)}
                placeholder="sk_live_..."
                autoComplete="current-password"
                className="w-full rounded-lg bg-of-surface-container-lowest border border-of-outline-variant/30 px-4 py-3 text-body-sm font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/50 focus:ring-1 focus:ring-of-primary/20 transition-colors"
              />
              <p className="mt-2 text-label-sm text-of-on-surface-variant/60">
                Your SoulKey was provided when you activated your trial or was
                issued by your administrator.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="w-full rounded-lg bg-of-primary px-6 py-3.5 text-label-lg font-semibold text-of-on-primary hover:bg-of-primary-fixed transition-all shadow-lg shadow-of-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t border-of-outline-variant/20 text-center space-y-3">
            <p className="text-body-sm text-of-on-surface-variant">
              Don&apos;t have a SoulKey?{" "}
              <Link
                href="/trial"
                className="text-of-primary hover:text-of-primary-fixed font-medium transition-colors"
              >
                Start a free trial
              </Link>
            </p>
            <p className="text-label-sm text-of-on-surface-variant/50">
              <Link
                href="/developers"
                className="hover:text-of-on-surface-variant transition-colors"
              >
                What is a SoulKey?
              </Link>
              {" | "}
              <a
                href="mailto:support@saluca.com"
                className="hover:text-of-on-surface-variant transition-colors"
              >
                Need help?
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <main className="min-h-screen bg-of-background pt-16 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-of-primary border-t-transparent rounded-full" />
          </main>
        }
      >
        <LoginForm />
      </Suspense>
      <Footer />
    </>
  );
}
