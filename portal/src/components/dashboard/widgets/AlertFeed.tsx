"use client";

import { useState } from "react";

interface Alert {
  id: string;
  timestamp: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  agentKey: string;
}

const mockAlerts: Alert[] = [
  { id: "1", timestamp: "14:32:01", severity: "critical", message: "Anomalous access pattern detected for agent", agentKey: "sk_a3f2" },
  { id: "2", timestamp: "14:28:45", severity: "high", message: "Policy violation: unauthorized resource access", agentKey: "sk_b7d1" },
  { id: "3", timestamp: "14:25:12", severity: "critical", message: "Quarantine triggered: behavioral drift threshold exceeded", agentKey: "sk_c9e4" },
  { id: "4", timestamp: "14:19:33", severity: "medium", message: "Elevated permission request frequency detected", agentKey: "sk_d2a8" },
  { id: "5", timestamp: "14:15:07", severity: "high", message: "Cross-tenant access attempt blocked", agentKey: "sk_e5f3" },
  { id: "6", timestamp: "14:10:22", severity: "low", message: "Scheduled key rotation completed", agentKey: "sk_f1b9" },
  { id: "7", timestamp: "14:05:48", severity: "medium", message: "Unusual data volume in outbound requests", agentKey: "sk_g8c7" },
  { id: "8", timestamp: "14:01:15", severity: "high", message: "Sigma rule match: rapid privilege escalation", agentKey: "sk_h4d6" },
  { id: "9", timestamp: "13:55:30", severity: "low", message: "Agent heartbeat resumed after timeout", agentKey: "sk_j2e1" },
  { id: "10", timestamp: "13:50:44", severity: "medium", message: "Off-hours activity detected for restricted persona", agentKey: "sk_k7a5" },
];

const severityConfig = {
  critical: { color: "bg-red-500", text: "text-red-400", border: "border-red-500/30", label: "CRIT" },
  high: { color: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/20", label: "HIGH" },
  medium: { color: "bg-yellow-500", text: "text-yellow-400", border: "border-yellow-500/20", label: "MED" },
  low: { color: "bg-foreground-subtle", text: "text-of-on-surface-variant", border: "border-foreground-subtle/20", label: "LOW" },
};

export default function AlertFeed() {
  const [alerts] = useState<Alert[]>(mockAlerts);

  return (
    <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl glow-teal rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-of-primary uppercase tracking-wider">Alert Feed</h3>
        <span className="text-xs text-of-on-surface-variant">{alerts.length} events</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
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
