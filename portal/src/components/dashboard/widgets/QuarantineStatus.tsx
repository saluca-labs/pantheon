"use client";

import { useCallback } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { api } from "@/lib/api";
import WidgetShell from "./WidgetShell";

/** Quarantine status -- active quarantines with release actions. Uses live API via useWidgetData. */

interface QuarantinedAgent {
  soulkey_id: string;
  soulkey: string;
  reason: string;
  quarantined_at: string;
  action: string;
}

const actionColors: Record<string, string> = {
  suspended: "text-red-400 bg-red-500/10 border-red-500/20",
  rate_limited: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  capabilities_revoked: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function transformQuarantine(raw: unknown): QuarantinedAgent[] {
  const data = raw as { quarantined?: QuarantinedAgent[] } | QuarantinedAgent[];
  if (Array.isArray(data)) return data;
  return data?.quarantined || [];
}

export default function QuarantineStatus() {
  const { data: agents, loading, error, refetch } = useWidgetData({
    endpoint: "/v1/enforcement/quarantine",
    transform: transformQuarantine,
  });

  const handleRelease = useCallback(async (soulkeyId: string) => {
    try {
      await api.post(`/v1/enforcement/quarantine/${soulkeyId}/release`);
      refetch();
    } catch {
      // Error handled silently, widget will refresh
    }
  }, [refetch]);

  const actionLabel = (action: string) =>
    action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <WidgetShell
      title="Quarantine Status"
      titleColor="text-of-primary"
      glowClass="glow-teal"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      {agents && (
        <>
          {/* Big count */}
          <div className="text-center mb-4">
            <div className="text-4xl font-bold font-mono text-red-400">{agents.length}</div>
            <div className="text-xs text-of-outline uppercase mt-1">Agents Quarantined</div>
          </div>

          {/* Agent list */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[260px]">
            {agents.length === 0 && (
              <div className="text-center py-4 text-xs text-of-outline">
                No agents currently quarantined.
              </div>
            )}
            {agents.map((agent) => (
              <div key={agent.soulkey_id || agent.soulkey} className="rounded-lg border border-red-500/10 bg-of-background/50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-of-primary">
                    {(agent.soulkey || agent.soulkey_id || "").slice(0, 8)}...
                  </span>
                  <span className="text-[10px] text-of-outline">
                    {agent.quarantined_at ? formatTimeAgo(agent.quarantined_at) : ""}
                  </span>
                </div>
                <p className="text-xs text-of-on-surface-variant mb-2">{agent.reason}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${actionColors[agent.action] || actionColors.suspended}`}>
                    {actionLabel(agent.action || "suspended")}
                  </span>
                  <button
                    onClick={() => handleRelease(agent.soulkey_id || agent.soulkey)}
                    className="text-[10px] px-2 py-0.5 rounded border border-of-primary/30 text-of-primary hover:bg-of-primary/10 transition-colors cursor-pointer"
                  >
                    Release
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </WidgetShell>
  );
}
