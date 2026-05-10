"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { config } from "@/lib/config";

/** Email verification for trial -- activates trial tenant and reveals SoulKey. */

interface ActivationResponse {
  trial_id: string;
  tenant_id: string;
  soulkey_id: string;
  raw_key: string;
  proxy_api_key?: string;
  status: string;
  expires_at: string;
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const trialId = searchParams.get("trial_id");
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [activation, setActivation] = useState<ActivationResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);
  const [proxyKeyCopied, setProxyKeyCopied] = useState(false);

  useEffect(() => {
    if (!trialId || !token) {
      setStatus("error");
      setErrorMsg("Missing verification parameters. Please check your email link.");
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`${config.apiUrl}/v1/trial/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trial_id: trialId,
            verification_token: token,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.detail || `Verification failed (${res.status})`
          );
        }

        const data: ActivationResponse = await res.json();
        setActivation(data);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMsg(
          err instanceof Error ? err.message : "Verification failed. Please try again or contact support."
        );
      }
    };

    verify();
  }, [trialId, token]);

  const copyKey = () => {
    if (activation?.raw_key) {
      navigator.clipboard.writeText(activation.raw_key);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const copyProxyKey = () => {
    if (activation?.proxy_api_key) {
      navigator.clipboard.writeText(activation.proxy_api_key);
      setProxyKeyCopied(true);
      setTimeout(() => setProxyKeyCopied(false), 2000);
    }
  };

  return (
    <main className="min-h-screen bg-background pt-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-2xl px-6 lg:px-8 py-20 lg:py-28">
          {status === "verifying" && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-of-primary/10 mb-6">
                <svg className="animate-spin h-8 w-8 text-of-primary" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold mb-4">Verifying your email...</h1>
              <p className="text-of-on-surface-variant">Activating your Pantheon platform trial. This takes just a moment.</p>
            </div>
          )}

          {status === "success" && activation && (
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 sm:p-10 shadow-[0_0_20px_rgba(90,218,206,0.15)]">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Trial Activated</h1>
                  <p className="text-sm text-of-on-surface-variant">Your 14-day Pantheon platform trial is live.</p>
                </div>
              </div>

              {/* Credentials */}
              <div className="bg-of-background border border-of-outline-variant/15 rounded-xl p-5 space-y-4 mb-8">
                <div>
                  <p className="text-xs text-of-outline uppercase tracking-wide mb-1">Tenant ID</p>
                  <p className="text-sm font-mono text-foreground break-all">{activation.tenant_id}</p>
                </div>
                <div>
                  <p className="text-xs text-of-outline uppercase tracking-wide mb-1">SoulKey ID</p>
                  <p className="text-sm font-mono text-foreground break-all">{activation.soulkey_id}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-of-outline uppercase tracking-wide">API Key (shown once)</p>
                    <button
                      onClick={copyKey}
                      className="text-xs text-of-primary hover:text-of-primary/70 transition-colors"
                    >
                      {keyCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="bg-of-surface-container-low rounded-lg p-3 border border-of-primary/20">
                    <p className="text-sm font-mono text-of-primary break-all">{activation.raw_key}</p>
                  </div>
                  <p className="text-xs text-red-400 mt-2">
                    Save this key now. It will not be shown again.
                  </p>
                </div>
                <div>
                  <p className="text-xs text-of-outline uppercase tracking-wide mb-1">Trial Expires</p>
                  <p className="text-sm font-mono text-foreground">
                    {new Date(activation.expires_at).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* Proxy API Key */}
              {activation.proxy_api_key && (
                <div className="bg-of-background border border-of-outline-variant/15 rounded-xl p-5 space-y-4 mb-8">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-of-outline uppercase tracking-wide">Pantheon Proxy API Key (shown once)</p>
                      <button
                        onClick={copyProxyKey}
                        className="text-xs text-of-primary hover:text-of-primary/70 transition-colors"
                      >
                        {proxyKeyCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <p className="text-xs text-of-on-surface-variant mb-2">
                      Point your AI agents at https://pantheon.saluca.com/v1 with this key
                    </p>
                    <div className="bg-of-surface-container-low rounded-lg p-3 border border-of-primary/20">
                      <p className="text-sm font-mono text-of-primary break-all">{activation.proxy_api_key}</p>
                    </div>
                    <p className="text-xs text-red-400 mt-2">
                      Save this key now. It will not be shown again.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-of-outline uppercase tracking-wide mb-2">Configuration</p>
                    <pre className="bg-of-surface-container-low rounded-lg p-3 border border-of-outline-variant/15 text-xs font-mono text-of-on-surface-variant overflow-x-auto leading-relaxed">
{`export OPENAI_BASE_URL=https://pantheon.saluca.com/v1
export TIRESIAS_API_KEY=${activation.proxy_api_key}`}
                    </pre>
                  </div>
                </div>
              )}

              {/* Quick start */}
              <div className="bg-of-background border border-of-outline-variant/15 rounded-xl p-5 mb-8">
                <p className="text-sm font-semibold mb-3">Quick start</p>
                <pre className="text-xs font-mono text-of-primary overflow-x-auto leading-relaxed">
{`pip install soulauth

# Set your key
export SOULAUTH_API_KEY="${activation.raw_key.slice(0, 12)}..."

# Verify it works
curl -H "X-SoulKey: $SOULAUTH_API_KEY" \\
  https://pantheon.saluca.com/v1/auth/whoami`}
                </pre>
              </div>

              {/* Deploy on Your Infrastructure */}
              <div className="bg-of-background border border-of-outline-variant/15 rounded-xl p-5 mb-8">
                <h3 className="text-sm font-semibold mb-1">Deploy on Your Infrastructure</h3>
                <p className="text-xs text-of-on-surface-variant mb-4">Run Pantheon on your own servers with Docker Compose.</p>

                <div className="space-y-4">
                  {/* Step 1 */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-of-primary/15 border border-of-primary/20 flex items-center justify-center text-xs font-semibold text-of-primary">1</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium mb-2">Download deployment files</p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href="/api/downloads/compose"
                          download
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-of-primary/10 border border-of-primary/20 text-of-primary hover:bg-of-primary/20 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          docker-compose.yml
                        </a>
                        <a
                          href={`/api/downloads/env-template?tenant_id=${encodeURIComponent(activation.tenant_id)}&license_key=${encodeURIComponent(activation.raw_key)}`}
                          download
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-of-primary/10 border border-of-primary/20 text-of-primary hover:bg-of-primary/20 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          .env
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-of-primary/15 border border-of-primary/20 flex items-center justify-center text-xs font-semibold text-of-primary">2</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium mb-1">Review .env</p>
                      <p className="text-xs text-of-on-surface-variant">Your tenant ID and license key are pre-filled. Set a secure password for Postgres.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-of-primary/15 border border-of-primary/20 flex items-center justify-center text-xs font-semibold text-of-primary">3</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium mb-1.5">Start the stack</p>
                      <pre className="bg-of-surface-container-low rounded-lg p-3 border border-of-outline-variant/15 text-xs font-mono text-of-on-surface-variant overflow-x-auto">docker compose up -d</pre>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-of-primary/15 border border-of-primary/20 flex items-center justify-center text-xs font-semibold text-of-primary">4</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium mb-1.5">Verify it works</p>
                      <pre className="bg-of-surface-container-low rounded-lg p-3 border border-of-outline-variant/15 text-xs font-mono text-of-on-surface-variant overflow-x-auto">curl http://localhost:8080/health</pre>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-of-on-surface-variant mt-4 pt-3 border-t border-of-outline-variant/10">
                  Your license key and tenant ID are pre-filled in the .env file. Just set your Postgres password and start.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/trial/onboarding"
                  className="flex-1 text-center rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-6 py-3 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all"
                >
                  Get Started Guide
                </Link>
                <Link
                  href="/login"
                  className="flex-1 text-center rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-of-on-surface-variant hover:text-foreground hover:border-of-outline-variant/15-hover transition-colors"
                >
                  Sign In to Dashboard
                </Link>
                <Link
                  href="/developers"
                  className="flex-1 text-center rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-of-on-surface-variant hover:text-foreground hover:border-of-outline-variant/15-hover transition-colors"
                >
                  Developer Hub
                </Link>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-8 sm:p-10 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-6">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-4">Verification Failed</h1>
              <p className="text-of-on-surface-variant mb-8 max-w-md mx-auto">{errorMsg}</p>
              <div className="flex justify-center gap-4">
                <Link
                  href="/trial"
                  className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-6 py-3 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all"
                >
                  Try Again
                </Link>
                <a
                  href="mailto:support@saluca.com"
                  className="rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-of-on-surface-variant hover:text-foreground hover:border-of-outline-variant/15-hover transition-colors"
                >
                  Contact Support
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function TrialVerifyPage() {
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <main className="min-h-screen bg-background pt-16 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-of-primary border-t-transparent rounded-full" />
          </main>
        }
      >
        <VerifyContent />
      </Suspense>
      <Footer />
    </>
  );
}
