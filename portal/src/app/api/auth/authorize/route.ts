/**
 * GET /api/auth/authorize?tenant=<slug>
 * Resolves the IdP authorize URL for the given tenant slug and
 * redirects the browser to the IdP (Google, Okta, Azure AD, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenant = searchParams.get("tenant");

  if (!tenant) {
    return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
  }

  try {
    const backendUrl = config.apiUrl;
    const res = await fetch(
      `${backendUrl}/v1/auth/oidc/authorize?tenant_slug=${encodeURIComponent(tenant)}`,
      { method: "GET" }
    );

    if (!res.ok) {
      console.error("[OIDC authorize] backend error:", res.status, await res.text());
      return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
    }

    const data = await res.json();
    const { authorize_url } = data;

    if (!authorize_url) {
      return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
    }

    return NextResponse.redirect(authorize_url);
  } catch (err) {
    console.error("[OIDC authorize] unexpected error:", err);
    return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
  }
}
