"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function WelcomePage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [keyCopied, setKeyCopied] = useState(false);
  const [step3Polling, setStep3Polling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set the tiresias_welcomed cookie on mount to prevent redirect loop
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.cookie = "tiresias_welcomed=1; path=/; max-age=31536000; SameSite=Lax";
    }
  }, []);

  const markStepComplete = useCallback((step: number) => {
    setCompletedSteps((prev) => new Set([...prev, step]));
  }, []);

  const copyKey = useCallback(() => {
    if (!session?.soulkey) return;
    navigator.clipboard.writeText(session.soulkey).then(() => {
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
      markStepComplete(1);
    });
  }, [session?.soulkey, markStepComplete]);

  // Step 3: poll /v1/auth/whoami every 5s for first-request detection
  useEffect(() => {
    if (!session?.soulkey) return;
    if (completedSteps.has(3)) return;

    setStep3Polling(true);

    const poll = async () => {
      try {
        const res = await fetch("/api/v1/auth/whoami", {
          headers: { Authorization: `Bearer ${session.soulkey}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.request_count > 0 || data.status === "active") {
            markStepComplete(3);
            setStep3Polling(false);
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        }
      } catch {
        // Silently ignore — keep polling
      }
    };

    pollingRef.current = setInterval(poll, 5000);
    poll(); // immediate first check

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.soulkey]);

  // Stop polling once step 3 is complete
  useEffect(() => {
    if (completedSteps.has(3)) {
      setStep3Polling(false);
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
  }, [completedSteps]);

  const allDone = completedSteps.size === 3;

  const displayKey = session?.soulkey
    ? session.soulkey.length > 40
      ? session.soulkey.slice(0, 20) + "..." + session.soulkey.slice(-12)
      : session.soulkey
    : "sk_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

  const soulkeyDisplay = session?.soulkey ?? "<YOUR_SOULKEY>";
  const curlExample = [
    "curl -X POST https://tiresias.saluca.com/v1/chat/completions \\",
    '  -H "Authorization: Bearer ' + soulkeyDisplay + '" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '{\"model\": \"gpt-4o\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]}'",
  ].join("\n");

  const steps = [
    {
      number: 1,
      title: "Copy your SoulKey",
      description: "Your SoulKey authenticates all API requests. Keep it safe.",
      content: (
        <div className="flex items-center gap-2 mt-3">
          <code className="flex-1 font-mono text-sm text-of-primary tracking-wider bg-of-surface-container-high rounded-lg px-4 py-2.5 border border-of-outline-variant/10 overflow-x-auto whitespace-nowrap">
            {loading ? "Loading..." : displayKey}
          </code>
          <button
            onClick={copyKey}
            disabled={loading || !session?.soulkey}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-of-primary/10 text-of-primary text-xs font-medium hover:bg-of-primary/20 transition-colors border border-of-primary/15 disabled:opacity-50"
          >
            {keyCopied ? <CheckIcon /> : <CopyIcon />}
            {keyCopied ? "Copied!" : "Copy"}
          </button>
        </div>
      ),
    },
    {
      number: 2,
      title: "Install the SDK",
      description: "Use the Tiresias SDK to instrument your AI application.",
      content: (
        <div className="mt-3 space-y-3">
          <div className="bg-of-surface-container-high rounded-lg px-4 py-3 border border-of-outline-variant/10">
            <code className="font-mono text-sm text-of-on-surface-variant">
              npm install @tiresias/sdk
            </code>
          </div>
          {!completedSteps.has(2) && (
            <button
              onClick={() => markStepComplete(2)}
              className="px-4 py-2 rounded-lg bg-of-primary/10 text-of-primary text-xs font-semibold hover:bg-of-primary/20 transition-colors border border-of-primary/15"
            >
              Mark Complete
            </button>
          )}
        </div>
      ),
    },
    {
      number: 3,
      title: "Send your first request",
      description: "Make an API call through Tiresias to complete setup.",
      content: (
        <div className="mt-3 space-y-3">
          <div className="bg-of-surface-container-high rounded-lg px-4 py-3 border border-of-outline-variant/10 overflow-x-auto">
            <pre className="font-mono text-xs text-of-on-surface-variant whitespace-pre">{curlExample}</pre>
          </div>
          {!completedSteps.has(3) && (
            <div className="flex items-center gap-2 text-xs text-of-on-surface-variant">
              {step3Polling && <SpinnerIcon />}
              <span>{step3Polling ? "Waiting for first request..." : "Start the SDK to trigger detection."}</span>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-of-on-surface" style={{ fontFamily: "Manrope, sans-serif" }}>
          Get started with Tiresias
        </h1>
        <p className="text-sm text-of-on-surface-variant mt-1">
          Complete these steps to send your first protected API request.
        </p>
      </div>

      {/* SoulKey display card */}
      <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/10 mb-8">
        <p className="text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider mb-2">
          Your SoulKey
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-sm text-of-primary tracking-wider overflow-x-auto whitespace-nowrap">
            {loading ? "Loading..." : displayKey}
          </code>
          <button
            onClick={copyKey}
            disabled={loading || !session?.soulkey}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-of-primary/10 text-of-primary text-xs font-medium hover:bg-of-primary/20 transition-colors disabled:opacity-50"
          >
            {keyCopied ? <CheckIcon /> : <CopyIcon />}
            {keyCopied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Steps list */}
      <div className="flex flex-col gap-4">
        {steps.map((step) => {
          const isDone = completedSteps.has(step.number);
          return (
            <div
              key={step.number}
              className={`rounded-xl p-5 border transition-all duration-200 ${
                isDone
                  ? "border-of-primary/30 bg-of-primary/5"
                  : "border-of-outline-variant/10 bg-of-surface-container-low"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Step badge */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                    isDone
                      ? "bg-of-primary text-of-background"
                      : "bg-of-surface-container-high text-of-on-surface-variant"
                  }`}
                >
                  {isDone ? <CheckIcon /> : step.number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isDone ? "text-of-primary" : "text-of-on-surface"}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-of-on-surface-variant mt-0.5">{step.description}</p>
                  {step.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Go to Dashboard CTA */}
      {allDone && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => router.push("/dashboard/overview")}
            className="px-8 py-3 rounded-xl bg-of-primary text-of-background font-bold text-sm hover:bg-of-primary/90 transition-colors shadow-[0_0_20px_rgba(90,218,206,0.2)]"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
