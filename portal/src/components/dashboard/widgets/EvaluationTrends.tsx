"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import WidgetShell from "./WidgetShell";

interface AuditEvent {
  event_type: string;
  decision?: string;
  resource?: string;
  created_at: string;
}

interface TrendData {
  dailyData: { day: string; allowed: number; denied: number }[];
  topDenied: { resource: string; count: number }[];
  allowRate: string;
  denyRate: string;
}

function transformAudit(raw: unknown): TrendData {
  const events = (raw as { events?: AuditEvent[] })?.events || (raw as AuditEvent[]) || [];

  // Group by day of week
  const dayMap: Record<string, { allowed: number; denied: number }> = {};
  const deniedResources: Record<string, number> = {};
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Initialize last 7 days
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayName = days[d.getDay()];
    dayMap[dayName] = { allowed: 0, denied: 0 };
  }

  for (const event of events) {
    const d = new Date(event.created_at);
    const dayName = days[d.getDay()];
    if (!dayMap[dayName]) dayMap[dayName] = { allowed: 0, denied: 0 };

    if (event.decision === "DENY" || event.decision === "deny") {
      dayMap[dayName].denied++;
      if (event.resource) {
        deniedResources[event.resource] = (deniedResources[event.resource] || 0) + 1;
      }
    } else {
      dayMap[dayName].allowed++;
    }
  }

  const dailyData = Object.entries(dayMap).map(([day, counts]) => ({
    day,
    ...counts,
  }));

  const totalAllowed = dailyData.reduce((s, d) => s + d.allowed, 0);
  const totalDenied = dailyData.reduce((s, d) => s + d.denied, 0);
  const total = totalAllowed + totalDenied;

  const topDenied = Object.entries(deniedResources)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([resource, count]) => ({ resource, count }));

  return {
    dailyData,
    topDenied,
    allowRate: total > 0 ? ((totalAllowed / total) * 100).toFixed(1) : "100.0",
    denyRate: total > 0 ? ((totalDenied / total) * 100).toFixed(1) : "0.0",
  };
}

export default function EvaluationTrends() {
  const { data, loading, error, refetch } = useWidgetData({
    endpoint: "/v1/soulauth/admin/audit?event_type=access_evaluated",
    transform: transformAudit,
  });

  const maxVal = data ? Math.max(...data.dailyData.map((d) => d.allowed + d.denied), 1) : 1;

  return (
    <WidgetShell
      title="Evaluation Trends"
      titleColor="text-[#818cf8]"
      glowClass=""
      boxShadow="0 0 20px rgba(129,140,248,0.1)"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      {data && (
        <>
          {/* Summary */}
          <div className="flex gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-xs text-foreground-muted">Allow rate: <span className="text-green-400 font-mono">{data.allowRate}%</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-xs text-foreground-muted">Deny rate: <span className="text-red-400 font-mono">{data.denyRate}%</span></span>
            </div>
          </div>

          {/* Stacked chart */}
          <div className="flex-1 flex items-end gap-2 min-h-[80px] mb-3">
            {data.dailyData.map((d) => {
              const total = d.allowed + d.denied;
              const totalPct = (total / maxVal) * 100;
              const denyPct = total > 0 ? (d.denied / total) * 100 : 0;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t overflow-hidden relative"
                    style={{ height: `${totalPct}%`, minHeight: "4px" }}
                  >
                    <div
                      className="absolute bottom-0 w-full"
                      style={{
                        height: `${100 - denyPct}%`,
                        background: "linear-gradient(to top, #166534, #22c55e)",
                        opacity: 0.7,
                      }}
                    />
                    <div
                      className="absolute top-0 w-full"
                      style={{
                        height: `${denyPct}%`,
                        background: "linear-gradient(to top, #ef4444, #dc2626)",
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-foreground-subtle font-mono">{d.day}</span>
                </div>
              );
            })}
          </div>

          {/* Top denied */}
          {data.topDenied.length > 0 && (
            <div className="border-t border-border pt-2">
              <div className="text-[10px] text-foreground-subtle uppercase mb-1">Top Denied Resources</div>
              {data.topDenied.map((r) => (
                <div key={r.resource} className="flex items-center justify-between text-xs py-0.5">
                  <span className="font-mono text-red-400/70">{r.resource}</span>
                  <span className="text-foreground-subtle">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </WidgetShell>
  );
}
