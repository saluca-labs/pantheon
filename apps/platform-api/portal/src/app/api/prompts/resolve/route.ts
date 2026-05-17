/**
 * GET /api/prompts/resolve?name=X → resolve the active prompt for a name
 *
 * Tenant rows win over global rows. 404 if no active row exists.
 *
 * Wave H.2.d — Prompts UI on top of the H.2.c CRUD endpoints.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

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
  const url = `${config.soulauth.url}/v1/prompts/resolve${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: backendHeaders(session.tenantId, session.token, soulKey),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Failed to resolve prompt" },
      { status: 502 },
    );
  }
}
