"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import WidgetShell from "./WidgetShell";

/** Anomaly chart -- 7-day anomaly bar chart with summary stats. Uses live API via useWidgetData. */

interface Anomaly {
  anomaly_type: string;
  severity: string;
  created_at: string;
  resolved?: boolean;
}

interface ChartData {
  dailyData: { day: string; count: number }[];
  total: number;
  critical: number;
  resolved: number;
}

function transformAnomalies(raw: unknown): ChartData {
  const anomalies = (raw as { anomalies?: Anomaly[] })?.anomalies || (raw as Anomaly[]) || [];

  // Group by day
  const dayMap: Record<string, number> = {};
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Initialize last 7 days
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayMap[days[d.getDay()]] = 0;
  }

  let critical = 0;
  let resolved = 0;

  for (const a of anomalies) {
    const d = new Date(a.created_at);
    const dayName = days[d.getDay()];
    if (dayMap[dayName] !== undefined) {
      dayMap[dayName]++;
    }
    if (a.severity === "critical" || a.severity === "high") critical++;
    if (a.resolved) resolved++;
  }

  const dailyData = Object.entries(dayMap).map(([day, count]) => ({ day, count }));
  const total = anomalies.length;

  return {
    dailyData,
    total,
    critical,
    resolved: resolved || total - critical,
  };
}

export default function AnomalyChart() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { data, loading, error, refetch } = useWidgetData({
    endpoint: "/v1/analytics/anomalies",
    transform: transformAnomalies,
  });

  const maxCount = data ? Math.max(...data.dailyData.map((d) => d.count), 1) : 1;

  return (
    <WidgetShell
      title="Anomaly Detection"
      titleColor="text-of-primary"
      glowClass="glow-teal"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      {data && (
        <>
          {/* Summary stats */}
          <div className="flex gap-4 mb-4">
            {[
              { label: "Total", value: data.total, color: "text-foreground" },
              { label: "Critical", value: data.critical, color: "text-red-400" },
              { label: "Resolved", value: data.resolved, color: "text-green-400" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-of-outline uppercase">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="flex-1 flex items-end gap-2 min-h-[100px]">
            {data.dailyData.map((d, i) => {
              const heightPct = (d.count / maxCount) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 relative">
                  {hoveredIdx === i && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-of-surface-container-high text-xs text-foreground px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 border border-of-primary/20">
                      {d.count} anomalies
                    </div>
                  )}
                  <div
                    className="w-full rounded-t transition-all duration-200 cursor-pointer"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: "4px",
                      background: hoveredIdx === i
                        ? "linear-gradient(to top, #0d9488, #5eead4)"
                        : "linear-gradient(to top, #0d9488, #2dd4bf)",
                      opacity: hoveredIdx === i ? 1 : 0.8,
                    }}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                  <span className="text-[10px] text-of-outline font-mono">{d.day}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </WidgetShell>
  );
}
