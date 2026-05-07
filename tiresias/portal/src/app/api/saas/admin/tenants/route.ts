/**
 * GET  /api/saas/admin/tenants — List all platform tenants (hierarchy-aware)
 * POST /api/saas/admin/tenants — Create any tenant type (SaaS master only)
 *
 * Proxies to /v1/saas/admin/tenants on the SoulAuth backend.
 * Gated to saas-tier callers.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/saas/admin/tenants`,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.token}`,
          "X-Internal-Key": config.internalApiKey,
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
    const raw = Array.isArray(data) ? data : (data.tenants ?? []);
    const tenants = raw.map((t: Record<string, unknown>) => ({
      tenant_id: t.tenant_id ?? t.id,
      id: t.id ?? t.tenant_id,
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
      { error: "Failed to fetch tenants" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();

    const res = await fetch(
      `${config.soulauth.url}/v1/saas/admin/tenants`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.token}`,
          "X-Internal-Key": config.internalApiKey,
          "X-Tenant-ID": session.tenantId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json({ error: errorBody }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to create tenant" },
      { status: 502 },
    );
  }
}
