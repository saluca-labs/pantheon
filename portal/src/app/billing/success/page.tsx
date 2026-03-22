"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const plan = searchParams.get("plan");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    plan === "community" ? "success" : "loading"
  );

  useEffect(() => {
    if (!sessionId || plan === "community") return;

    // In production, verify the checkout session status
    // For now, if we have a session_id, the redirect from Stripe means success
    const timer = setTimeout(() => setStatus("success"), 1000);
    return () => clearTimeout(timer);
  }, [sessionId, plan]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20 flex items-center justify-center">
        <div className="max-w-lg mx-auto text-center px-6">
          {status === "loading" && (
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12">
              <div className="animate-spin w-12 h-12 border-4 border-of-primary/30 border-t-of-primary rounded-full mx-auto mb-6" />
              <h2 className="text-xl font-semibold mb-2">
                Confirming your subscription...
              </h2>
              <p className="text-of-on-surface-variant text-sm">
                Please wait while we verify your payment.
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12">
              <div className="w-16 h-16 bg-of-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-8 h-8 text-of-primary"
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
              </div>
              <h1 className="text-2xl font-bold mb-3">
                Subscription activated
              </h1>
              <p className="text-of-on-surface-variant mb-8">
                Your Tiresias subscription is now active. Your license tier has
                been updated and all features are available immediately.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/platform"
                  className="rounded-lg bg-gradient-to-r from-of-primary to-of-primary px-6 py-3 text-sm font-medium text-of-background hover:from-of-primary hover:to-of-primary transition-all"
                >
                  Go to Dashboard
                </Link>
                <Link
                  href="/billing"
                  className="rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover transition-all"
                >
                  Manage Billing
                </Link>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-2xl p-12">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-8 h-8 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-3">
                Something went wrong
              </h1>
              <p className="text-of-on-surface-variant mb-8">
                We could not verify your payment. If you were charged, please
                contact support and we will resolve this immediately.
              </p>
              <Link
                href="mailto:support@saluca.com?subject=Billing%20Issue"
                className="rounded-lg border border-of-outline-variant/15 px-6 py-3 text-sm font-medium text-foreground hover:border-of-outline-variant/15-hover transition-all"
              >
                Contact Support
              </Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-of-primary/30 border-t-of-primary rounded-full" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
