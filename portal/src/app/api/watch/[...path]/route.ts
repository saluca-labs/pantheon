/**
 * Server-side proxy for /watch/* SoulWatch endpoints.
 * Verifies the user's portal session via SoulAuth before proxying.
 */

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_TENANT_ID = "0c2515c2-1612-4a1a-bf72-47e760ccca51"; // Alfred Local

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL || "http://localhost:8001";

const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "sw_metrics_scrape_2026";

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
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);

  // SoulWatch aletheia endpoints require tenant_id as a query parameter.
  // Fall back to default tenant so local dev works without a session cookie.
  const tenantId = request.headers.get("x-tenant-id") || DEFAULT_TENANT_ID;
  if (!searchParams.has("tenant_id")) {
    searchParams.set("tenant_id", tenantId);
  }

  const search = searchParams.toString();
  const url = `${SOULWATCH_URL}/watch/${subpath}${search ? `?${search}` : ""}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Internal-Key": SOULWATCH_KEY,
      "X-Tenant-ID": tenantId,
    };

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: body }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch SoulWatch data" },
      { status: 502 },
    );
  }
}

/**
 * Shared handler for methods that forward a request body (POST, PUT, DELETE).
 * Preserves the original Content-Type from the incoming request so that
 * YAML (text/plain) and JSON payloads are both forwarded correctly.
 */
async function proxyWithBody(
  method: string,
  request: NextRequest,
  params: Promise<{ path: string[] }>,
) {
  const denied = await verifySession(request);
  if (denied) return denied;

  const { path } = await params;
  const subpath = path.join("/");
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);

  // Fall back to default tenant so local dev works without a session cookie.
  const tenantId = request.headers.get("x-tenant-id") || DEFAULT_TENANT_ID;
  if (!searchParams.has("tenant_id")) {
    searchParams.set("tenant_id", tenantId);
  }

  const search = searchParams.toString();
  const url = `${SOULWATCH_URL}/watch/${subpath}${search ? `?${search}` : ""}`;

  try {
    const headers: Record<string, string> = {
      "X-Internal-Key": SOULWATCH_KEY,
      "X-Tenant-ID": tenantId,
    };

    // Preserve the caller's Content-Type instead of hardcoding application/json.
    // Playbook create/edit sends YAML as text/plain; other calls send JSON.
    const incomingCT = request.headers.get("content-type");
    headers["Content-Type"] = incomingCT || "application/json";

    const body = await request.text();

    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: errBody }, { status: res.status });
    }

    // Handle 204 No Content (e.g. DELETE responses)
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch SoulWatch data" },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyWithBody("POST", request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyWithBody("PUT", request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyWithBody("DELETE", request, params);
}
