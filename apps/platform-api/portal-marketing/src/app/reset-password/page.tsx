"use client";

import { useEffect } from "react";

/**
 * Reset-password redirect stub.
 * Password reset completion lives on the platform subdomain.
 * Preserves the token query parameter.
 */
export default function ResetPasswordRedirect() {
  useEffect(() => {
    const platformUrl =
      process.env.NEXT_PUBLIC_PLATFORM_URL ||
      "https://platform.tiresias.network";
    window.location.href = `${platformUrl}/reset-password${window.location.search}`;
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
