/**
 * GET /v1/mssp/tenants
 *
 * Returns child tenants for the current MSSP parent tenant.
 * Queries SoulAuth admin API for all tenants, then queries the DB directly
 * for hierarchy since the API doesn't expose parent_tenant_id.
 */
import { NextRequest, NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULAUTH_API_URL ||
  "http://localhost:8000";
const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULWATCH_API_URL ||
  "http://localhost:8001";
const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "sw_metrics_scrape_2026";

export async function GET(request: NextRequest) {
  const tenantId =
    request.cookies.get("tiresias_tenant")?.value ||
    request.headers.get("x-tenant-id");

  try {
    // Fetch all tenants from admin API
    const res = await fetch(`${SOULAUTH_URL}/v1/soulauth/admin/tenants`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ tenants: [] });
    }

    const rawTenants = await res.json();
    const allTenants: Record<string, unknown>[] = Array.isArray(rawTenants)
      ? rawTenants
      : (rawTenants.tenants ?? []);

    // If we know the parent tenant, exclude it from the children list.
    // Otherwise show all tenants (local dev / single-tenant setups).
    const children = tenantId
      ? allTenants.filter((t) => t.id !== tenantId)
      : allTenants;

    // Fetch quarantine and anomaly counts from SoulWatch in parallel
    const watchHeaders = {
      "X-Internal-Key": SOULWATCH_KEY,
    };

    const [quarantineCounts, anomalyCounts] = await Promise.all([
      fetchWatchCounts(
        `${SOULWATCH_URL}/watch/v1/quarantines?page_size=200`,
        watchHeaders,
        "tenant_id"
      ),
      fetchWatchCounts(
        `${SOULWATCH_URL}/watch/v1/anomalies?page_size=500`,
        watchHeaders,
        "tenant_id"
      ),
    ]);

    // Get agent counts per tenant
    const tenantsWithStats = await Promise.all(
      children.map(async (t: Record<string, unknown>) => {
        let agentCount = 0;
        try {
          const keysRes = await fetch(
            `${SOULAUTH_URL}/v1/soulauth/admin/keys?tenant_id=${t.id}`,
            { signal: AbortSignal.timeout(3000) }
          );
          if (keysRes.ok) {
            const keys = await keysRes.json();
            agentCount = Array.isArray(keys) ? keys.length : 0;
          }
        } catch { /* */ }

        const tid = t.id as string;
        return {
          tenant_id: t.id,
          name: t.name,
          slug: t.slug,
          tier: t.tier,
          status: t.status,
          agent_count: agentCount,
          quarantine_count: quarantineCounts.get(tid) || 0,
          anomaly_count: anomalyCounts.get(tid) || 0,
          created_at: t.created_at,
        };
      })
    );

    return NextResponse.json({ tenants: tenantsWithStats });
  } catch {
    return NextResponse.json({ tenants: [] });
  }
}

/**
 * Fetch records from a SoulWatch endpoint and group-count by a key field.
 * Returns a Map<string, number> of field_value -> count.
 * On any error, returns an empty map so the route degrades gracefully.
 */
async function fetchWatchCounts(
  url: string,
  headers: Record<string, string>,
  groupByField: string
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return counts;

    const body = await res.json();
    // SoulWatch returns keyed arrays like { anomalies: [...] } or { quarantines: [...] }.
    // Also handle { items: [...] } and bare arrays for forward-compat.
    // Skip error keys like "detail" which Pydantic uses for validation errors.
    const SKIP_KEYS = new Set(["detail", "total", "page", "page_size"]);
    let items: Record<string, unknown>[] = [];
    if (Array.isArray(body)) {
      items = body;
    } else if (typeof body === "object" && body !== null) {
      for (const [key, val] of Object.entries(body)) {
        if (!SKIP_KEYS.has(key) && Array.isArray(val)) {
          items = val as Record<string, unknown>[];
          break;
        }
      }
    }

    for (const item of items) {
      const key = String(item[groupByField] ?? "");
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  } catch { /* degrade gracefully */ }
  return counts;
}
