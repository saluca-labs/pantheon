/**
 * Server-side session management API route.
 * Stores the SoulKey in an HttpOnly cookie so it cannot be read by JavaScript.
 * The client only receives a session_data cookie with non-sensitive metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";

const SESSION_COOKIE = "tiresias_session";
const SESSION_DATA_COOKIE = "tiresias_session_data";
const TENANT_COOKIE = "tiresias_tenant";
const SESSION_TTL = 86400; // 24 hours in seconds

/**
 * POST /api/session - Create a new session
 * Body: { soulkey, tenant_id, persona_id, tier, tenant_name }
 *
 * Sets an HttpOnly cookie with the soulkey (not accessible to JS).
 * Sets a regular cookie with session metadata (for client-side rendering).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { soulkey, tenant_id, persona_id, tier, tenant_name } = body;

    if (!soulkey || !tenant_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const expires_at = Date.now() + SESSION_TTL * 1000;

    // Create a session token hash - this is what the client sees, not the raw soulkey
    const sessionToken = createHash("sha256")
      .update(soulkey + Date.now().toString())
      .digest("hex")
      .slice(0, 32);

    const response = NextResponse.json({
      status: "ok",
      session_token: sessionToken,
      expires_at,
    });

    // HttpOnly cookie: stores the actual soulkey (not readable by JavaScript)
    response.cookies.set(SESSION_COOKIE, soulkey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL,
    });

    // Regular cookie: stores non-sensitive session metadata (readable by client for UI)
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL,
    });

    response.cookies.set(TENANT_COOKIE, tenant_id, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
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
 * Clears all session cookies.
 */
export async function DELETE() {
  const response = NextResponse.json({ status: "ok" });

  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(SESSION_DATA_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(TENANT_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });

  return response;
}

/**
 * GET /api/session - Retrieve the soulkey from the HttpOnly cookie
 * Only callable server-side or by authenticated API routes.
 * Returns the soulkey for server-side API calls.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const cookieStore = await cookies();
  const soulkeyCookie = cookieStore.get(SESSION_COOKIE);
  const sessionDataCookie = cookieStore.get(SESSION_DATA_COOKIE);

  if (!soulkeyCookie?.value || !sessionDataCookie?.value) {
    return NextResponse.json(
      { error: "No active session" },
      { status: 401 },
    );
  }

  try {
    const sessionData = JSON.parse(sessionDataCookie.value);

    // Check expiry
    if (sessionData.expires_at && Date.now() > sessionData.expires_at) {
      // Session expired - clear cookies
      const response = NextResponse.json(
        { error: "Session expired" },
        { status: 401 },
      );
      response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(SESSION_DATA_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }

    return NextResponse.json({
      soulkey: soulkeyCookie.value,
      ...sessionData,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid session data" },
      { status: 401 },
    );
  }
}
