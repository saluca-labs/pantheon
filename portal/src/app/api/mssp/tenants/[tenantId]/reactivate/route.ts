/**
 * POST /api/mssp/tenants/[tenantId]/reactivate
 *
 * Reactivates a suspended tenant via SoulAuth admin API.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const { tenantId } = await params;

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/soulauth/admin/tenants/${tenantId}/reactivate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: body }, { status: res.status });
    }

    const data = await res.json().catch(() => ({ ok: true }));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to reactivate tenant" },
      { status: 502 },
    );
  }
}
