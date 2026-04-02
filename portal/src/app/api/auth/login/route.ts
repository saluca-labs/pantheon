/**
 * POST /api/auth/login
 * Handles local email/password and LDAP login.
 * Proxies to SoulAuth's /v1/auth/local/login or /v1/auth/ldap/login,
 * then sets session cookies identical to the OIDC callback flow.
 */

import { NextRequest, NextResponse } from "next/server";

// Use runtime env (not NEXT_PUBLIC_ which is baked at build time)
function getSoulAuthUrl(): string {
  return (
    process.env.SOULAUTH_INTERNAL_URL ||
    process.env.SOULAUTH_INTERNAL_URL ||
    "http://soulauth.tiresias.svc.cluster.local"
  );
}

const OIDC_SESSION_COOKIE = "tiresias_oidc_session";
const OIDC_DATA_COOKIE = "tiresias_oidc_data";
const TENANT_COOKIE = "tiresias_tenant";
const SESSION_TTL = 28800; // 8 hours

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, username, mode } = body as {
      email?: string;
      password?: string;
      username?: string;
      mode?: "local" | "ldap";
    };

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
    }

    let backendUrl: string;
    let payload: Record<string, string>;

    if (mode === "ldap") {
      if (!username) {
        return NextResponse.json(
          { error: "Username is required for LDAP login" },
          { status: 400 },
        );
      }
      backendUrl = `${getSoulAuthUrl()}/v1/auth/ldap/login`;
      payload = { username, password };
    } else {
      if (!email) {
        return NextResponse.json(
          { error: "Email is required" },
          { status: 400 },
        );
      }
      backendUrl = `${getSoulAuthUrl()}/v1/auth/local/login`;
      payload = { email, password };
    }

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ detail: "Login failed" }));
      return NextResponse.json(
        { error: errBody.detail || "Invalid credentials" },
        { status: res.status },
      );
    }

    const data = await res.json();
    const session_token = data.session_token || data.access_token || data.token;
    const tenant_id = data.tenant_id;
    const email_out = data.email || email || username;
    const display_name = data.display_name || data.name || null;
    const role = data.admin_role || data.role || "viewer";
    const tenant_name = data.tenant_name || null;
    const expires_in = data.expires_in || SESSION_TTL;
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    if (!session_token || !tenant_id) {
      return NextResponse.json(
        { error: "Incomplete response from auth server" },
        { status: 502 },
      );
    }

    const isSecure = process.env.NODE_ENV === "production";

    const response = NextResponse.json({ ok: true, redirect: "/dashboard" });

    // HttpOnly cookie: session token
    response.cookies.set(OIDC_SESSION_COOKIE, session_token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL,
    });

    // Regular cookie: user profile data for UI
    const oidcData = JSON.stringify({
      email: email_out,
      name: display_name,
      picture: null,
      role,
      tier: data.tier || "mssp",
      tenant_id,
      tenant_name,
      expires_at,
    });

    response.cookies.set(OIDC_DATA_COOKIE, oidcData, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL,
    });

    // Non-HttpOnly session cookie: allows client-side api.ts to read the
    // session token for X-SoulKey / Authorization headers.
    response.cookies.set("tiresias_session", session_token, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL,
    });

    // Tenant cookie
    response.cookies.set(TENANT_COOKIE, tenant_id, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL,
    });

    return response;
  } catch (err) {
    console.error("[local-login] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
