/**
 * Server-side proxy for SoulAuth admin key listing.
 * Verifies the user's portal session, then fetches soulkeys from SoulAuth.
 */

import { NextRequest, NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth:8000";

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

/** Fetch keys for a single tenant. Returns an array of soulkey objects. */
async function fetchKeysForTenant(
  tenantId: string,
  status: string | null,
  personaId: string | null,
): Promise<unknown[]> {
  const params = new URLSearchParams({ tenant_id: tenantId });
  if (status) params.set("status", status);
  if (personaId) params.set("persona_id", personaId);

  const url = `${SOULAUTH_URL}/v1/soulauth/admin/keys?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function GET(request: NextRequest) {
  const denied = await verifySession(request);
  if (denied) return denied;

  // When ?all=true is set, fetch keys across every tenant (agents overview)
  const fetchAll = request.nextUrl.searchParams.get("all") === "true";

  // Extract tenant_id from header (set by client api.ts) or query param
  const tenantId = fetchAll
    ? null
    : request.headers.get("x-tenant-id") ||
      request.nextUrl.searchParams.get("tenant_id");

  // Forward optional filters
  const status = request.nextUrl.searchParams.get("status");
  const personaId = request.nextUrl.searchParams.get("persona_id");

  try {
    // If a specific tenant is requested, fetch only that tenant's keys
    if (tenantId) {
      const keys = await fetchKeysForTenant(tenantId, status, personaId);
      return NextResponse.json(keys);
    }

    // No tenant specified: fetch ALL tenants and merge their keys
    const tenantsRes = await fetch(
      `${SOULAUTH_URL}/v1/soulauth/admin/tenants`,
      {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!tenantsRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch tenant list" },
        { status: 502 },
      );
    }

    const tenants = await tenantsRes.json();
    if (!Array.isArray(tenants) || tenants.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch keys for all tenants in parallel
    const allKeysArrays = await Promise.all(
      tenants.map((t: { id: string }) =>
        fetchKeysForTenant(t.id, status, personaId),
      ),
    );

    const merged = allKeysArrays.flat();
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch soulkeys from SoulAuth" },
      { status: 502 },
    );
  }
}
