/**
 * POST /api/provider-keys/[id]/test → resolve + probe upstream
 *
 * Asks the backend to make a low-cost probe call against the provider's
 * upstream using the stored credential. Returns {ok, latency_ms, error?}.
 * The backend NEVER echoes the resolved secret — only a masked secret_ref_info
 * descriptor that the UI uses to render `env://VAR_NAME`.
 *
 * Wave H.2.e — per-tenant BYOK provider keys.
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

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/provider-keys/${id}/test`,
      {
        method: "POST",
        headers: backendHeaders(session.tenantId, session.token, soulKey),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, latency_ms: 0, error: "proxy timeout" },
      { status: 502 },
    );
  }
}
