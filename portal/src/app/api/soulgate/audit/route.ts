/**
 * GET /api/soulgate/audit
 *
 * Fetches audit log entries. Tries SoulGate first, falls back to
 * SoulAuth audit report for real data when SoulGate returns empty.
 */
import { NextRequest, NextResponse } from "next/server";

const SOULGATE_URL =
  process.env.SOULGATE_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOULGATE_API_URL ||
  "http://localhost:8002";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL ||
  process.env.SOULAUTH_INTERNAL_URL ||
  "http://localhost:8000";

async function verifySession(
  request: NextRequest,
): Promise<NextResponse | null> {
  const sessionToken =
    request.cookies.get("tiresias_session")?.value ||
    request.cookies.get("tiresias_oidc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  try {
    const res = await fetch(`${SOULAUTH_URL}/v1/auth/local/session/verify`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!data.valid) {
      return NextResponse.json(
        { error: data.reason || "Invalid session" },
        { status: 401 },
      );
    }

    return null;
  } catch {
    return NextResponse.json(
      { error: "Session verification failed" },
      { status: 502 },
    );
  }
}

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function resolveTenant(request: NextRequest): string {
  const fromCookie = request.cookies.get("tiresias_tenant")?.value;
  if (fromCookie) return fromCookie;

  const sessionData = request.cookies.get("tiresias_session_data")?.value;
  if (sessionData) {
    try {
      const parsed = JSON.parse(decodeURIComponent(sessionData));
      if (parsed.tenant_id) return parsed.tenant_id;
    } catch {
      // ignore
    }
  }

  return "00000001-0000-4000-a000-000000000001";
}

export async function GET(request: NextRequest) {
  const denied = await verifySession(request);
  if (denied) return denied;

  const limit = request.nextUrl.searchParams.get("limit") || "100";
  const blocked = request.nextUrl.searchParams.get("blocked");

  // Try SoulGate first
  const params = new URLSearchParams({ limit });
  if (blocked) params.set("blocked", blocked);

  const logs = await tryFetch(
    `${SOULGATE_URL}/gate/v1/audit/logs?${params.toString()}`
  );

  // If SoulGate returned real data, use it
  const gateEntries = Array.isArray(logs) ? logs : (logs?.logs ?? logs?.entries ?? []);
  if (gateEntries.length > 0) {
    return NextResponse.json({
      entries: gateEntries,
      count: gateEntries.length,
      source: "soulgate",
      fetched_at: new Date().toISOString(),
    });
  }

  // Fall back to SoulAuth audit report
  const tenantId = resolveTenant(request);
  const tenantIds = [
    tenantId,
    "00000001-0000-4000-a001-000000000001",
    "0c2515c2-1612-4a1a-bf72-47e760ccca51",
  ];

  const auditResults = await Promise.all(
    [...new Set(tenantIds)].map((t) =>
      tryFetch(
        `${SOULAUTH_URL}/v1/soulauth/admin/audit/report?tenant_id=${t}&limit=${limit}`
      )
    )
  );

  const allEvents: AuditEntry[] = [];
  for (const report of auditResults) {
    if (report?.events) allEvents.push(...report.events);
  }

  // Sort by timestamp descending
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Filter to blocked-only if requested
  let filtered = allEvents;
  if (blocked === "true") {
    filtered = allEvents.filter((e) => e.decision === "deny");
  }

  // Apply limit
  const limitNum = parseInt(limit);
  const entries = filtered.slice(0, limitNum).map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    event_type: e.event_type,
    persona_id: e.persona_id,
    resource: e.resource,
    action: e.action,
    scope: e.scope,
    decision: e.decision,
    reason: e.reason,
    blocked: e.decision === "deny",
    source_ip: e.context?.source_ip || null,
    node: e.context?.node || null,
  }));

  return NextResponse.json({
    entries,
    count: entries.length,
    total: filtered.length,
    source: "soulauth-live",
    fetched_at: new Date().toISOString(),
  });
}

interface AuditEntry {
  id: string;
  timestamp: string;
  event_type: string;
  persona_id: string;
  resource: string;
  action: string;
  scope: string;
  decision: string;
  reason: string | null;
  context: Record<string, unknown>;
}
