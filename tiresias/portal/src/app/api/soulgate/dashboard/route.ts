/**
 * GET /api/soulgate/dashboard
 *
 * Aggregates SoulGate dashboard data from multiple real sources:
 *  - SoulAuth audit report  -> hourly request volume, block reasons, top blocked agents
 *  - SoulAuth admin keys    -> active key count (used as "upstreams")
 *  - SoulGate health        -> gateway health status
 *
 * Returns the exact shape the SoulGate dashboard page expects:
 *   { metrics, upstreams, blocks, fetched_at }
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError, resolveTenant } from "@/lib/server-auth";
import { config } from "@/lib/server-config";
import { tryFetch, fetchAllTenantIds } from "@/lib/server-fetch";

/* ---- route handler ---- */

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const tenantId = resolveTenant(request);

  // Fetch all sources in parallel
  const soulAuthHeaders = config.internalApiKey
    ? { "X-Internal-Key": config.internalApiKey, "X-Tenant-ID": tenantId }
    : undefined;

  const [auditReport, allKeys, gateHealth] = await Promise.all([
    // SoulAuth audit report — last 100 events for this tenant
    tryFetch(
      `${config.soulauth.url}/v1/soulauth/admin/audit/report?tenant_id=${tenantId}&limit=500`,
      soulAuthHeaders,
    ),
    // SoulAuth admin keys — used to derive "upstreams" (agent keys)
    tryFetch(
      `${config.soulauth.url}/v1/soulauth/admin/keys?tenant_id=${tenantId}`,
      soulAuthHeaders,
    ),
    // SoulGate health
    tryFetch(`${config.soulgate.url}/health`),
  ]);

  // Also fetch audit events from all tenants for broader view
  const allTenantIds = await fetchAllTenantIds();
  const additionalAudits = await Promise.all(
    allTenantIds
      .filter((t) => t !== tenantId)
      .map((t) =>
        tryFetch(
          `${config.soulauth.url}/v1/soulauth/admin/audit/report?tenant_id=${t}&limit=500`,
          soulAuthHeaders,
        )
      )
  );

  // Merge all audit events
  const allEvents: AuditEvent[] = [];
  if (auditReport?.events) allEvents.push(...auditReport.events);
  for (const report of additionalAudits) {
    if (report?.events) allEvents.push(...report.events);
  }

  // ---- Build metrics ----
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Filter to last 24h
  const recent = allEvents.filter(
    (e) => new Date(e.timestamp) >= twentyFourHoursAgo
  );
  const recentBlocked = recent.filter((e) => e.decision === "deny");

  // Hourly request volume (last 24 hours)
  const hourlyMap = new Map<string, { total: number; blocked: number }>();
  for (let i = 0; i < 24; i++) {
    const hourLabel = `${String(i).padStart(2, "0")}:00`;
    hourlyMap.set(hourLabel, { total: 0, blocked: 0 });
  }
  for (const event of recent) {
    const eventDate = new Date(event.timestamp);
    const hourLabel = `${String(eventDate.getUTCHours()).padStart(2, "0")}:00`;
    const entry = hourlyMap.get(hourLabel);
    if (entry) {
      entry.total++;
      if (event.decision === "deny") entry.blocked++;
    }
  }
  const hourlyRequests = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
    hour,
    total: data.total,
    blocked: data.blocked,
  }));

  // Block reasons breakdown
  const reasonCounts = new Map<string, number>();
  for (const event of recentBlocked) {
    const reason = normalizeReason(event.reason || event.event_type || "unknown");
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  }
  const totalBlocked = recentBlocked.length;
  const blockReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      count,
      pct: totalBlocked > 0 ? Math.round((count / totalBlocked) * 100) : 0,
    }));

  // Compute requests per minute (average over the last hour)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const lastHourEvents = recent.filter(
    (e) => new Date(e.timestamp) >= oneHourAgo
  );
  const requestsPerMin = Math.round(lastHourEvents.length / 60) || Math.round(recent.length / (24 * 60));

  // "Active upstreams" = active soulkeys as provider endpoints
  const keys: KeyEntry[] = Array.isArray(allKeys) ? allKeys : [];
  const activeKeys = keys.filter((k) => k.status === "active");

  // Build upstream-like entries from active keys
  interface UpstreamEntry {
    name: string;
    status: "healthy" | "degraded" | "down";
    base_url: string;
    timeout_ms: number;
    circuit_breaker_enabled: boolean;
    latency: number;
    circuitBreaker: "closed" | "open" | "half_open";
  }

  const upstreams: UpstreamEntry[] = activeKeys.slice(0, 8).map((key) => ({
    name: key.label || key.persona_id || "unnamed",
    status: "healthy" as const,
    base_url: `soulauth://${key.persona_id}`,
    timeout_ms: 5000,
    circuit_breaker_enabled: true,
    latency: Math.floor(Math.random() * 80) + 10, // Synthetic until real latency tracking
    circuitBreaker: "closed" as const,
  }));

  // Add suspended/revoked keys as degraded/down upstreams
  const suspendedKeys = keys.filter((k) => k.status === "suspended");
  for (const key of suspendedKeys.slice(0, 3)) {
    upstreams.push({
      name: key.label || key.persona_id || "unnamed",
      status: "degraded" as const,
      base_url: `soulauth://${key.persona_id}`,
      timeout_ms: 5000,
      circuit_breaker_enabled: true,
      latency: 0,
      circuitBreaker: "open" as const,
    });
  }

  const revokedKeys = keys.filter((k) => k.status === "revoked");
  for (const key of revokedKeys.slice(0, 2)) {
    upstreams.push({
      name: key.label || key.persona_id || "unnamed",
      status: "down" as const,
      base_url: `soulauth://${key.persona_id}`,
      timeout_ms: 5000,
      circuit_breaker_enabled: false,
      latency: 0,
      circuitBreaker: "open" as const,
    });
  }

  // Top blocked agents
  const agentBlocks = new Map<
    string,
    { persona_id: string; soulkey_id: string; count: number; reason: string; last: string }
  >();
  for (const event of recentBlocked) {
    const key = `${event.persona_id}:${event.reason || "unknown"}`;
    const existing = agentBlocks.get(key);
    if (existing) {
      existing.count++;
      if (event.timestamp > existing.last) existing.last = event.timestamp;
    } else {
      agentBlocks.set(key, {
        persona_id: event.persona_id || "unknown",
        soulkey_id: event.soulkey_id || "",
        count: 1,
        reason: normalizeReasonKey(event.reason || event.event_type || "unknown"),
        last: event.timestamp,
      });
    }
  }
  const blocks = Array.from(agentBlocks.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((b) => ({
      agent: b.persona_id,
      soulkey: b.soulkey_id ? `${b.soulkey_id.substring(0, 12)}...` : "unknown",
      blocked_count: b.count,
      block_reason: b.reason,
      created_at: b.last,
    }));

  // Circuit breakers open = suspended keys count
  const cbOpen = suspendedKeys.length + revokedKeys.length;

  return NextResponse.json({
    metrics: {
      requests_per_min: requestsPerMin,
      blocked_24h: totalBlocked,
      active_upstreams: activeKeys.length,
      circuit_breakers_open: cbOpen,
      hourly_requests: hourlyRequests,
      block_reasons: blockReasons,
    },
    upstreams,
    blocks,
    fetched_at: new Date().toISOString(),
    source: "soulauth-live",
    gateway_healthy: gateHealth?.status === "healthy",
  });
}

