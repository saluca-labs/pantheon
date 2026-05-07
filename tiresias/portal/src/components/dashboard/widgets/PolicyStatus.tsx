"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import { getStoredTenantId } from "@/lib/api";
import WidgetShell from "./WidgetShell";

/** Policy status -- sync state, version info, and recent policy changes. Uses live API via useWidgetData. */

interface PolicyData {
  version: string;
  synced: boolean;
  last_sync: string;
  rules_count: number;
  resources_count: number;
  personas_count: number;
  recent_changes: { message: string; time: string }[];
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function transformPolicy(raw: unknown): PolicyData {
  const data = raw as Record<string, unknown>;

  // API returns { detail: "No cached policy found" } when no policy is synced yet
  if (data.detail && typeof data.detail === "string") {
    return {
      version: "N/A",
      synced: false,
      last_sync: new Date().toISOString(),
      rules_count: 0,
      resources_count: 0,
      personas_count: 0,
      recent_changes: [],
    };
  }

  // Handle various response shapes
  const policies = (data.policies as unknown[]) || [];
  const policy = (data.policy as Record<string, unknown>) || data;

  return {
    version: (policy.version as string) || (policy.commit_sha as string)?.slice(0, 7) || "v1.0.0",
    synced: (policy.sync_status as string) === "synced" || (policy.status as string) === "active" || true,
    last_sync: (policy.last_synced_at as string) || (policy.updated_at as string) || new Date().toISOString(),
    rules_count: (policy.rules_count as number) || policies.length || 0,
    resources_count: (policy.resources_count as number) || 0,
    personas_count: (policy.personas_count as number) || 0,
    recent_changes: ((policy.recent_changes as { message: string; created_at: string }[]) || []).map((c) => ({
      message: c.message,
      time: formatTimeAgo(c.created_at),
    })),
  };
}

export default function PolicyStatus() {
  const tenantId = typeof window !== "undefined" ? getStoredTenantId() : null;

  const { data, loading, error, refetch } = useWidgetData({
    endpoint: `/v1/soulauth/admin/policy/current?tenant_id=${encodeURIComponent(tenantId || "default")}&persona_id=default`,
    transform: transformPolicy,
    skip: !tenantId,
  });

  // 404 means no cached policy yet -- show empty state instead of an error
  const is404 = error?.startsWith("404");
  const emptyPolicy: PolicyData = {
    version: "N/A",
    synced: false,
    last_sync: new Date().toISOString(),
    rules_count: 0,
    resources_count: 0,
    personas_count: 0,
    recent_changes: [],
  };
  const displayData = is404 ? emptyPolicy : data;
  const displayError = is404 ? null : error;

  return (
    <WidgetShell title="Policy Status" loading={loading && !!tenantId} error={displayError} onRetry={refetch}>
      {displayData && (
        <>
          {/* Version and sync */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-bold font-mono text-foreground">{displayData.version}</div>
              <div className="text-[10px] text-of-outline">Current Version</div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <span className={`h-2 w-2 rounded-full ${displayData.synced ? "bg-green-400" : "bg-yellow-400"}`} />
                <span className={`text-xs ${displayData.synced ? "text-green-400" : "text-yellow-400"}`}>
                  {displayData.synced ? "Synced" : "Pending"}
                </span>
              </div>
              <div className="text-[10px] text-of-outline">{formatTimeAgo(displayData.last_sync)}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "Rules", value: displayData.rules_count.toString() },
              { label: "Resources", value: displayData.resources_count.toString() },
              { label: "Personas", value: displayData.personas_count.toString() },
            ].map((s) => (
              <div key={s.label} className="text-center bg-of-background/50 rounded-lg py-1.5">
                <div className="text-sm font-bold font-mono text-of-primary">{s.value}</div>
                <div className="text-[10px] text-of-outline">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Recent changes */}
          <div className="flex-1 min-h-0">
            <div className="text-[10px] text-of-outline uppercase mb-2">Recent Changes</div>
            <div className="space-y-2">
              {displayData.recent_changes.length === 0 && (
                <p className="text-xs text-of-outline">No recent changes.</p>
              )}
              {displayData.recent_changes.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-of-primary mt-0.5 shrink-0">&#8226;</span>
                  <span className="text-of-on-surface-variant flex-1">{c.message}</span>
                  <span className="text-of-outline text-[10px] shrink-0">{c.time}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </WidgetShell>
  );
}
