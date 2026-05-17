/**
 * GET  /api/agents-store/config  → fetch the current agents-store config
 * POST /api/agents-store/config  → upsert the agents-store config
 *
 * Thin proxy in front of platform-api `/v1/agents-store/config`. Verifies
 * the portal session, forwards the tenant header + internal API key, and
 * returns the backend response untouched.
 *
 * Wave H.2.b — configurable AgentStore + PromptStore (LocalPg ↔ Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_PATH = "/v1/agents-store/config";

function backendHeaders(tenantId: string, sessionToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Internal-Key": config.internalApiKey,
    "X-Tenant-ID": tenantId,
    Authorization: `Bearer ${sessionToken}`,
  };
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const res = await fetch(`${config.soulauth.url}${BACKEND_PATH}`, {
      headers: backendHeaders(session.tenantId, session.token),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch agents-store config" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${config.soulauth.url}${BACKEND_PATH}`, {
      method: "POST",
      headers: backendHeaders(session.tenantId, session.token),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to update agents-store config" },
      { status: 502 },
    );
  }
}
