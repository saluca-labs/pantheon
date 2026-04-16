/**
 * Catch-all server proxy for /v1/* endpoints that would otherwise rewrite
 * to soulauth via next.config afterFiles. Next.js does NOT propagate
 * middleware-modified headers across external rewrites, so middleware's
 * X-SoulKey / Authorization injection is lost when a rewrite targets
 * soulauth directly. This route runs verifySession server-side and
 * forwards the verified session token to soulauth as both X-SoulKey and
 * Authorization: Bearer.
 *
 * More specific /v1/* routes (e.g. /v1/enforcement/quarantine,
 * /v1/mssp/tenants) still win over this catch-all because Next.js
 * prefers static segments. /v1/support/* is a local portal API and is
 * forwarded internally to /api/support/*.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  method: Method,
) {
  const result = await verifySession(request);
  if (isAuthError(result)) return result;
  const sessionToken = result.token;

  const { path } = await params;

  // /v1/support/* is a local portal API, not a soulauth endpoint.
  // Forward internally so the existing /api/support/* handlers serve it.
  if (path[0] === "support") {
    const subpath = path.slice(1).join("/");
    const search = request.nextUrl.searchParams.toString();
    const internalUrl = new URL(
      `/api/support/${subpath}${search ? `?${search}` : ""}`,
      request.nextUrl.origin,
    );
    const init: RequestInit = {
      method,
      headers: request.headers,
    };
    if (method !== "GET" && method !== "DELETE") {
      init.body = await request.text();
    }
    const res = await fetch(internalUrl, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    });
  }

  const subpath = path.join("/");
  const search = request.nextUrl.searchParams.toString();
  const upstreamUrl = `${config.soulauth.url}/v1/${subpath}${search ? `?${search}` : ""}`;

  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("content-type") ?? "application/json",
    "X-SoulKey": sessionToken,
    Authorization: `Bearer ${sessionToken}`,
  };
  const tenantHeader = request.headers.get("x-tenant-id");
  if (tenantHeader) headers["X-Tenant-ID"] = tenantHeader;
  const cookie = request.headers.get("cookie");
  if (cookie) headers["Cookie"] = cookie;

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(10_000),
  };
  if (method !== "GET" && method !== "DELETE") {
    init.body = await request.text();
  }

  try {
    const res = await fetch(upstreamUrl, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach soulauth" },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(request, ctx, "GET");
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(request, ctx, "POST");
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(request, ctx, "PUT");
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(request, ctx, "PATCH");
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(request, ctx, "DELETE");
}
