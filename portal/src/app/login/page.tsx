"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth";

function LoginForm() {
  const [soulkey, setSoulkey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const ssoError = searchParams.get("error");

  // Credential login state
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credError, setCredError] = useState("");
  const [credLoading, setCredLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<"local" | "ldap">("local");

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredLoading(true);
    setCredError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: authMethod,
          email: authMethod === "local" ? credEmail : undefined,
          username: authMethod === "ldap" ? credEmail : undefined,
          password: credPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCredError(data.error || "Invalid credentials");
        return;
      }

      // Redirect to dashboard
      window.location.href = redirect;
    } catch {
      setCredError("Connection error. Please try again.");
    } finally {
      setCredLoading(false);
    }
  };

  const handleSoulKeyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!soulkey.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await login(soulkey.trim());
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setLoading(true);
    setError(null);
    window.location.href = `/api/auth/authorize?provider=google&redirect=${encodeURIComponent(redirect)}`;
  };

  const displayError = error || (ssoError === "sso_unavailable" ? "Google sign-in is temporarily unavailable. Try SoulKey login." : ssoError === "sso_failed" ? "SSO authentication failed. Please try again." : null);

  return (
    <div className="relative glass-card rounded-2xl p-8 sm:p-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gold-500/10 mb-4">
          <svg className="w-7 h-7 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">Sign in to Tiresias</h1>
        <p className="text-sm text-foreground-muted mt-2">Agent security starts here</p>
      </div>

      {displayError && (
        <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {displayError}
        </div>
      )}

      {/* Username/Password Login Form */}
      <form onSubmit={handleCredentialLogin} className="space-y-4">
        {/* Auth method toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setAuthMethod("local")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              authMethod === "local"
                ? "bg-gold-500/20 text-gold-400 border-r border-border"
                : "bg-white/5 text-foreground-subtle hover:bg-white/10 border-r border-border"
            }`}
          >
            Email (Local)
          </button>
          <button
            type="button"
            onClick={() => setAuthMethod("ldap")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              authMethod === "ldap"
                ? "bg-gold-500/20 text-gold-400"
                : "bg-white/5 text-foreground-subtle hover:bg-white/10"
            }`}
          >
            Username (LDAP)
          </button>
        </div>

        <div>
          <label htmlFor="cred-email" className="block text-sm font-medium text-foreground-muted mb-2">
            {authMethod === "ldap" ? "Username" : "Email"}
          </label>
          <input
            id="cred-email"
            type={authMethod === "ldap" ? "text" : "email"}
            value={credEmail}
            onChange={(e) => setCredEmail(e.target.value)}
            placeholder={authMethod === "ldap" ? "username" : "you@company.com"}
            className="w-full rounded-lg border border-border bg-navy-950 px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-colors"
            required
          />
        </div>
        <div>
          <label htmlFor="cred-password" className="block text-sm font-medium text-foreground-muted mb-2">
            Password
          </label>
          <input
            id="cred-password"
            type="password"
            value={credPassword}
            onChange={(e) => setCredPassword(e.target.value)}
            placeholder="********"
            className="w-full rounded-lg border border-border bg-navy-950 px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-colors"
            required
          />
        </div>
        {credError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {credError}
          </div>
        )}
        <button
          type="submit"
          disabled={credLoading}
          className="w-full rounded-lg bg-gradient-to-r from-gold-600 to-gold-500 px-6 py-3.5 text-sm font-semibold text-navy-950 hover:from-gold-500 hover:to-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {credLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-foreground-subtle uppercase tracking-wider">or continue with</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button onClick={handleGoogleLogin} disabled={loading} className="w-full flex items-center justify-center gap-3 rounded-lg border border-border bg-white/5 hover:bg-white/10 px-6 py-3.5 text-sm font-medium text-foreground transition-all disabled:opacity-50">
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-foreground-subtle uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSoulKeyLogin} className="space-y-4">
        <div>
          <label htmlFor="soulkey" className="block text-sm font-medium text-foreground-muted mb-2">SoulKey</label>
          <input id="soulkey" type="password" value={soulkey} onChange={(e) => setSoulkey(e.target.value)} placeholder="sk_soul_..." className="w-full rounded-lg border border-border bg-navy-950 px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-colors" />
        </div>
        <button type="submit" disabled={loading || !soulkey.trim()} className="w-full rounded-lg border border-border bg-white/5 hover:bg-white/10 px-6 py-3.5 text-sm font-medium text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? "Signing in..." : "Sign in with SoulKey"}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-border text-center space-y-3">
        <p className="text-xs text-foreground-subtle">
          No account?{" "}
          <Link href="/trial" className="text-gold-400 hover:text-gold-300 transition-colors">Start a free trial</Link>
        </p>
        <p className="text-xs text-foreground-subtle">
          <Link href="/developers" className="hover:text-foreground-muted transition-colors">Developer Docs</Link>
          {" | "}
          <a href="mailto:support@saluca.com" className="hover:text-foreground-muted transition-colors">Need help?</a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16 flex items-center justify-center">
        <section className="relative w-full max-w-md mx-auto px-6 py-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.06),transparent_60%)]" />
          <Suspense>
            <LoginForm />
          </Suspense>
        </section>
      </main>
      <Footer />
    </>
  );
}
