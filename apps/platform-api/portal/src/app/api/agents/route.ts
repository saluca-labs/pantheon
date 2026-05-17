/**
 * GET  /api/agents       → list agents (caller's tenant + optional globals)
 * POST /api/agents       → create a new agent (tenant_id forced server-side)
 *
 * Thin proxy in front of platform-api `/v1/agents`. Verifies the portal
 * session, forwards the tenant header + internal API key + X-SoulKey, and
 * returns the backend response untouched.
 *
 * Wave H.2.d — Agents UI on top of the H.2.c CRUD endpoints.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_PATH = "/v1/agents";

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
      { error: "Failed to fetch agents" },
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
      { error: "Failed to create agent" },
      { status: 502 },
    );
  }
}
