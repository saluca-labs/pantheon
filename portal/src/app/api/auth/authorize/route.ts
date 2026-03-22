/**
 * GET /api/auth/authorize?tenant=<slug>
 * Resolves the IdP authorize URL for the given tenant slug and
 * redirects the browser to the IdP (Google, Okta, Azure AD, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";


function getBaseUrl(request: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenant = searchParams.get("tenant");

  if (!tenant) {
    return NextResponse.redirect(new URL("/login?error=sso_failed", getBaseUrl(request)));
  }

  try {
    const backendUrl = config.apiUrl;
    const res = await fetch(
      `${backendUrl}/v1/auth/oidc/authorize?email=user%40${encodeURIComponent(tenant)}`,
      { method: "GET" }
    );

    if (!res.ok) {
      console.error("[OIDC authorize] backend error:", res.status, await res.text());
      return NextResponse.redirect(new URL("/login?error=sso_failed", getBaseUrl(request)));
    }

    const data = await res.json();
    const { authorization_url } = data;

    if (!authorization_url) {
      return NextResponse.redirect(new URL("/login?error=sso_failed", getBaseUrl(request)));
    }

    return NextResponse.redirect(authorization_url);
  } catch (err) {
    console.error("[OIDC authorize] unexpected error:", err);
    return NextResponse.redirect(new URL("/login?error=sso_failed", getBaseUrl(request)));
  }
}
