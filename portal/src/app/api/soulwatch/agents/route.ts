/**
 * GET /api/soulwatch/agents
 *
 * Fetches soulkey (agent) statistics from SoulAuth admin API.
 * Aggregates across all tenants for the dashboard overview.
 */
import { NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth-mssp:8000";

interface SoulKey {
  id: string;
  persona_id: string;
  label: string | null;
  status: string;
  issued_at: string;
  tenant_id: string;
}

export async function GET() {
  const tenantIds = [
    "0c2515c2-1612-4a1a-bf72-47e760ccca51", // alfred-local
    "00000001-0000-4000-a000-000000000001",   // saluca-mssp
    "00000001-0000-4000-a001-000000000001",   // twin-alpha
    "00000001-0000-4000-a002-000000000001",   // twin-ivory
  ];

  const allKeys: SoulKey[] = [];

  for (const tid of tenantIds) {
    try {
      const res = await fetch(
        `${SOULAUTH_URL}/v1/soulauth/admin/keys?tenant_id=${tid}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const keys = await res.json();
        if (Array.isArray(keys)) {
          allKeys.push(...keys);
        }
      }
    } catch {
      // skip
    }
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
