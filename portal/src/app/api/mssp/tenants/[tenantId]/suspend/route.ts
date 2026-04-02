/**
 * POST /api/mssp/tenants/[tenantId]/suspend
 *
 * Suspends a tenant via SoulAuth admin API.
 */
import { NextRequest, NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL ||
  process.env.SOULAUTH_INTERNAL_URL ||
  "http://soulauth:8000";

async function verifySession(
  request: NextRequest,
): Promise<NextResponse | null> {
  const sessionToken =
    request.cookies.get("tiresias_session")?.value ||
    request.cookies.get("tiresias_oidc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  try {
    const res = await fetch(`${SOULAUTH_URL}/v1/auth/local/session/verify`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!data.valid) {
      return NextResponse.json(
        { error: data.reason || "Invalid session" },
        { status: 401 },
      );
    }

    return null;
  } catch {
    return NextResponse.json(
      { error: "Session verification failed" },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const denied = await verifySession(request);
  if (denied) return denied;

  const { tenantId } = await params;

  try {
    const res = await fetch(
      `${SOULAUTH_URL}/v1/soulauth/admin/tenants/${tenantId}/suspend`,
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
      { error: "Failed to suspend tenant" },
      { status: 502 },
    );
  }
}
