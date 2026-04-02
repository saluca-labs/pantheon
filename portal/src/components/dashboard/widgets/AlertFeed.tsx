"use client";

import { useEffect, useState } from "react";

/** Alert feed -- live security alert stream with severity indicators. Fetches from SoulWatch anomalies API. */

interface Alert {
  id: string;
  timestamp: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  agentKey: string;
}

const severityConfig = {
  critical: { color: "bg-red-500", text: "text-red-400", border: "border-red-500/30", label: "CRIT" },
  high: { color: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/20", label: "HIGH" },
  medium: { color: "bg-yellow-500", text: "text-yellow-400", border: "border-yellow-500/20", label: "MED" },
  low: { color: "bg-foreground-subtle", text: "text-of-on-surface-variant", border: "border-foreground-subtle/20", label: "LOW" },
};

function mapSeverity(s: string): Alert["severity"] {
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "??:??:??";
  }
}

export default function AlertFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/soulwatch/dashboard");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const anomalies = data.anomalies?.anomalies || [];
        const mapped: Alert[] = anomalies.slice(0, 20).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          timestamp: formatTime(a.created_at as string),
          severity: mapSeverity(a.severity as string),
          message: (a.description as string) || `${a.anomaly_type} anomaly detected`,
          agentKey: ((a.soulkey_id as string) || "unknown").slice(0, 8),
        }));
        setAlerts(mapped);
      } catch {
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl glow-teal rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-of-primary uppercase tracking-wider">Alert Feed</h3>
        <span className="text-xs text-of-on-surface-variant">
          {loading ? "Loading..." : `${alerts.length} events`}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
        {alerts.length === 0 && !loading && (
          <div className="text-of-outline text-center py-4 text-xs">No anomalies detected</div>
        )}
        {alerts.map((alert) => {
          const cfg = severityConfig[alert.severity];
          return (
            <div
              key={alert.id}
              className={`relative rounded-lg border ${cfg.border} bg-of-background/50 px-3 py-2 transition-colors hover:bg-of-surface-container/40`}
            >
              {alert.severity === "critical" && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              )}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-of-outline">{alert.timestamp}</span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.color}/20 ${cfg.text}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-xs text-of-on-surface-variant leading-relaxed">
                {alert.message}{" "}
                <span className="font-mono text-of-primary/70">{alert.agentKey}...</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
