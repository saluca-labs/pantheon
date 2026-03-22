"use client";

interface AuditEvent {
  timestamp: string;
  type: "EVALUATE" | "KEY_EVENT" | "ANOMALY" | "POLICY";
  message: string;
  result?: "ALLOW" | "DENY";
}

const mockEvents: AuditEvent[] = [
  { timestamp: "14:32:01", type: "EVALUATE", message: "sk_a3f2... \u2192 read:customer-data", result: "ALLOW" },
  { timestamp: "14:31:58", type: "EVALUATE", message: "sk_b7d1... \u2192 write:config", result: "DENY" },
  { timestamp: "14:31:45", type: "KEY_EVENT", message: "sk_c9e4... \u2192 rotated" },
  { timestamp: "14:31:30", type: "EVALUATE", message: "sk_d2a8... \u2192 read:analytics", result: "ALLOW" },
  { timestamp: "14:31:12", type: "ANOMALY", message: "sk_e5f3... \u2192 unusual access pattern" },
  { timestamp: "14:30:55", type: "EVALUATE", message: "sk_f1b9... \u2192 write:audit-log", result: "ALLOW" },
  { timestamp: "14:30:41", type: "EVALUATE", message: "sk_g8c7... \u2192 delete:temp-data", result: "DENY" },
  { timestamp: "14:30:22", type: "POLICY", message: "rule:off-hours-access \u2192 updated" },
  { timestamp: "14:30:08", type: "EVALUATE", message: "sk_h4d6... \u2192 read:user-profiles", result: "ALLOW" },
  { timestamp: "14:29:55", type: "KEY_EVENT", message: "sk_j2e1... \u2192 issued" },
  { timestamp: "14:29:40", type: "EVALUATE", message: "sk_k7a5... \u2192 write:reports", result: "ALLOW" },
  { timestamp: "14:29:22", type: "ANOMALY", message: "sk_a3f2... \u2192 rate spike detected" },
];

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

export default function AuditStream() {
  return (
    <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-4 h-full flex flex-col" style={{ boxShadow: "0 0 20px rgba(129,140,248,0.1)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#818cf8] uppercase tracking-wider">Audit Stream</h3>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-of-outline">Live</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-of-background rounded-lg p-2 font-mono text-[11px] leading-relaxed">
        {mockEvents.map((evt, i) => (
          <div key={i} className="hover:bg-of-surface-container/30 px-1 rounded">
            <span className="text-of-outline">[{evt.timestamp}]</span>{" "}
            <span className={`px-1 rounded ${typeBg[evt.type]} ${typeColors[evt.type]}`}>
              {evt.type.padEnd(9)}
            </span>{" "}
            <span className="text-of-on-surface-variant">{evt.message}</span>
            {evt.result && (
              <>
                {" \u2192 "}
                <span className={resultColors[evt.result]}>{evt.result}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
