/**
 * GET /api/mssp/tenants
 *
 * Lists all tenants from SoulAuth admin API.
 * Proxies to SoulAuth's tenant management endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/mssp/tenants`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": session.tenantId,
        },
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
      parent_tenant_id: t.parent_tenant_id ?? null,
      hierarchy_depth: t.hierarchy_depth ?? 0,
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
