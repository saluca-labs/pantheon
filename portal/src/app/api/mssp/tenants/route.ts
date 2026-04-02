/**
 * GET /api/mssp/tenants
 *
 * Lists all tenants from SoulAuth admin API.
 * Proxies to SoulAuth's tenant management endpoint.
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

export async function GET(request: NextRequest) {
  const denied = await verifySession(request);
  if (denied) return denied;

  try {
    const res = await fetch(
      `${SOULAUTH_URL}/v1/soulauth/admin/tenants`,
      {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: body }, { status: res.status });
    }

    const data = await res.json();
    // Normalize: ensure tenants array exists and map `id` -> `tenant_id`
    const raw = Array.isArray(data) ? data : (data.tenants ?? []);
    const tenants = raw.map((t: Record<string, unknown>) => ({
      tenant_id: t.tenant_id ?? t.id,
      name: t.name,
      slug: t.slug,
      tier: t.tier,
      status: t.status,
      metadata: t.metadata,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));
    return NextResponse.json({ tenants });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch tenants from SoulAuth" },
      { status: 502 },
    );
  }
}
