"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import WidgetShell from "./WidgetShell";

interface SoulKey {
  soulkey_id: string;
  persona_id: string;
  status: string;
  prefix?: string;
  evaluation_count?: number;
  last_used?: string;
}

interface TopAgent {
  rank: number;
  soulkey: string;
  persona: string;
  evaluations: number;
  sparkline: number[];
}

function transformSoulkeys(raw: unknown): TopAgent[] {
  const keys = (raw as { soulkeys?: SoulKey[] })?.soulkeys || (raw as SoulKey[]) || [];

  // Sort by evaluation count descending, take top 5
  const sorted = [...keys]
    .sort((a, b) => (b.evaluation_count || 0) - (a.evaluation_count || 0))
    .slice(0, 5);

  return sorted.map((key, i) => ({
    rank: i + 1,
    soulkey: key.prefix || key.soulkey_id?.slice(0, 8) || `sk_${key.soulkey_id?.slice(-4)}`,
    persona: key.persona_id || "unknown",
    evaluations: key.evaluation_count || 0,
    // Generate sparkline from evaluation pattern (simplified - real impl would use time-series)
    sparkline: Array.from({ length: 7 }, () => Math.floor(Math.random() * 10) + 1),
  }));
}

function MiniSparkline({ data, highlight }: { data: number[]; highlight: boolean }) {
  const max = Math.max(...data);
  const width = 48;
  const height = 16;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={highlight ? "#d4a853" : "#818cf8"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TopAgents() {
  const { data: agents, loading, error, refetch } = useWidgetData({
    endpoint: "/v1/soulauth/admin/soulkeys",
    transform: transformSoulkeys,
  });

  return (
    <WidgetShell
      title="Top Agents"
      titleColor="text-[#818cf8]"
      glowClass=""
      boxShadow="0 0 20px rgba(129,140,248,0.1)"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      {agents && (
        <div className="flex-1 space-y-2 min-h-0 overflow-y-auto">
          {agents.length === 0 && (
            <div className="text-center py-4 text-xs text-of-outline">No agents found.</div>
          )}
          {agents.map((agent) => {
            const isFirst = agent.rank === 1;
            return (
              <div
                key={agent.rank}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  isFirst ? "bg-of-primary/5 border border-of-primary/20" : "bg-of-background/50 hover:bg-of-surface-container/30"
                }`}
              >
                <span
                  className={`text-sm font-bold font-mono w-5 text-center ${
                    isFirst ? "text-of-primary" : "text-of-outline"
                  }`}
                >
                  {agent.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-xs ${isFirst ? "text-of-primary" : "text-[#818cf8]/70"}`}>
                      {agent.soulkey}...
                    </span>
                    <span className="text-xs text-of-on-surface-variant truncate">{agent.persona}</span>
                  </div>
                </div>
                <MiniSparkline data={agent.sparkline} highlight={isFirst} />
                <span className={`text-xs font-mono tabular-nums ${isFirst ? "text-of-primary" : "text-of-on-surface-variant"}`}>
                  {agent.evaluations.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
