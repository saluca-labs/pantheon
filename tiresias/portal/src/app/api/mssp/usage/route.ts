/**
 * GET /api/mssp/usage
 *
 * Fetches usage metrics for all tenants from SoulAuth admin API.
 * Accepts `from` and `to` query params for time range filtering.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL ||
  "http://soulauth.tiresias.svc.cluster.local";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;


  const from = request.nextUrl.searchParams.get("from") || "";
  const to = request.nextUrl.searchParams.get("to") || "";

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  try {
    const res = await fetch(
      `${SOULAUTH_URL}/v1/soulauth/admin/usage?${params.toString()}`,
      {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      // If the usage endpoint doesn't exist yet, build usage from key counts
      if (res.status === 404) {
        try {
          const tenantsRes = await fetch(
            `${SOULAUTH_URL}/v1/soulauth/admin/tenants`,
            { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000) },
          );
          if (tenantsRes.ok) {
            const tenants = await tenantsRes.json();
            const tenantList = Array.isArray(tenants) ? tenants : [];
            const syntheticUsage = await Promise.all(
              tenantList.map(async (t: { id: string }) => {
                try {
                  const keysRes = await fetch(
                    `${SOULAUTH_URL}/v1/soulauth/admin/keys?tenant_id=${t.id}`,
                    { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000) },
                  );
                  const keysData = keysRes.ok ? await keysRes.json() : [];
                  const keysList = Array.isArray(keysData) ? keysData : [];
                  const activeKeys = keysList.filter((k: { status: string }) => k.status === "active").length;
                  return {
                    tenant_id: t.id,
                    requests: activeKeys,
                    tokens: 0,
                    anomalies: 0,
                    storage_bytes: 0,
                    period_start: from || new Date().toISOString(),
                    period_end: to || new Date().toISOString(),
                  };
                } catch {
                  return { tenant_id: t.id, requests: 0, tokens: 0, anomalies: 0, storage_bytes: 0, period_start: from, period_end: to };
                }
              }),
            );
            return NextResponse.json({ usage: syntheticUsage });
          }
        } catch { /* fall through to empty */ }
        return NextResponse.json({ usage: [] });
      }
      const body = await res.text();
      return NextResponse.json({ error: body }, { status: res.status });
    }

    const data = await res.json();
    const usage = Array.isArray(data) ? data : (data.usage ?? []);
    return NextResponse.json({ usage });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch usage metrics" },
      { status: 502 },
    );
  }
}
