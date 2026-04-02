"use client";

import { useEffect, useState } from "react";

/** Audit stream -- terminal-style live audit event log. Fetches from SoulAuth audit API. */

interface AuditEvent {
  timestamp: string;
  type: "EVALUATE" | "KEY_EVENT" | "ANOMALY" | "POLICY";
  message: string;
  result?: "ALLOW" | "DENY";
}

const typeColors: Record<string, string> = {
  EVALUATE: "text-of-outline",
  KEY_EVENT: "text-of-primary",
  ANOMALY: "text-orange-400",
  POLICY: "text-[#818cf8]",
};

const typeBg: Record<string, string> = {
  EVALUATE: "bg-foreground-subtle/10",
  KEY_EVENT: "bg-of-primary/10",
  ANOMALY: "bg-orange-500/10",
  POLICY: "bg-[#818cf8]/10",
};

const resultColors: Record<string, string> = {
  ALLOW: "text-green-400",
  DENY: "text-red-400",
};

function mapEventType(eventType: string): AuditEvent["type"] {
  if (eventType.startsWith("auth_")) return "EVALUATE";
  if (eventType.includes("key_")) return "KEY_EVENT";
  if (eventType.includes("anomal") || eventType.includes("scope_violation")) return "ANOMALY";
  if (eventType.includes("capability")) return "POLICY";
  return "EVALUATE";
}

function mapDecision(decision: string | null, eventType: string): "ALLOW" | "DENY" | undefined {
  if (eventType === "auth_grant" || eventType === "capability_issued" || eventType === "capability_used") return "ALLOW";
  if (eventType === "auth_deny" || eventType === "scope_violation") return "DENY";
  if (decision === "grant" || decision === "allow") return "ALLOW";
  if (decision === "deny") return "DENY";
  return undefined;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "??:??:??";
  }
}

export default function AuditStream() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAudit() {
      try {
        const res = await fetch("/api/soulwatch/audit");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const mapped: AuditEvent[] = (data.events || []).map((e: Record<string, unknown>) => ({
          timestamp: formatTime(e.timestamp as string),
          type: mapEventType(e.event_type as string),
          message: `${(e.persona_id as string) || "unknown"} → ${(e.action as string) || (e.event_type as string)}${e.resource ? `:${e.resource}` : ""}`,
          result: mapDecision(e.decision as string | null, e.event_type as string),
        }));
        setEvents(mapped);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    fetchAudit();
    const interval = setInterval(fetchAudit, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-4 max-h-[400px] flex flex-col" style={{ boxShadow: "0 0 20px rgba(129,140,248,0.1)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#818cf8] uppercase tracking-wider">Audit Stream</h3>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${loading ? "bg-yellow-400" : "bg-green-400"} animate-pulse`} />
          <span className="text-[10px] text-of-outline">{loading ? "Loading" : "Live"}</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-of-background rounded-lg p-2 font-mono text-[11px] leading-relaxed">
        {events.length === 0 && !loading && (
          <div className="text-of-outline text-center py-4">No audit events yet</div>
        )}
        {events.map((evt, i) => (
          <div key={i} className="hover:bg-of-surface-container/30 px-1 rounded">
            <span className="text-of-outline">[{evt.timestamp}]</span>{" "}
            <span className={`px-1 rounded ${typeBg[evt.type]} ${typeColors[evt.type]}`}>
              {evt.type.padEnd(9)}
            </span>{" "}
            <span className="text-of-on-surface-variant">{evt.message}</span>
            {evt.result && (
              <>
                {" → "}
                <span className={resultColors[evt.result]}>{evt.result}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
