/**
 * GET  /api/provider-keys → list the caller's per-tenant BYOK overrides
 * POST /api/provider-keys → create/upsert a per-tenant BYOK row
 *
 * Thin proxy in front of platform-api `/v1/provider-keys`. The portal
 * session is verified first, then the tenant header + internal API key
 * + X-SoulKey are forwarded to the backend. The backend response
 * (already masked — `secret_ref` is a URI reference, never a raw key)
 * is returned untouched.
 *
 * Wave H.2.e — per-tenant BYOK provider keys.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_PATH = "/v1/provider-keys";

function backendHeaders(
  tenantId: string,
  sessionToken: string,
  soulKey: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Internal-Key": config.internalApiKey,
    "X-Tenant-ID": tenantId,
    Authorization: `Bearer ${sessionToken}`,
  };
  if (soulKey) headers["X-SoulKey"] = soulKey;
  return headers;
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const soulKey = request.headers.get("x-soulkey");
  const qs = request.nextUrl.searchParams.toString();
  const url = `${config.soulauth.url}${BACKEND_PATH}${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: backendHeaders(session.tenantId, session.token, soulKey),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch provider keys" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const soulKey = request.headers.get("x-soulkey");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${config.soulauth.url}${BACKEND_PATH}`, {
      method: "POST",
      headers: backendHeaders(session.tenantId, session.token, soulKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to create provider key" },
      { status: 502 },
    );
  }
}
