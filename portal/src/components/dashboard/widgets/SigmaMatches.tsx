"use client";

/** Sigma matches -- recent Sigma detection rule match table. Uses hardcoded mock data. */

interface SigmaMatch {
  id: string;
  ruleName: string;
  severity: "critical" | "high" | "medium";
  agent: string;
  time: string;
  status: "Investigating" | "Resolved" | "Escalated";
}

const mockMatches: SigmaMatch[] = [
  { id: "1", ruleName: "Excessive Permission Requests", severity: "high", agent: "sk_a3f2", time: "12m ago", status: "Investigating" },
  { id: "2", ruleName: "Off-Hours Activity", severity: "medium", agent: "sk_k7a5", time: "34m ago", status: "Escalated" },
  { id: "3", ruleName: "Rapid Key Rotation", severity: "high", agent: "sk_b7d1", time: "1h ago", status: "Resolved" },
  { id: "4", ruleName: "Cross-Tenant Access Attempt", severity: "critical", agent: "sk_e5f3", time: "2h ago", status: "Investigating" },
  { id: "5", ruleName: "Unusual Data Volume", severity: "medium", agent: "sk_g8c7", time: "3h ago", status: "Resolved" },
  { id: "6", ruleName: "Privilege Escalation Pattern", severity: "high", agent: "sk_h4d6", time: "5h ago", status: "Resolved" },
];

const severityColors = {
  critical: "text-red-400 bg-red-500/10",
  high: "text-orange-400 bg-orange-500/10",
  medium: "text-yellow-400 bg-yellow-500/10",
};

const statusColors = {
  Investigating: "text-of-primary bg-of-primary/10 border-of-primary/20",
  Resolved: "text-green-400 bg-green-500/10 border-green-500/20",
  Escalated: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function SigmaMatches() {
  return (
    <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl glow-teal rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-of-primary uppercase tracking-wider">Sigma Matches</h3>
        <span className="text-xs text-of-on-surface-variant">{mockMatches.length} rules triggered</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
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
            {mockMatches.map((m) => (
              <tr key={m.id} className="border-b border-of-outline-variant/15/50 hover:bg-of-surface-container/30 transition-colors">
                <td className="py-2 text-of-on-surface-variant max-w-[140px] truncate">{m.ruleName}</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${severityColors[m.severity]}`}>
                    {m.severity === "critical" ? "CRIT" : m.severity.toUpperCase().slice(0, 4)}
                  </span>
                </td>
                <td className="py-2 font-mono text-of-primary/70">{m.agent}...</td>
                <td className="py-2 text-of-outline">{m.time}</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] ${statusColors[m.status]}`}>
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
