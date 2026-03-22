"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import WidgetShell from "./WidgetShell";

type AgentStatus = "active" | "elevated" | "quarantined" | "inactive" | "suspended" | "revoked";

interface AgentNode {
  id: string;
  soulkey: string;
  status: AgentStatus;
}

interface SoulKeyResponse {
  soulkey_id: string;
  persona_id: string;
  status: string;
  prefix?: string;
}

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  active: { color: "#22c55e", label: "Active", bg: "bg-green-400" },
  elevated: { color: "#eab308", label: "Elevated", bg: "bg-yellow-400" },
  quarantined: { color: "#ef4444", label: "Quarantined", bg: "bg-red-400" },
  suspended: { color: "#ef4444", label: "Suspended", bg: "bg-red-400" },
  revoked: { color: "#5a6380", label: "Revoked", bg: "bg-foreground-subtle" },
  inactive: { color: "#5a6380", label: "Inactive", bg: "bg-foreground-subtle" },
};

function transformKeys(raw: unknown): AgentNode[] {
  const keys = (raw as { soulkeys?: SoulKeyResponse[] })?.soulkeys || (raw as SoulKeyResponse[]) || [];

  return keys.map((key) => ({
    id: key.soulkey_id,
    soulkey: key.prefix || key.soulkey_id?.slice(0, 8) || "sk_????",
    status: (key.status as AgentStatus) || "inactive",
  }));
}

export default function AgentFleetMap() {
  const [hoveredAgent, setHoveredAgent] = useState<AgentNode | null>(null);

  const { data: agents, loading, error, refetch } = useWidgetData({
    endpoint: "/v1/soulauth/admin/soulkeys",
    transform: transformKeys,
  });

  return (
    <WidgetShell
      title="Agent Fleet Map"
      titleColor="text-[#818cf8]"
      glowClass=""
      boxShadow="0 0 20px rgba(129,140,248,0.1)"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      {agents && (
        <>
          {/* Grid */}
          <div className="flex-1 flex items-center justify-center min-h-0 relative">
            {hoveredAgent && (
              <div className="absolute top-0 right-0 bg-of-surface-container-high text-xs text-foreground px-2 py-1 rounded shadow-lg z-10 border border-[#818cf8]/20 font-mono">
                {hoveredAgent.soulkey}... ({(statusConfig[hoveredAgent.status] || statusConfig.inactive).label})
              </div>
            )}
            {agents.length === 0 ? (
              <p className="text-xs text-of-outline">No agents registered.</p>
            ) : (
              <div className="grid grid-cols-6 gap-2 p-2">
                {agents.map((agent) => {
                  const cfg = statusConfig[agent.status] || statusConfig.inactive;
                  return (
                    <div
                      key={agent.id}
                      className="relative cursor-pointer transition-transform hover:scale-125"
                      onMouseEnter={() => setHoveredAgent(agent)}
                      onMouseLeave={() => setHoveredAgent(null)}
                    >
                      <div
                        className="w-6 h-6 rounded-full transition-all"
                        style={{
                          backgroundColor: cfg.color,
                          opacity: agent.status === "inactive" || agent.status === "revoked" ? 0.4 : 0.85,
                          boxShadow: agent.status === "quarantined" || agent.status === "suspended" ? `0 0 8px ${cfg.color}` : "none",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-of-outline-variant/15">
            {Object.entries(statusConfig)
              .filter(([key]) => ["active", "elevated", "quarantined", "inactive"].includes(key))
              .map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${cfg.bg}`} />
                  <span className="text-[10px] text-of-outline">{cfg.label}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </WidgetShell>
  );
}
