import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Marketing site middleware.
 *
 * Redirects all platform-specific paths (dashboard, API routes, auth pages)
 * to platform.tiresias.network with 301 permanent redirects.
 *
 * Paths that stay on the marketing site:
 *   /, /pricing, /docs, /trial, /platform, /use-cases, /developers,
 *   /company, /security, /legal, /api/billing/*
 */

/** Platform-bound path prefixes (order doesn't matter, first match wins). */
const PLATFORM_PREFIXES = [
  "/dashboard",
  "/login",
  "/onboarding",
  "/api/session",
  "/api/auth",
  "/api/dash",
  "/api/soulwatch",
  "/api/soulgate",
  "/api/soulauth",
  "/api/mssp",
  "/api/saas",
  "/api/support",
  "/api/teams",
  "/api/users",
  "/api/partner",
  "/api/contracts",
  "/api/downloads",
  "/api/investigation",
  "/api/playground",
  "/api/invites",
  "/api/tiresias",
  "/api/watch",
  "/v1",
  "/billing",
  "/checkout",
  "/forgot-password",
  "/reset-password",
];

/** Paths under /api that must NOT redirect (stay on marketing site). */
const MARKETING_API_PREFIXES = ["/api/billing"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const platformUrl =
    process.env.NEXT_PUBLIC_PLATFORM_URL || "https://platform.tiresias.network";

  // Never redirect marketing-owned API routes
  const isMarketingApi = MARKETING_API_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );

  if (!isMarketingApi) {
    const isPlatformPath = PLATFORM_PREFIXES.some((p) =>
      pathname.startsWith(p)
    );

    if (isPlatformPath) {
      return NextResponse.redirect(`${platformUrl}${pathname}${search}`, 301);
    }

    // Exact match for /settings (no prefix needed)
    if (pathname === "/settings") {
      return NextResponse.redirect(`${platformUrl}/settings${search}`, 301);
    }
  }

  // Prevent CDN/Next.js caching on dynamic pages
  const NO_CACHE_PATHS = ["/trial", "/pricing"];
  if (NO_CACHE_PATHS.some((p) => pathname === p)) {
    const response = NextResponse.next();
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Surrogate-Control", "no-store");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/onboarding",
    "/api/session/:path*",
    "/api/auth/:path*",
    "/api/dash/:path*",
    "/api/soulwatch/:path*",
    "/api/soulgate/:path*",
    "/api/soulauth/:path*",
    "/api/mssp/:path*",
    "/api/saas/:path*",
    "/api/support/:path*",
    "/api/teams/:path*",
    "/api/users/:path*",
    "/api/partner/:path*",
    "/api/contracts/:path*",
    "/api/downloads/:path*",
    "/api/investigation/:path*",
    "/api/playground/:path*",
    "/api/invites",
    "/api/tiresias/:path*",
    "/api/watch/:path*",
    "/v1/:path*",
    "/billing/:path*",
    "/checkout/:path*",
    "/forgot-password",
    "/reset-password",
    "/settings",
    "/trial",
    "/pricing",
  ],
};
