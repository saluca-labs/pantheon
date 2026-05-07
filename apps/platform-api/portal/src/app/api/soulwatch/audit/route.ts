/**
 * GET /api/soulwatch/audit
 *
 * Fetches recent audit events from SoulAuth admin API.
 * Returns the latest audit entries across all tenants.
 */
import { NextResponse } from "next/server";
import { config } from "@/lib/server-config";
import { tryFetch, fetchAllTenantIds } from "@/lib/server-fetch";

export async function GET() {
  // Fetch audit events from all tenants dynamically
  const tenantIds = await fetchAllTenantIds();

  const auditResults = await Promise.all(
    tenantIds.map((tid) =>
      tryFetch(`${config.soulauth.url}/v1/soulauth/admin/audit/report?tenant_id=${tid}&limit=25`)
    )
  );

  const allEvents: unknown[] = [];
  for (const data of auditResults) {
    if (data?.events) allEvents.push(...data.events);
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
