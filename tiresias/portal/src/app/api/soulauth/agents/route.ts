/**
 * Server-side proxy for SoulAuth admin key listing.
 * Verifies the user's portal session, then fetches soulkeys from SoulAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

/** Fetch keys for a single tenant. Returns an array of soulkey objects. */
async function fetchKeysForTenant(
  tenantId: string,
  status: string | null,
  personaId: string | null,
): Promise<unknown[]> {
  const params = new URLSearchParams({ tenant_id: tenantId });
  if (status) params.set("status", status);
  if (personaId) params.set("persona_id", personaId);

  const url = `${config.soulauth.url}/v1/soulauth/admin/keys?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": config.internalApiKey,
      "X-Tenant-ID": tenantId,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

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
      `${config.soulauth.url}/v1/soulauth/admin/tenants`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": config.internalApiKey,
          "X-Tenant-ID": "7f561f93-8a90-46c3-a757-dad9ce1fdb23",
        },
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
