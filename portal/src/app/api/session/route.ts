/**
 * Server-side session management API route.
 * Stores the SoulKey in an HttpOnly cookie so it cannot be read by JavaScript.
 * The client only receives a session_data cookie with non-sensitive metadata.
 *
 * Also handles OIDC session deletion (clears both SoulKey and OIDC cookies).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";

const SESSION_COOKIE = "tiresias_session";
const SESSION_DATA_COOKIE = "tiresias_session_data";
const TENANT_COOKIE = "tiresias_tenant";
const OIDC_SESSION_COOKIE = "tiresias_oidc_session";
const OIDC_DATA_COOKIE = "tiresias_oidc_data";
const SESSION_TTL = 86400; // 24 hours in seconds

/**
 * POST /api/session - Create a new session
 *
 * Body (SoulKey flow):  { soulkey, tenant_id, persona_id, tier, tenant_name }
 * Body (OIDC flow):     { auth_method: 'oidc', session_token, tenant_id, role, user }
 *
 * Sets an HttpOnly cookie with the credential (not accessible to JS).
 * Sets a regular cookie with session metadata (for client-side rendering).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isSecure = process.env.NODE_ENV === "production";

    // ---- OIDC session creation path ----
    if (body.auth_method === "oidc") {
      const { session_token, tenant_id, role, user, expires_at } = body;

      if (!session_token || !tenant_id || !user?.email) {
        return NextResponse.json(
          { error: "Missing required OIDC fields" },
          { status: 400 },
        );
      }

      const response = NextResponse.json({ status: "ok", expires_at });

      response.cookies.set(OIDC_SESSION_COOKIE, session_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 28800, // 8h
      });

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
        maxAge: 28800,
      });

      return response;
    }

    // ---- SoulKey session creation path (existing) ----
    const { soulkey, tenant_id, persona_id, tier, tenant_name } = body;

    if (!soulkey || !tenant_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const expires_at = Date.now() + SESSION_TTL * 1000;

    const sessionToken = createHash("sha256")
      .update(soulkey + Date.now().toString())
      .digest("hex")
      .slice(0, 32);

    const response = NextResponse.json({
      status: "ok",
      session_token: sessionToken,
      expires_at,
    });

    response.cookies.set(SESSION_COOKIE, soulkey, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL,
    });

    const sessionData = JSON.stringify({
      tenant_id,
      persona_id,
      tier,
      tenant_name,
      session_token: sessionToken,
      expires_at,
    });

    response.cookies.set(SESSION_DATA_COOKIE, sessionData, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL,
    });

    response.cookies.set(TENANT_COOKIE, tenant_id, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/session - Destroy the session
 * Clears ALL session cookies (both SoulKey and OIDC).
 */
export async function DELETE() {
  const isSecure = process.env.NODE_ENV === "production";

  const response = NextResponse.json({ status: "ok" });

  // Clear SoulKey cookies
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(SESSION_DATA_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });

  // Clear OIDC cookies
  response.cookies.set(OIDC_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(OIDC_DATA_COOKIE, "", { path: "/", maxAge: 0 });

  return response;
}

/**
 * GET /api/session - Retrieve the active credential from HttpOnly cookie.
 * Returns soulkey for SoulKey sessions, or session_token for OIDC sessions.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const cookieStore = await cookies();

  // Check OIDC session first
  const oidcSessionCookie = cookieStore.get(OIDC_SESSION_COOKIE);
  const oidcDataCookie = cookieStore.get(OIDC_DATA_COOKIE);

  if (oidcSessionCookie?.value && oidcDataCookie?.value) {
    try {
      const oidcData = JSON.parse(oidcDataCookie.value);
      if (oidcData.expires_at && Date.now() > oidcData.expires_at) {
        const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
        response.cookies.set(OIDC_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
        response.cookies.set(OIDC_DATA_COOKIE, "", { path: "/", maxAge: 0 });
        return response;
      }
      return NextResponse.json({
        auth_method: "oidc",
        session_token: oidcSessionCookie.value,
        ...oidcData,
      });
    } catch {
      // malformed — fall through to SoulKey check
    }
  }

  // Check SoulKey session
  const soulkeyCookie = cookieStore.get(SESSION_COOKIE);
  const sessionDataCookie = cookieStore.get(SESSION_DATA_COOKIE);

  if (!soulkeyCookie?.value || !sessionDataCookie?.value) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  try {
    const sessionData = JSON.parse(sessionDataCookie.value);

    if (sessionData.expires_at && Date.now() > sessionData.expires_at) {
      const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
      response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(SESSION_DATA_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }

    return NextResponse.json({
      auth_method: "soulkey",
      soulkey: soulkeyCookie.value,
      ...sessionData,
    });
  } catch {
    return NextResponse.json({ error: "Invalid session data" }, { status: 401 });
  }
}
