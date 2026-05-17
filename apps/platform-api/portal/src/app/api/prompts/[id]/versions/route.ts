/**
 * POST /api/prompts/[id]/versions → append a new body version
 *
 * Prompts are append-only. Body edits create a new row with version+1
 * and supersedes_id chained to the previous active row. The new row
 * inherits the prior status (typically 'active').
 *
 * Wave H.2.d — Prompts UI on top of the H.2.c CRUD endpoints.
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

export async function POST(request: NextRequest, context: RouteContext) {
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
    const res = await fetch(
      `${config.soulauth.url}/v1/prompts/${id}/versions`,
      {
        method: "POST",
        headers: backendHeaders(session.tenantId, session.token, soulKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to create prompt version" },
      { status: 502 },
    );
  }
}
