/**
 * GET /api/auth/callback
 * Handles the IdP redirect with ?code=...&state=... query params.
 * Exchanges the code for a Tiresias OIDC session and sets cookies.
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

const OIDC_SESSION_COOKIE = "tiresias_oidc_session";
const OIDC_DATA_COOKIE = "tiresias_oidc_data";
const TENANT_COOKIE = "tiresias_tenant";
const OIDC_SESSION_TTL = 28800; // 8 hours in seconds


function getBaseUrl(request: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=sso_failed", getBaseUrl(request)));
  }

  try {
    const backendUrl = process.env.SOULAUTH_INTERNAL_URL || "http://soulauth.tiresias.svc.cluster.local";
    const res = await fetch(`${backendUrl}/v1/auth/oidc/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state, redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || getBaseUrl(request)}/api/auth/callback` }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[OIDC callback] backend error:", res.status, errBody);
      return NextResponse.redirect(new URL(`/login?error=sso_failed&detail=${encodeURIComponent(errBody.slice(0, 200))}`, getBaseUrl(request)));
    }

    const data = await res.json();
    const session_token = data.session_token;
    const tenant_id = data.tenant_id;
    const tenant_name = data.tenant_name || null;
    const tier = data.tier || "enterprise";
    const role = data.admin_role || "viewer";
    const email = data.email;
    const display_name = data.display_name;
    const expires_in = data.expires_in || 28800;
    const expires_at = Date.now() + expires_in * 1000; // epoch ms — matches OIDCSession type

    if (!session_token || !tenant_id || !email) {
      return NextResponse.redirect(new URL("/login?error=sso_failed", getBaseUrl(request)));
    }

    const isSecure = process.env.NODE_ENV === "production";

    const response = NextResponse.redirect(new URL("/dashboard", getBaseUrl(request)));

    // HttpOnly cookie: stores the raw OIDC session token (not readable by JS)
    response.cookies.set(OIDC_SESSION_COOKIE, session_token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: OIDC_SESSION_TTL,
    });

    // Regular cookie: stores non-sensitive OIDC user profile (readable by client for UI)
    const oidcData = JSON.stringify({
      email,
      name: display_name ?? null,
      picture: null,
      role,
      tier,
      tenant_id,
      tenant_name,
      expires_at,
    });

    response.cookies.set(OIDC_DATA_COOKIE, oidcData, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: OIDC_SESSION_TTL,
    });

    // Tenant cookie: used by the API client for X-Tenant-ID header
    response.cookies.set(TENANT_COOKIE, tenant_id, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: OIDC_SESSION_TTL,
    });

    return response;
  } catch (err: unknown) {
    console.error("[OIDC callback] unexpected error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(new URL(`/login?error=sso_failed&detail=${encodeURIComponent(message.slice(0, 200))}`, getBaseUrl(request)));
  }
}
