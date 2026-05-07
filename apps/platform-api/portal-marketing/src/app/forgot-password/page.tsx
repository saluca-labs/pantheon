"use client";

import { useEffect } from "react";

/**
 * Forgot-password redirect stub.
 * Password reset lives on the platform subdomain.
 */
export default function ForgotPasswordRedirect() {
  useEffect(() => {
    const platformUrl =
      process.env.NEXT_PUBLIC_PLATFORM_URL ||
      "https://platform.tiresias.network";
    window.location.href = `${platformUrl}/forgot-password`;
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
        <p className="text-sm text-foreground-muted">Redirecting...</p>
      </div>
    </div>
  );
}
