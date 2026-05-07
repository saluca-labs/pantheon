"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/display";

/** Sigma matches -- recent Sigma detection rule match table. Fetches from SoulWatch detections API. */

interface SigmaMatch {
  id: string;
  ruleName: string;
  severity: "critical" | "high" | "medium";
  agent: string;
  time: string;
  status: string;
}

const severityColors: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10",
  high: "text-orange-400 bg-orange-500/10",
  medium: "text-yellow-400 bg-yellow-500/10",
  informational: "text-blue-400 bg-blue-500/10",
  low: "text-foreground-subtle bg-foreground-subtle/10",
};

const statusColors: Record<string, string> = {
  Investigating: "text-of-primary bg-of-primary/10 border-of-primary/20",
  Resolved: "text-green-400 bg-green-500/10 border-green-500/20",
  Escalated: "text-red-400 bg-red-500/10 border-red-500/20",
  New: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
};


function mapSeverity(level: string): SigmaMatch["severity"] {
  if (level === "critical") return "critical";
  if (level === "high") return "high";
  return "medium";
}

export default function SigmaMatches() {
  const [matches, setMatches] = useState<SigmaMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetections() {
      try {
        const res = await fetch("/api/soulwatch/dashboard");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const detections = data.detections?.detections || [];
        const mapped: SigmaMatch[] = detections.map((d: Record<string, unknown>) => ({
          id: d.id as string,
          ruleName: (d.rule_title as string) || (d.rule_id as string) || "Unknown Rule",
          severity: mapSeverity(d.level as string),
          agent: ((d.soulkey_id as string) || "—").slice(0, 8),
          time: timeAgo(d.created_at as string),
          status: d.response_playbook ? "Escalated" : "New",
        }));
        setMatches(mapped);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }
    fetchDetections();
    const interval = setInterval(fetchDetections, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl glow-teal rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-of-primary uppercase tracking-wider">Sigma Matches</h3>
        <span className="text-xs text-of-on-surface-variant">
          {loading ? "Loading..." : `${matches.length} rules triggered`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {matches.length === 0 && !loading && (
          <div className="text-of-outline text-center py-4 text-xs">No detection matches</div>
        )}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-of-outline uppercase border-b border-of-outline-variant/15">
              <th className="text-left py-2 font-medium">Rule</th>
              <th className="text-left py-2 font-medium">Sev</th>
              <th className="text-left py-2 font-medium">Agent</th>
              <th className="text-left py-2 font-medium">Time</th>
              <th className="text-left py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-b border-of-outline-variant/15/50 hover:bg-of-surface-container/30 transition-colors">
                <td className="py-2 text-of-on-surface-variant max-w-[140px] truncate">{m.ruleName}</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${severityColors[m.severity] || severityColors.medium}`}>
                    {m.severity === "critical" ? "CRIT" : m.severity.toUpperCase().slice(0, 4)}
                  </span>
                </td>
                <td className="py-2 font-mono text-of-primary/70">{m.agent}...</td>
                <td className="py-2 text-of-outline">{m.time}</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] ${statusColors[m.status] || statusColors.New}`}>
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
