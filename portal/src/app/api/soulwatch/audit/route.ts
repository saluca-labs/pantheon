/**
 * GET /api/soulwatch/audit
 *
 * Fetches recent audit events from SoulAuth admin API.
 * Returns the latest audit entries across all tenants.
 */
import { NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL || "http://soulauth-mssp:8000";

export async function GET() {
  // Fetch audit events from all tenants we know about
  const tenantIds = [
    "0c2515c2-1612-4a1a-bf72-47e760ccca51", // alfred-local
    "00000001-0000-4000-a000-000000000001",   // saluca-mssp
    "00000001-0000-4000-a001-000000000001",   // twin-alpha
    "00000001-0000-4000-a002-000000000001",   // twin-ivory
  ];

  const allEvents: unknown[] = [];

  for (const tid of tenantIds) {
    try {
      const res = await fetch(
        `${SOULAUTH_URL}/v1/soulauth/admin/audit/report?tenant_id=${tid}&limit=25`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.events) {
          allEvents.push(...data.events);
        }
      }
    } catch {
      // skip unreachable tenants
    }
  }

  // Sort by timestamp descending, take latest 50
  allEvents.sort((a: any, b: any) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json({
    events: allEvents.slice(0, 50),
    count: allEvents.length,
    fetched_at: new Date().toISOString(),
  });
}
