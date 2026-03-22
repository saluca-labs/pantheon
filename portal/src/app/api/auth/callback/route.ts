/**
 * GET /api/auth/callback
 * Handles the IdP redirect with ?code=...&state=... query params.
 * Exchanges the code for a Tiresias OIDC session and sets cookies.
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

const OIDC_SESSION_COOKIE = "tiresias_oidc_session";
const OIDC_DATA_COOKIE = "tiresias_oidc_data";
const OIDC_SESSION_TTL = 28800; // 8 hours in seconds

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
  }

  try {
    const backendUrl = config.apiUrl;
    const res = await fetch(`${backendUrl}/v1/auth/oidc/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    });

    if (!res.ok) {
      console.error("[OIDC callback] backend error:", res.status, await res.text());
      return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
    }

    const data = await res.json();
    const { session_token, tenant_id, role, user, expires_at } = data;

    if (!session_token || !tenant_id || !user?.email) {
      return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
    }

    const isSecure = process.env.NODE_ENV === "production";

    const response = NextResponse.redirect(new URL("/dashboard", request.url));

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
      email: user.email,
      name: user.name ?? null,
      picture: user.picture ?? null,
      role,
      tenant_id,
      expires_at,
    });

    response.cookies.set(OIDC_DATA_COOKIE, oidcData, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: OIDC_SESSION_TTL,
    });

    return response;
  } catch (err) {
    console.error("[OIDC callback] unexpected error:", err);
    return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
  }
}
