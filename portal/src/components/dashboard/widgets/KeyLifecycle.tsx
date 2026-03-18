"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import WidgetShell from "./WidgetShell";

interface SoulKeyResponse {
  soulkey_id: string;
  persona_id: string;
  status: string;
  prefix?: string;
  created_at?: string;
  updated_at?: string;
}

interface KeyStats {
  issued: number;
  active: number;
  suspended: number;
  revoked: number;
  timeline: { key: string; event: string; time: string; icon: string }[];
  healthy: boolean;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function transformKeys(raw: unknown): KeyStats {
  const keys = (raw as { soulkeys?: SoulKeyResponse[] })?.soulkeys || (raw as SoulKeyResponse[]) || [];

  const counts = { issued: keys.length, active: 0, suspended: 0, revoked: 0 };
  for (const key of keys) {
    if (key.status === "active") counts.active++;
    else if (key.status === "suspended") counts.suspended++;
    else if (key.status === "revoked") counts.revoked++;
  }

  // Build timeline from most recently updated keys
  const sorted = [...keys].sort(
    (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime(),
  );

  const timeline = sorted.slice(0, 4).map((key) => {
    const prefix = key.prefix || key.soulkey_id?.slice(0, 8) || "sk_????";
    const status = key.status || "active";
    const iconMap: Record<string, string> = {
      active: "+",
      suspended: "\u26A0",
      revoked: "\u2717",
    };
    const eventMap: Record<string, string> = {
      active: `issued for ${key.persona_id || "agent"}`,
      suspended: "suspended (policy violation)",
      revoked: "revoked",
    };
    return {
      key: prefix,
      event: eventMap[status] || `status: ${status}`,
      time: key.updated_at || key.created_at ? formatTimeAgo(key.updated_at || key.created_at!) : "",
      icon: iconMap[status] || "\u2713",
    };
  });

  return {
    ...counts,
    timeline,
    healthy: counts.suspended === 0 || counts.suspended < counts.active * 0.1,
  };
}

export default function KeyLifecycle() {
  const { data, loading, error, refetch } = useWidgetData({
    endpoint: "/v1/soulauth/admin/soulkeys",
    transform: transformKeys,
  });

  return (
    <WidgetShell title="Key Lifecycle" loading={loading} error={error} onRetry={refetch}>
      {data && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: "Issued", value: data.issued, color: "text-foreground" },
              { label: "Active", value: data.active, color: "text-green-400" },
              { label: "Suspended", value: data.suspended, color: "text-orange-400" },
              { label: "Revoked", value: data.revoked, color: "text-red-400" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-foreground-subtle uppercase">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {data.timeline.length === 0 ? (
              <p className="text-xs text-foreground-subtle text-center py-4">No key activity yet.</p>
            ) : (
              <div className="relative pl-4 border-l border-gold-500/20 space-y-3">
                {data.timeline.map((t, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[21px] top-0.5 w-4 h-4 rounded-full bg-navy-900 border border-gold-500/30 flex items-center justify-center text-[8px] text-gold-400">
                      {t.icon}
                    </span>
                    <div className="text-xs">
                      <span className="font-mono text-gold-400/70">{t.key}...</span>
                      <span className="text-foreground-muted ml-1">{t.event}</span>
                    </div>
                    <div className="text-[10px] text-foreground-subtle">{t.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Health indicator */}
          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border">
            <span className={`h-2 w-2 rounded-full ${data.healthy ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className={`text-xs ${data.healthy ? "text-green-400" : "text-yellow-400"}`}>
              {data.healthy ? "Key Infrastructure Healthy" : "Attention: Suspended Keys"}
            </span>
          </div>
        </>
      )}
    </WidgetShell>
  );
}
