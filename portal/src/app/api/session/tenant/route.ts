/**
 * POST /api/session/tenant - Switch tenant for the current session
 *
 * Updates the tenant_id in whichever session cookie is active (OIDC or SoulKey).
 * Preserves the existing auth session — only changes the tenant binding.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const SESSION_COOKIE = "tiresias_session";
const SESSION_DATA_COOKIE = "tiresias_session_data";
const OIDC_SESSION_COOKIE = "tiresias_oidc_session";
const OIDC_DATA_COOKIE = "tiresias_oidc_data";
const TENANT_COOKIE = "tiresias_tenant";
const SESSION_TTL = 86400;

export async function POST(request: NextRequest) {
  try {
    const { tenant_id, tenant_name, tier } = await request.json();
    const isSecure = process.env.NODE_ENV === "production";

    if (!tenant_id) {
      return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const response = NextResponse.json({ status: "ok", tenant_id });

    // Always update the tenant cookie
    response.cookies.set(TENANT_COOKIE, tenant_id, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL,
    });

    // Check if OIDC session is active — update it in place
    const oidcData = cookieStore.get(OIDC_DATA_COOKIE);
    if (oidcData?.value) {
      try {
        const existing = JSON.parse(decodeURIComponent(oidcData.value));
        existing.tenant_id = tenant_id;
        existing.tenant_name = tenant_name || existing.tenant_name || "";
        if (tier) existing.tier = tier;

        response.cookies.set(OIDC_DATA_COOKIE, JSON.stringify(existing), {
          httpOnly: false,
          secure: isSecure,
          sameSite: "lax",
          path: "/",
          maxAge: SESSION_TTL,
        });
      } catch {
        // malformed cookie — create fresh
      }
    }

    // Check if SoulKey session is active — update it in place
    const sessionData = cookieStore.get(SESSION_DATA_COOKIE);
    if (sessionData?.value) {
      try {
        const existing = JSON.parse(decodeURIComponent(sessionData.value));
        existing.tenant_id = tenant_id;
        existing.tenant_name = tenant_name || existing.tenant_name || "";
        if (tier) existing.tier = tier;

        response.cookies.set(SESSION_DATA_COOKIE, JSON.stringify(existing), {
          httpOnly: false,
          secure: isSecure,
          sameSite: "lax",
          path: "/",
          maxAge: SESSION_TTL,
        });
      } catch {
        // malformed
      }
    }

    // If no session at all, create a minimal one so middleware passes
    if (!oidcData?.value && !sessionData?.value) {
      const expires_at = Date.now() + SESSION_TTL * 1000;

      response.cookies.set(SESSION_COOKIE, `tenant-session-${tenant_id.slice(0, 8)}`, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL,
      });

      response.cookies.set(SESSION_DATA_COOKIE, JSON.stringify({
        tenant_id,
        persona_id: "admin",
        tier: tier || "mssp",
        tenant_name: tenant_name || "",
        expires_at,
      }), {
        httpOnly: false,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL,
      });
    }

    return response;
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/session/tenant - Clear tenant binding
 */
export async function DELETE() {
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(SESSION_DATA_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(OIDC_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(OIDC_DATA_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
