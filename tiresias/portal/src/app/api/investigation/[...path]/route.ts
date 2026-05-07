/**
 * Server-side proxy for /investigation/* SoulAuth endpoints.
 * Verifies the user's portal session via SoulAuth before proxying.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

async function proxyToSoulAuth(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  method: string,
) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { path } = await params;
  const subpath = path.join("/");
  const tenantId = request.headers.get("x-tenant-id") || "";
  const search = request.nextUrl.search || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-ID": tenantId,
  };
  if (config.internalApiKey) headers["X-Internal-Key"] = config.internalApiKey;

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
      `${config.soulauth.url}/v1/investigation/${subpath}${search}`,
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
      { error: "Failed to reach investigation service" },
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
