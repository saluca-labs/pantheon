/**
 * GET /api/auth/authorize?provider=google&redirect=/dashboard
 * Initiates OIDC flow via SoulAuth backend, then redirects to the IdP.
 */
import { NextRequest, NextResponse } from "next/server";

function getBaseUrl(request: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") || "google";
  const backendUrl = process.env.SOULAUTH_INTERNAL_URL || "http://soulauth.tiresias.svc.cluster.local";

  try {
    const res = await fetch(
      `${backendUrl}/v1/auth/oidc/authorize?provider_type=${encodeURIComponent(provider)}`,
      { method: "GET" }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error("[authorize] backend error:", res.status, body);
      return NextResponse.redirect(new URL("/login?error=sso_unavailable", getBaseUrl(request)));
    }

    const data = await res.json();
    if (!data.authorization_url) {
      return NextResponse.redirect(new URL("/login?error=sso_unavailable", getBaseUrl(request)));
    }

    return NextResponse.redirect(data.authorization_url);
  } catch (err) {
    console.error("[authorize] unexpected error:", err);
    return NextResponse.redirect(new URL("/login?error=sso_unavailable", getBaseUrl(request)));
  }
}
