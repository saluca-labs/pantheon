"use client";

import { useMemo } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { Terminal, AlertTriangle } from "lucide-react";

/** Tool activity monitor -- tracks agent tool invocations with risk flags. Uses live API via useWidgetData. */

interface ToolInvocation {
  id: string;
  command: string;
  agent_id: string;
  exit_code: number;
  duration_ms: number;
  timestamp: string;
  policy_verdict?: string | null;
  sanitizer_verdict?: string | null;
  policy_rule_matched?: string | null;
  patterns_matched?: string[];
}

interface InvocationsData {
  invocations?: ToolInvocation[];
}

interface CommandStat {
  command: string;
  count: number;
}

interface AgentStat {
  agent_id: string;
  count: number;
}

interface StatsData {
  top_commands?: CommandStat[];
  agent_summary?: AgentStat[];
  total_invocations?: number;
}

function Skeleton() {
  return <span className="inline-block w-16 h-5 bg-of-surface-container-high rounded animate-pulse" />;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ToolActivityPage() {
  const { data: invData, loading: invLoading, error: invError } = useWidgetData<InvocationsData>({
    endpoint: "/watch/v1/aletheia/tools/invocations?limit=100",
    refreshInterval: 30000,
  });

  const { data: statsData, loading: statsLoading } = useWidgetData<StatsData>({
    endpoint: "/watch/v1/aletheia/tools/invocations/stats",
    refreshInterval: 60000,
  });

  const invocations: ToolInvocation[] = invData?.invocations ?? (Array.isArray(invData) ? (invData as ToolInvocation[]) : []);
  const topCommands: CommandStat[] = statsData?.top_commands ?? [];
  const agentSummary: AgentStat[] = statsData?.agent_summary ?? [];
  const maxCommandCount = topCommands.length > 0 ? Math.max(...topCommands.map((c) => c.count)) : 1;
  const maxAgentCount = agentSummary.length > 0 ? Math.max(...agentSummary.map((a) => a.count)) : 1;

  const denyBlockLog = useMemo(() =>
    invocations.filter((i) => i.policy_verdict === "deny" || i.sanitizer_verdict === "block"),
    [invocations]
  );

  // Group invocations by hour for timeline
  const groupedByHour = useMemo(() => {
    const groups: Record<string, ToolInvocation[]> = {};
    for (const inv of invocations) {
      const hour = new Date(inv.timestamp).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: undefined,
      });
      if (!groups[hour]) groups[hour] = [];
      groups[hour].push(inv);
    }
    return Object.entries(groups).slice(0, 10);
  }, [invocations]);

  return (
    <TierGate requiredTier="enterprise" featureLabel="Aletheia Tool Activity">
      <div className="max-w-7xl space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Invocation Timeline */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Invocation Timeline
            </p>
            {invError && <p className="text-of-error text-xs">{invError}</p>}
            {invLoading && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!invLoading && invocations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
                <Terminal className="h-6 w-6 opacity-30" />
                <p className="text-xs">No invocations recorded</p>
              </div>
            )}
            {!invLoading && groupedByHour.length > 0 && (
              <div className="max-h-96 overflow-y-auto space-y-4">
                {groupedByHour.map(([hour, items]) => (
                  <div key={hour}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant/60 mb-2">{hour}</p>
                    <div className="space-y-1.5">
                      {items.map((inv) => (
                        <div key={inv.id} className="flex items-center gap-2 rounded-lg bg-of-surface-container-high px-3 py-2">
                          <div className={`w-1 h-8 rounded-full shrink-0 ${inv.exit_code === 0 ? "bg-emerald-500" : "bg-of-error"}`} />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-sm text-of-on-surface truncate block">{inv.command}</span>
                            <span className="text-of-on-surface-variant text-xs truncate block">{inv.agent_id}</span>
                          </div>
                          <span className="text-[10px] text-of-on-surface-variant shrink-0">{inv.duration_ms}ms</span>
                          <span className="text-[10px] text-of-on-surface-variant/60 shrink-0">{relativeTime(inv.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Command Frequency */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Command Frequency
            </p>
            {statsLoading && (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-6 rounded bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!statsLoading && topCommands.length === 0 && (
              <p className="text-xs text-of-on-surface-variant text-center py-8">No command data available</p>
            )}
            {!statsLoading && topCommands.length > 0 && (
              <div className="space-y-2.5">
                {topCommands.slice(0, 10).map((cmd) => (
                  <div key={cmd.command} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-of-on-surface w-28 truncate shrink-0" title={cmd.command}>{cmd.command}</span>
                    <div className="flex-1 h-5 bg-of-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full bg-of-primary/40 rounded-full transition-all"
                        style={{ width: `${(cmd.count / maxCommandCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-of-on-surface-variant w-10 text-right">{cmd.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent Heatmap */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Agent Heatmap
            </p>
            {statsLoading && (
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!statsLoading && agentSummary.length === 0 && (
              <p className="text-xs text-of-on-surface-variant text-center py-8">No agent data available</p>
            )}
            {!statsLoading && agentSummary.length > 0 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {agentSummary.map((agent) => {
                  const opacity = Math.max(0.1, Math.min(0.8, agent.count / maxAgentCount));
                  return (
                    <div
                      key={agent.agent_id}
                      className="rounded-lg p-2 text-center border border-of-outline-variant/5 cursor-default"
                      style={{ backgroundColor: `rgba(90, 218, 206, ${opacity})` }}
                      title={`${agent.agent_id}: ${agent.count} invocations`}
                    >
                      <p className="text-[9px] font-mono text-of-on-surface truncate">{agent.agent_id.slice(0, 8)}</p>
                      <p className="text-xs font-bold tabular-nums text-of-on-surface">{agent.count}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Deny/Block Log */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Deny / Block Log
            </p>
            {invLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!invLoading && denyBlockLog.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
                <AlertTriangle className="h-6 w-6 opacity-30" />
                <p className="text-xs">No denied or blocked invocations</p>
              </div>
            )}
            {!invLoading && denyBlockLog.length > 0 && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {denyBlockLog.map((inv) => (
                  <div key={inv.id} className="border-l-2 border-of-error/40 rounded-r-lg bg-of-surface-container-high px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-of-on-surface">{inv.command}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        inv.policy_verdict === "deny"
                          ? "bg-of-error/15 text-of-error"
                          : "bg-orange-500/15 text-orange-400"
                      }`}>
                        {inv.policy_verdict === "deny" ? "deny" : "block"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-of-on-surface-variant">
                      <span>{inv.agent_id}</span>
                      <span>{inv.policy_rule_matched ?? "sanitizer"}</span>
                      <span>{relativeTime(inv.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </TierGate>
  );
}
