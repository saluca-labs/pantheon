/**
 * GET /api/saas/admin/stats — Platform-wide stats (SaaS master only)
 *
 * Proxies to /v1/saas/admin/stats on the SoulAuth backend.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import { config } from "@/lib/server-config";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const res = await fetch(
      `${config.soulauth.url}/v1/saas/admin/stats`,
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
    return NextResponse.json({ stats: data.stats ?? data });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch platform stats" },
      { status: 502 },
    );
  }
}
