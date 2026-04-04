"use client";

/**
 * /checkout/success
 *
 * Post-Stripe Checkout success page.
 * Retrieves soulkey from /api/billing/session (raw_key cleared after first fetch).
 * Shows soulkey with copy button + 3-step quickstart. (TRIAL-03)
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

interface SessionData {
  plan_id: string;
  tenant_id: string | null;
  soulkey_id: string | null;
  raw_key: string | null;
  customer_email: string | null;
  payment_status: string;
}

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const QUICKSTART_STEPS = [
  {
    step: "1",
    title: "Install the SDK",
    code: "pip install tiresias-sdk",
    note: "Requires Python 3.10+",
  },
  {
    step: "2",
    title: "Set your API key",
    code: "export TIRESIAS_API_KEY=<your_soulkey>",
    note: "Add to .env or your secrets manager",
  },
  {
    step: "3",
    title: "Send your first request",
    code: 'curl -H "X-SoulKey: $TIRESIAS_API_KEY" \\\n  https://tiresias.network/v1/auth/whoami',
    note: "Returns your tenant and persona details",
  },
];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-of-outline-variant/15 hover:border-of-outline-variant/15-hover text-of-on-surface-variant hover:text-foreground transition-all"
      aria-label={label || "Copy to clipboard"}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-of-primary">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setErrorMsg("No session ID found. If you were charged, contact support.");
      return;
    }

    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/billing/session?session_id=${sessionId}`);
        if (!res.ok) {
          const data = await res.json();
          setErrorMsg(data.detail || "Could not verify your payment.");
          setStatus("error");
          return;
        }
        const data: SessionData = await res.json();
        setSession(data);
        setStatus("success");
      } catch {
        setErrorMsg("Network error. Please refresh or contact support.");
        setStatus("error");
      }
    };

    fetchSession();
  }, [sessionId]);

  if (status === "loading") {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12">
          <div className="animate-spin w-10 h-10 border-4 border-of-primary/30 border-t-of-primary rounded-full mx-auto mb-6" />
          <h2 className="text-lg font-semibold mb-2">Activating your account...</h2>
          <p className="text-sm text-of-on-surface-variant">This takes a few seconds.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12">
          <div className="w-14 h-14 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-3">Something went wrong</h1>
          <p className="text-sm text-of-on-surface-variant mb-8">{errorMsg}</p>
          <Link
            href="mailto:support@saluca.com?subject=Checkout%20Issue"
            className="inline-block rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover transition-all"
          >
            Contact Support
          </Link>
        </div>
      </div>
    );
  }

  const planLabel = TIER_LABELS[session?.plan_id || ""] || session?.plan_id || "Starter";
  const rawKey = session?.raw_key;

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      {/* Success header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-of-primary/15 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-of-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-2">
          Welcome to Tiresias{" "}
          <span className="text-of-primary">{planLabel}</span>
        </h1>
        <p className="text-of-on-surface-variant">
          Your account is active. Your 14-day trial has started.
        </p>
        {session?.customer_email && (
          <p className="text-sm text-of-outline mt-1">
            Confirmation sent to {session.customer_email}
          </p>
        )}
      </div>

      {/* Soulkey card */}
      <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-7 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-sm text-foreground">Your API Key (SoulKey)</h2>
            <p className="text-xs text-of-outline mt-0.5">
              This key is shown once only. Save it now.
            </p>
          </div>
          {rawKey && <CopyButton text={rawKey} label="Copy API key" />}
        </div>

        {rawKey ? (
          <div className="bg-of-surface-container-low/60 border border-of-primary/20 rounded-xl p-4">
            <code className="text-sm font-mono text-of-primary break-all leading-relaxed">
              {rawKey}
            </code>
          </div>
        ) : (
          <div className="bg-of-surface-container-low/60 border border-of-outline-variant/15 rounded-xl p-4 text-center">
            <p className="text-sm text-of-on-surface-variant">
              Key already retrieved. Check your email or contact support if you need it resent.
            </p>
          </div>
        )}

        <p className="text-xs text-red-400/80 mt-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          This key will not be shown again. Store it in a secrets manager.
        </p>
      </div>

      {/* IDs card */}
      {(session?.tenant_id || session?.soulkey_id) && (
        <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-sm mb-4">Account Details</h2>
          <div className="space-y-3">
            {session.tenant_id && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-of-outline uppercase tracking-wide mb-0.5">Tenant ID</p>
                  <code className="text-sm font-mono text-foreground break-all">{session.tenant_id}</code>
                </div>
                <CopyButton text={session.tenant_id} />
              </div>
            )}
            {session.soulkey_id && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-of-outline uppercase tracking-wide mb-0.5">SoulKey ID</p>
                  <code className="text-sm font-mono text-foreground break-all">{session.soulkey_id}</code>
                </div>
                <CopyButton text={session.soulkey_id} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quickstart steps */}
      <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-7 mb-8">
        <h2 className="font-semibold mb-5">Get started in 3 steps</h2>
        <div className="space-y-5">
          {QUICKSTART_STEPS.map((s) => (
            <div key={s.step} className="flex gap-4">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-of-primary/15 border border-of-primary/20 flex items-center justify-center text-xs font-semibold text-of-primary">
                {s.step}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-1.5">{s.title}</p>
                <div className="relative">
                  <pre className="bg-of-surface-container-low/60 border border-of-outline-variant/15 rounded-lg px-4 py-3 text-xs font-mono text-of-on-surface-variant overflow-x-auto leading-relaxed">
                    {s.code.replace("<your_soulkey>", rawKey || "<your_soulkey>")}
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton
                      text={s.code.replace("<your_soulkey>", rawKey || "<your_soulkey>")}
                    />
                  </div>
                </div>
                <p className="text-xs text-of-outline mt-1.5">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/platform"
          className="flex-1 text-center rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-6 py-3 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all shadow-lg shadow-of-primary/20"
        >
          Open Dashboard
        </Link>
        <Link
          href="https://tiresias.network/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover hover:bg-of-surface-container/50 transition-all"
        >
          Read the Docs
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-20 pb-20">
        <Suspense
          fallback={
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-of-primary/30 border-t-of-primary rounded-full" />
            </div>
          }
        >
          <SuccessContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
