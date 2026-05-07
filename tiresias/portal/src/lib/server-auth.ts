/**
 * Shared server-side authentication utilities for API routes.
 *
 * Extracts and centralizes session verification logic previously
 * duplicated across 11+ route files.
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "./server-config";

/* ---- Session verification ---- */

export interface VerifiedSession {
  token: string;
  tenantId: string;
}

/**
 * Verify the caller's portal session via SoulAuth.
 *
 * Reads the session token from `tiresias_session` or `tiresias_oidc_session`
 * cookies, validates it against SoulAuth's session/verify endpoint, and
 * returns the verified session metadata on success.
 *
 * @returns A `VerifiedSession` on success, or a `NextResponse` 401/502 error.
 */
export async function verifySession(
  request: NextRequest,
): Promise<VerifiedSession | NextResponse> {
  const sessionToken =
    request.cookies.get("tiresias_session")?.value ||
    request.cookies.get("tiresias_oidc_session")?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/auth/local/session/verify`,
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        signal: AbortSignal.timeout(5000),
      },
    );

    const data = await res.json();
    if (!data.valid) {
      return NextResponse.json(
        { error: data.reason || "Invalid session" },
        { status: 401 },
      );
    }

    // Extract tenant from the verification response, header, or cookie
    const tenantId =
      data.tenant_id ||
      request.headers.get("x-tenant-id") ||
      resolveTenant(request);

    return { token: sessionToken, tenantId };
  } catch {
    return NextResponse.json(
      { error: "Session verification failed" },
      { status: 502 },
    );
  }
}

/**
 * Type-guard: returns `true` when `verifySession` produced an error response.
 */
export function isAuthError(
  result: VerifiedSession | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}

/* ---- Tenant resolution ---- */

const DEV_FALLBACK_TENANT = config.devFallbackTenant;

/**
 * Resolve tenant_id from request cookies.
 *
 * Checks (in order):
 *  1. `tiresias_tenant` cookie
 *  2. `tiresias_session_data` cookie (JSON with `tenant_id`)
 *  3. `tiresias_oidc_data` cookie (JSON with `tenant_id`)
 *  4. Dev fallback UUID
 */
export function resolveTenant(request: NextRequest): string {
  const fromCookie = request.cookies.get("tiresias_tenant")?.value;
  if (fromCookie) return fromCookie;

  const sessionData = request.cookies.get("tiresias_session_data")?.value;
  if (sessionData) {
    try {
      const parsed = JSON.parse(decodeURIComponent(sessionData));
      if (parsed.tenant_id) return parsed.tenant_id;
    } catch {
      // ignore malformed cookie
    }
  }

  const oidcData = request.cookies.get("tiresias_oidc_data")?.value;
  if (oidcData) {
    try {
      const parsed = JSON.parse(decodeURIComponent(oidcData));
      if (parsed.tenant_id) return parsed.tenant_id;
    } catch {
      // ignore malformed cookie
    }
  }

  return DEV_FALLBACK_TENANT;
}
