"use client";

import { useEffect } from "react";

/**
 * Billing redirect stub.
 * Billing management requires authentication and lives on the platform subdomain.
 * Preserves any sub-path or query parameters.
 */
export default function BillingRedirect() {
  useEffect(() => {
    const platformUrl =
      process.env.NEXT_PUBLIC_PLATFORM_URL ||
      "https://platform.tiresias.network";
    window.location.href = `${platformUrl}/billing${window.location.search}`;
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
        <p className="text-sm text-foreground-muted">Redirecting to billing...</p>
      </div>
    </div>
  );
}
