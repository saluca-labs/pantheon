"use client";

import { useEffect, useState } from "react";

/** Agent overview -- fleet stats and recent registrations. Fetches from SoulAuth admin keys API. */

interface AgentStats {
  total: number;
  active: number;
  suspended: number;
  revoked: number;
}

interface RecentAgent {
  name: string;
  persona: string;
  date: string;
}

export default function AgentOverview() {
  const [stats, setStats] = useState<AgentStats>({ total: 0, active: 0, suspended: 0, revoked: 0 });
  const [recent, setRecent] = useState<RecentAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/soulwatch/agents");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();

        setStats({
          total: data.total || 0,
          active: data.active || 0,
          suspended: data.suspended || 0,
          revoked: data.revoked || 0,
        });
        setRecent(
          (data.recent || []).map((a: Record<string, unknown>) => ({
            name: (a.label as string) || (a.persona_id as string) || "unknown",
            persona: (a.persona_id as string) || "",
            date: formatDate(a.issued_at as string),
          }))
        );
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
    const interval = setInterval(fetchAgents, 60000);
    return () => clearInterval(interval);
  }, []);

  const total = stats.total || 1;
  const statCards = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Active", value: stats.active, color: "text-green-400" },
    { label: "Suspended", value: stats.suspended, color: "text-red-400" },
    { label: "Revoked", value: stats.revoked, color: "text-of-primary" },
  ];

  const segments = [
    { pct: (stats.active / total) * 100, color: "#22c55e" },
    { pct: (stats.suspended / total) * 100, color: "#ef4444" },
    { pct: (stats.revoked / total) * 100, color: "#d4a853" },
  ];

  return (
    <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl glow-gold rounded-xl p-4 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-of-primary uppercase tracking-wider mb-3">
        Agent Overview {loading && <span className="text-of-outline font-normal text-[10px]">loading...</span>}
      </h3>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {statCards.map((s) => (
          <div key={s.label} className="text-center bg-of-background/50 rounded-lg py-2 px-1">
            <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-of-outline uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Distribution bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-4 bg-of-surface-container">
        {segments.map((seg, i) => {
          const style = { width: `${seg.pct}%`, backgroundColor: seg.color };
          return <div key={i} style={style} className="transition-all" />;
        })}
      </div>

      {/* Recently registered */}
      <div className="flex-1 min-h-0">
        <div className="text-[10px] text-of-outline uppercase mb-2">Recently Registered</div>
        <div className="space-y-1.5">
          {recent.length === 0 && !loading && (
            <div className="text-of-outline text-center py-2 text-[10px]">No agents registered</div>
          )}
          {recent.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-of-on-surface-variant">{a.name}</span>
                <span className="text-of-outline ml-2 text-[10px]">{a.persona}</span>
              </div>
              <span className="text-of-outline text-[10px]">{a.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
