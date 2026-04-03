/**
 * GET /api/soulgate/audit
 *
 * Fetches audit log entries. Tries SoulGate first, falls back to
 * SoulAuth audit report for real data when SoulGate returns empty.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError, resolveTenant } from "@/lib/server-auth";
import { config } from "@/lib/server-config";
import { tryFetch, fetchAllTenantIds } from "@/lib/server-fetch";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const limit = request.nextUrl.searchParams.get("limit") || "100";
  const blocked = request.nextUrl.searchParams.get("blocked");

  // Try SoulGate first
  const params = new URLSearchParams({ limit });
  if (blocked) params.set("blocked", blocked);

  const logs = await tryFetch(
    `${config.soulgate.url}/gate/v1/audit/logs?${params.toString()}`
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
  const dynamicTenants = await fetchAllTenantIds();
  const tenantIds = [...new Set([tenantId, ...dynamicTenants])];

  const auditResults = await Promise.all(
    tenantIds.map((t) =>
      tryFetch(
        `${config.soulauth.url}/v1/soulauth/admin/audit/report?tenant_id=${t}&limit=${limit}`
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
