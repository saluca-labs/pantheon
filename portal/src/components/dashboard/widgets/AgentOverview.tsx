"use client";

const stats = [
  { label: "Total", value: 47, color: "text-foreground" },
  { label: "Active", value: 42, color: "text-green-400" },
  { label: "Suspended", value: 3, color: "text-red-400" },
  { label: "Trial", value: 2, color: "text-gold-400" },
];

const recentAgents = [
  { name: "analytics-agent", persona: "Data Analyst", date: "Mar 17" },
  { name: "compliance-bot", persona: "Auditor", date: "Mar 16" },
  { name: "report-runner", persona: "Reporter", date: "Mar 14" },
];

export default function AgentOverview() {
  const segments = [
    { pct: (42 / 47) * 100, color: "#22c55e" },
    { pct: (3 / 47) * 100, color: "#ef4444" },
    { pct: (2 / 47) * 100, color: "#d4a853" },
  ];

  return (
    <div className="glass-card glow-gold rounded-xl p-4 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-gold-400 uppercase tracking-wider mb-3">Agent Overview</h3>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center bg-navy-950/50 rounded-lg py-2 px-1">
            <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-foreground-subtle uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Distribution bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-4 bg-navy-800">
        {segments.map((seg, i) => {
          const style = { width: `${seg.pct}%`, backgroundColor: seg.color };
          return <div key={i} style={style} className="transition-all" />;
        })}
      </div>

      {/* Recently registered */}
      <div className="flex-1 min-h-0">
        <div className="text-[10px] text-foreground-subtle uppercase mb-2">Recently Registered</div>
        <div className="space-y-1.5">
          {recentAgents.map((a) => (
            <div key={a.name} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-foreground-muted">{a.name}</span>
                <span className="text-foreground-subtle ml-2 text-[10px]">{a.persona}</span>
              </div>
              <span className="text-foreground-subtle text-[10px]">{a.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
