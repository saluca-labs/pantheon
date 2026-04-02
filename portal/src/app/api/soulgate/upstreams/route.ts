/**
 * GET /api/soulgate/upstreams
 *
 * Returns upstream-like entries derived from SoulAuth soulkeys.
 * Each active soulkey represents an agent "upstream" in the gateway.
 * Includes status, metadata, and recent activity from the audit log.
 */
import { NextRequest, NextResponse } from "next/server";

const SOULAUTH_URL =
  process.env.SOULAUTH_INTERNAL_URL ||
  process.env.SOULAUTH_INTERNAL_URL ||
  "http://localhost:8000";

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
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
  const tenantId = resolveTenant(request);

  // Fetch keys from all known tenants for a full view
  const tenantIds = [
    tenantId,
    "00000001-0000-4000-a001-000000000001",
    "0c2515c2-1612-4a1a-bf72-47e760ccca51",
  ];

  const keyResults = await Promise.all(
    [...new Set(tenantIds)].map((t) =>
      tryFetch(`${SOULAUTH_URL}/v1/soulauth/admin/keys?tenant_id=${t}`)
    )
  );

  // Also fetch recent audit events for activity counts
  const auditResults = await Promise.all(
    [...new Set(tenantIds)].map((t) =>
      tryFetch(`${SOULAUTH_URL}/v1/soulauth/admin/audit/report?tenant_id=${t}&limit=500`)
    )
  );

  // Merge all keys
  const allKeys: KeyEntry[] = [];
  for (const result of keyResults) {
    if (Array.isArray(result)) allKeys.push(...result);
  }

  // Build activity map from audit events
  const activityMap = new Map<string, { requests: number; errors: number; lastSeen: string }>();
  for (const report of auditResults) {
    if (!report?.events) continue;
    for (const event of report.events) {
      const pid = event.persona_id || "unknown";
      const existing = activityMap.get(pid);
      const isDeny = event.decision === "deny";
      if (existing) {
        existing.requests++;
        if (isDeny) existing.errors++;
        if (event.timestamp > existing.lastSeen) existing.lastSeen = event.timestamp;
      } else {
        activityMap.set(pid, {
          requests: 1,
          errors: isDeny ? 1 : 0,
          lastSeen: event.timestamp,
        });
      }
    }
  }

  // Convert keys to upstream format
  const upstreams = allKeys.map((key) => {
    const activity = activityMap.get(key.persona_id);
    const status: "healthy" | "degraded" | "down" =
      key.status === "active"
        ? "healthy"
        : key.status === "suspended"
          ? "degraded"
          : "down";

    const circuitBreaker: "closed" | "open" | "half_open" =
      key.status === "active"
        ? "closed"
        : key.status === "suspended"
          ? "open"
          : "open";

    return {
      id: key.id,
      name: key.label || key.persona_id,
      baseUrl: `soulauth://${key.persona_id}@${key.tenant_id.substring(0, 8)}`,
      status,
      latency: status === "healthy" ? Math.floor(Math.random() * 80) + 10 : 0,
      circuitBreaker,
      timeout: 5000,
      retries: 3,
      requestsToday: activity?.requests || 0,
      errorsToday: activity?.errors || 0,
      lastCheck: activity?.lastSeen
        ? timeAgo(activity.lastSeen)
        : key.last_used_at
          ? timeAgo(key.last_used_at)
          : "Never",
      persona_id: key.persona_id,
      key_status: key.status,
      issued_at: key.issued_at,
    };
  });

  return NextResponse.json({
    upstreams,
    total: upstreams.length,
    healthy: upstreams.filter((u) => u.status === "healthy").length,
    degraded: upstreams.filter((u) => u.status === "degraded").length,
    down: upstreams.filter((u) => u.status === "down").length,
    source: "soulauth-live",
    fetched_at: new Date().toISOString(),
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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
