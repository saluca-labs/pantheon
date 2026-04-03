/**
 * GET /api/soulwatch/agents
 *
 * Fetches soulkey (agent) statistics from SoulAuth admin API.
 * Aggregates across all tenants for the dashboard overview.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";
import { tryFetch, fetchAllTenantIds } from "@/lib/server-fetch";

interface SoulKey {
  id: string;
  persona_id: string;
  label: string | null;
  status: string;
  issued_at: string;
  tenant_id: string;
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const tenantIds = await fetchAllTenantIds();

  const keyResults = await Promise.all(
    tenantIds.map((tid) =>
      tryFetch(`${config.soulauth.url}/v1/soulauth/admin/keys?tenant_id=${tid}`)
    )
  );

  const allKeys: SoulKey[] = [];
  for (const result of keyResults) {
    if (Array.isArray(result)) allKeys.push(...result);
  }

  const active = allKeys.filter((k) => k.status === "active").length;
  const suspended = allKeys.filter((k) => k.status === "suspended").length;
  const revoked = allKeys.filter((k) => k.status === "revoked").length;

  // Sort by issued_at descending for recent list
  const sorted = [...allKeys].sort(
    (a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()
  );

  return NextResponse.json({
    total: allKeys.length,
    active,
    suspended,
    revoked,
    recent: sorted.slice(0, 5).map((k) => ({
      persona_id: k.persona_id,
      label: k.label,
      status: k.status,
      issued_at: k.issued_at,
      tenant_id: k.tenant_id,
    })),
    fetched_at: new Date().toISOString(),
  });
}
