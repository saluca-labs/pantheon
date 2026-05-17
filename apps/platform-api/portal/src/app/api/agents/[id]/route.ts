/**
 * GET    /api/agents/[id] → fetch a single agent
 * PATCH  /api/agents/[id] → update mutable agent fields
 * DELETE /api/agents/[id] → soft-delete (status='archived')
 *
 * Cross-tenant access returns 404 (no leak). PATCH/DELETE on a global
 * (tenant_id IS NULL) row returns 403 — the portal greys the buttons
 * out for those, but the backend is the source of truth.
 *
 * Wave H.2.d — Agents UI on top of the H.2.c CRUD endpoints.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { id } = await context.params;
  const soulKey = request.headers.get("x-soulkey");

  try {
    const res = await fetch(`${config.soulauth.url}/v1/agents/${id}`, {
      headers: backendHeaders(session.tenantId, session.token, soulKey),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch agent" },
      { status: 502 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { id } = await context.params;
  const soulKey = request.headers.get("x-soulkey");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${config.soulauth.url}/v1/agents/${id}`, {
      method: "PATCH",
      headers: backendHeaders(session.tenantId, session.token, soulKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { id } = await context.params;
  const soulKey = request.headers.get("x-soulkey");

  try {
    const res = await fetch(`${config.soulauth.url}/v1/agents/${id}`, {
      method: "DELETE",
      headers: backendHeaders(session.tenantId, session.token, soulKey),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 502 },
    );
  }
}
