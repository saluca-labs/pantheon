"use client";

import { useEffect } from "react";

/**
 * Login redirect stub.
 * The marketing site does not handle authentication — redirect to the platform subdomain.
 * Preserves any ?redirect= query parameter for post-login navigation.
 */
export default function LoginRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "";
    const platformUrl =
      process.env.NEXT_PUBLIC_PLATFORM_URL ||
      "https://platform.tiresias.network";
    window.location.href = `${platformUrl}/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
        <p className="text-sm text-foreground-muted">Redirecting to login...</p>
      </div>
    </div>
  );
}
