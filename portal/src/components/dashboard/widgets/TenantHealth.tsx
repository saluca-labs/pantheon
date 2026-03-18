"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import WidgetShell from "./WidgetShell";

interface HealthComponent {
  name: string;
  status: string;
  latency_ms?: number;
  details?: Record<string, unknown>;
}

interface HealthResponse {
  status: string;
  components?: Record<string, HealthComponent>;
  uptime_seconds?: number;
  version?: string;
}

interface HealthItem {
  name: string;
  status: string;
  color: string;
  metric: string;
  value: string;
}

function transformHealth(raw: unknown): { overall: string; items: HealthItem[] } {
  const data = raw as HealthResponse;
  const items: HealthItem[] = [];

  if (data.components) {
    for (const [key, comp] of Object.entries(data.components)) {
      const isHealthy = comp.status === "healthy" || comp.status === "ok";
      items.push({
        name: comp.name || key,
        status: comp.status || "unknown",
        color: isHealthy ? "bg-green-400" : comp.status === "degraded" ? "bg-yellow-400" : "bg-red-400",
        metric: comp.latency_ms ? "Latency" : "Status",
        value: comp.latency_ms ? `${comp.latency_ms}ms` : comp.status,
      });
    }
  }

  // If no components in response, build from top-level
  if (items.length === 0) {
    items.push({
      name: "System",
      status: data.status || "unknown",
      color: data.status === "healthy" || data.status === "ok" ? "bg-green-400" : "bg-yellow-400",
      metric: "Uptime",
      value: data.uptime_seconds ? `${Math.floor(data.uptime_seconds / 3600)}h` : "N/A",
    });
  }

  return {
    overall: data.status || "unknown",
    items,
  };
}

export default function TenantHealth() {
  const { data, loading, error, refetch } = useWidgetData({
    endpoint: "/health?detail=true",
    transform: transformHealth,
  });

  const isHealthy = data?.overall === "healthy" || data?.overall === "ok";

  return (
    <WidgetShell title="Tenant Health" loading={loading} error={error} onRetry={refetch}>
      {data && (
        <>
          {/* Overall banner */}
          <div className={`rounded-lg px-3 py-2 mb-4 flex items-center gap-2 ${
            isHealthy
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-yellow-500/10 border border-yellow-500/20"
          }`}>
            <span className={`h-2.5 w-2.5 rounded-full ${isHealthy ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className={`text-xs font-medium ${isHealthy ? "text-green-400" : "text-yellow-400"}`}>
              {isHealthy ? "All Systems Operational" : `Status: ${data.overall}`}
            </span>
          </div>

          {/* Health items */}
          <div className="flex-1 space-y-2.5 min-h-0">
            {data.items.map((item) => (
              <div key={item.name} className="flex items-center justify-between bg-navy-950/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  <div>
                    <div className="text-xs text-foreground-muted">{item.name}</div>
                    <div className="text-[10px] text-foreground-subtle">{item.status}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-foreground">{item.value}</div>
                  <div className="text-[10px] text-foreground-subtle">{item.metric}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </WidgetShell>
  );
}