/* ---- types ---- */

interface AuditEvent {
  id: string;
  timestamp: string;
  event_type: string;
  persona_id: string;
  soulkey_id?: string;
  resource: string;
  action: string;
  scope: string;
  decision: string;
  reason: string | null;
  context: Record<string, unknown>;
}

interface KeyEntry {
  id: string;
  tenant_id: string;
  persona_id: string;
  label: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  suspended_at: string | null;
  revoked_at: string | null;
}

/* ---- reason normalization ---- */

function normalizeReason(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("scope") || lower.includes("scope_violation"))
    return "Scope Violation";
  if (lower.includes("session")) return "No Active Session";
  if (lower.includes("suspended")) return "Key Suspended";
  if (lower.includes("policy")) return "Policy Denied";
  if (lower.includes("rate") || lower.includes("limit")) return "Rate Limit";
  if (lower.includes("token") || lower.includes("invalid")) return "Token Invalid";
  if (lower.includes("injection")) return "Injection Detected";
  if (lower.includes("geo")) return "Geo Blocked";
  if (lower.includes("ip")) return "IP Blocked";
  return raw.length > 30 ? raw.substring(0, 27) + "..." : raw;
}

function normalizeReasonKey(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("scope")) return "scope_violation";
  if (lower.includes("session")) return "no_session";
  if (lower.includes("suspended")) return "key_suspended";
  if (lower.includes("policy")) return "policy_denied";
  if (lower.includes("rate") || lower.includes("limit")) return "rate_limit";
  if (lower.includes("token") || lower.includes("invalid")) return "token_invalid";
  if (lower.includes("injection")) return "injection";
  if (lower.includes("geo")) return "geo_block";
  if (lower.includes("ip")) return "ip_block";
  return "unknown";
}
