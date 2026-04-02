/**
 * Server-side proxy for /dash/* Tiresias dashboard endpoints.
 * Injects X-Tiresias-Api-Key server-side so the secret never reaches the browser.
 * Verifies the user's portal session via SoulAuth before proxying.
 */

import { NextRequest, NextResponse } from "next/server";

const TIRESIAS_PROXY_URL =
  process.env.TIRESIAS_PROXY_URL || "http://tiresias-proxy:8080";
const TIRESIAS_API_KEY = process.env.TIRESIAS_API_KEY || "";
const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth:8000";

async function verifySession(
  request: NextRequest,
): Promise<NextResponse | null> {
  const sessionToken =
    request.cookies.get("tiresias_session")?.value ||
    request.cookies.get("tiresias_oidc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  try {
    const res = await fetch(`${SOULAUTH_URL}/v1/auth/local/session/verify`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!data.valid) {
      return NextResponse.json(
        { error: data.reason || "Invalid session" },
        { status: 401 },
      );
    }

    return null;
  } catch {
    return NextResponse.json(
      { error: "Session verification failed" },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const denied = await verifySession(request);
  if (denied) return denied;

  const { path } = await params;
  const subpath = path.join("/");
  const search = request.nextUrl.searchParams.toString();
  const url = `${TIRESIAS_PROXY_URL}/dash/${subpath}${search ? `?${search}` : ""}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (TIRESIAS_API_KEY) {
      headers["X-Tiresias-Api-Key"] = TIRESIAS_API_KEY;
    }

    // Forward tenant and auth headers from the browser
    const tenantId = request.headers.get("x-tenant-id");
    if (tenantId) headers["X-Tenant-ID"] = tenantId;

    const soulkey = request.headers.get("x-soulkey");
    if (soulkey) headers["X-SoulKey"] = soulkey;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: body },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 502 },
    );
  }
}
