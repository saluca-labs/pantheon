/**
 * Server-side proxy for /partner/* SoulAuth endpoints.
 * Verifies the user's portal session via SoulAuth before proxying.
 */

import { NextRequest, NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth:8000";

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || "";

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

async function proxyToSoulAuth(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  method: string,
) {
  const authError = await verifySession(request);
  if (authError) return authError;

  const { path } = await params;
  const subpath = path.join("/");
  const tenantId = request.headers.get("x-tenant-id") || "";
  const search = request.nextUrl.search || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-ID": tenantId,
  };
  if (INTERNAL_KEY) headers["X-Internal-Key"] = INTERNAL_KEY;

  const fetchOpts: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(15000),
  };

  if (method !== "GET" && method !== "HEAD") {
    try {
      const body = await request.text();
      if (body) fetchOpts.body = body;
    } catch {
      /* empty body is fine */
    }
  }

  try {
    const res = await fetch(
      `${SOULAUTH_URL}/v1/partner/${subpath}${search}`,
      fetchOpts,
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: body }, { status: res.status });
    }

    // Handle 204 No Content (e.g. DELETE responses)
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { error: "Failed to reach partner service" },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyToSoulAuth(req, ctx, "GET");
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyToSoulAuth(req, ctx, "POST");
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyToSoulAuth(req, ctx, "PUT");
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxyToSoulAuth(req, ctx, "DELETE");
}
