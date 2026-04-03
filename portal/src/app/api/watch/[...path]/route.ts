/**
 * Server-side proxy for /watch/* SoulWatch endpoints.
 * Verifies the user's portal session via SoulAuth before proxying.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { path } = await params;
  const subpath = path.join("/");
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);

  // SoulWatch aletheia endpoints require tenant_id as a query parameter.
  // Use tenant from the verified session; fall back to dev default.
  const tenantId = request.headers.get("x-tenant-id") || session.tenantId;
  if (!searchParams.has("tenant_id")) {
    searchParams.set("tenant_id", tenantId);
  }

  const search = searchParams.toString();
  const url = `${config.soulwatch.url}/watch/${subpath}${search ? `?${search}` : ""}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Internal-Key": config.soulwatch.key,
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
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { path } = await params;
  const subpath = path.join("/");
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);

  // Use tenant from the verified session; fall back to dev default.
  const tenantId = request.headers.get("x-tenant-id") || session.tenantId;
  if (!searchParams.has("tenant_id")) {
    searchParams.set("tenant_id", tenantId);
  }

  const search = searchParams.toString();
  const url = `${config.soulwatch.url}/watch/${subpath}${search ? `?${search}` : ""}`;

  try {
    const headers: Record<string, string> = {
      "X-Internal-Key": config.soulwatch.key,
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
