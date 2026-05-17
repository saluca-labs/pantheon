/**
 * POST /api/agents-store/test
 *
 * Run a health check against a PROPOSED agents-store configuration WITHOUT
 * persisting it. Used by the Settings → Agents Store tab when the user
 * clicks "Test connection" before saving.
 *
 * Thin proxy in front of platform-api `/v1/agents-store/test`.
 *
 * Wave H.2.b — configurable AgentStore + PromptStore (LocalPg ↔ Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

const BACKEND_PATH = "/v1/agents-store/test";

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
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": config.internalApiKey,
        "X-Tenant-ID": session.tenantId,
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to test agents-store config" },
      { status: 502 },
    );
  }
}
