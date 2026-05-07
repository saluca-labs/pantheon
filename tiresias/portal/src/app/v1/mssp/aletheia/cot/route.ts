/**
 * GET /v1/mssp/aletheia/cot
 * Returns CoT chain entries across all child tenants.
 *
 * Fixes:
 *   ALETHEIA-001 — Repointed from SoulAuth (no such endpoint) to SoulWatch.
 *   ALETHEIA-002 — Iterates child tenants so each query includes tenant_id.
 */
import { NextRequest, NextResponse } from "next/server";
import { tenantName } from "@/lib/display";
import { config } from "@/lib/server-config";

const SOULWATCH_URL =
  process.env.SOULWATCH_INTERNAL_URL || "http://soulwatch-mssp:8001";
const SOULWATCH_KEY =
  process.env.SOULWATCH_INTERNAL_KEY || "";

interface CotEntry {
  request_id: string;
  model: string;
  provider: string;
  cot_token_count: number;
  timestamp: string;
  chain_hash: string;
  prev_hash: string;
  agent_id: string;
  entry_index: number;
  chain_id: string;
  cot_hash?: string;
  entry_hash?: string;
  cot_byte_count?: number;
  content_stored?: boolean;
  tenant_id?: string;
  tenant_name?: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") || "50";
  const perTenantLimit = parseInt(limit, 10);

  const parentTenantId =
    request.cookies.get("tiresias_tenant")?.value ||
    request.headers.get("x-tenant-id");

  try {
    // 1. Fetch child tenant IDs from SoulAuth
    const tenantsRes = await fetch(
      `${config.soulauth.url}/v1/soulauth/admin/tenants`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!tenantsRes.ok) return NextResponse.json({ entries: [], total: 0 });

    const allTenants: { id: string }[] = await tenantsRes.json();
    const childTenants = parentTenantId
      ? allTenants.filter((t) => t.id !== parentTenantId)
      : allTenants;

    if (childTenants.length === 0) {
      return NextResponse.json({ entries: [], total: 0 });
    }

    // 2. Query SoulWatch CoT chain for each child tenant in parallel
    const watchHeaders = {
      "X-Internal-Key": SOULWATCH_KEY,
    };

    const results = await Promise.all(
      childTenants.map(async (tenant) => {
        try {
          const res = await fetch(
            `${SOULWATCH_URL}/watch/v1/aletheia/cot/chain?tenant_id=${tenant.id}&limit=${perTenantLimit}`,
            {
              headers: watchHeaders,
              signal: AbortSignal.timeout(5000),
            }
          );
          if (!res.ok) return [];
          const data = await res.json();
          // Tag each entry with its tenant_id for the MSSP view
          const entries: CotEntry[] = data.entries || [];
          return entries.map((e) => ({
            ...e,
            tenant_id: tenant.id,
            tenant_name: tenantName(tenant.id),
          }));
        } catch {
          return [];
        }
      })
    );

    // 3. Merge & sort by timestamp descending, then trim to requested limit
    const merged = results
      .flat()
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, perTenantLimit);

    // Count distinct tenant_ids for the MSSP summary
    const tenantSet = new Set(merged.map((e) => e.tenant_id));
    const tenant_count = tenantSet.size;

    return NextResponse.json({ entries: merged, total: merged.length, tenant_count });
  } catch {
    return NextResponse.json({ entries: [], total: 0 });
  }
}
