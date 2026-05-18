"use client";

import { useMemo, useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { Terminal, AlertTriangle, ChevronDown, ChevronRight, X } from "lucide-react";

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
  args?: string[];
  working_dir?: string;
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
  top_agents?: AgentStat[];
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
  const [commandFilter, setCommandFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDenyId, setExpandedDenyId] = useState<string | null>(null);

  const { data: invData, loading: invLoading, error: invError } = useWidgetData<InvocationsData>({
    endpoint: "/api/watch/v1/aletheia/tools/invocations?limit=100",
    refreshInterval: 30000,
  });

  const { data: statsData, loading: statsLoading } = useWidgetData<StatsData>({
    endpoint: "/api/watch/v1/aletheia/tools/summary",
    refreshInterval: 60000,
  });

  const invocations: ToolInvocation[] = invData?.invocations ?? (Array.isArray(invData) ? (invData as ToolInvocation[]) : []);
  const topCommands: CommandStat[] = statsData?.top_commands ?? [];
  const agentSummary: AgentStat[] = statsData?.top_agents ?? [];
  const maxCommandCount = topCommands.length > 0 ? Math.max(...topCommands.map((c) => c.count)) : 1;
  const maxAgentCount = agentSummary.length > 0 ? Math.max(...agentSummary.map((a) => a.count)) : 1;

  const denyBlockLog = useMemo(() =>
    invocations.filter((i) => i.policy_verdict === "deny" || i.sanitizer_verdict === "block"),
    [invocations]
  );

  // Filtered invocations based on command or agent filter
  const filteredInvocations = useMemo(() => {
    let result = invocations;
    if (commandFilter) result = result.filter((i) => i.command === commandFilter);
    if (agentFilter) result = result.filter((i) => i.agent_id === agentFilter);
    return result;
  }, [invocations, commandFilter, agentFilter]);

  // Group filtered invocations by hour for timeline
  const groupedByHour = useMemo(() => {
    const groups: Record<string, ToolInvocation[]> = {};
    for (const inv of filteredInvocations) {
      const hour = new Date(inv.timestamp).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: undefined,
      });
      if (!groups[hour]) groups[hour] = [];
      groups[hour].push(inv);
    }
    return Object.entries(groups).slice(0, 10);
  }, [filteredInvocations]);

  const activeFilter = commandFilter || agentFilter;

  return (
      <div className="max-w-7xl space-y-6">
        {/* Active Filter Banner */}
        {activeFilter && (
          <div className="flex items-center gap-2 bg-of-primary/10 border border-of-primary/20 rounded-lg px-4 py-2">
            <span className="text-xs text-of-on-surface-variant">Filtering by:</span>
            {commandFilter && (
              <button
                onClick={() => setCommandFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-of-primary/20 text-of-primary text-xs font-mono hover:bg-of-primary/30 transition-colors"
              >
                cmd: {commandFilter}
                <X className="h-3 w-3" />
              </button>
            )}
            {agentFilter && (
              <button
                onClick={() => setAgentFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-of-primary/20 text-of-primary text-xs font-mono hover:bg-of-primary/30 transition-colors"
              >
                agent: {agentFilter}
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => { setCommandFilter(null); setAgentFilter(null); }}
              className="text-[10px] text-of-on-surface-variant hover:text-of-on-surface ml-auto"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Invocation Timeline */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                Invocation Timeline
              </p>
              {activeFilter && (
                <span className="text-[10px] text-of-primary font-bold tabular-nums">
                  {filteredInvocations.length} results
                </span>
              )}
            </div>
            {invError && <p className="text-of-error text-xs">{invError}</p>}
            {invLoading && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!invLoading && filteredInvocations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
                <Terminal className="h-6 w-6 opacity-30" />
                <p className="text-xs">{activeFilter ? "No matching invocations" : "No invocations recorded"}</p>
              </div>
            )}
            {!invLoading && groupedByHour.length > 0 && (
              <div className="max-h-96 overflow-y-auto space-y-4">
                {groupedByHour.map(([hour, items]) => (
                  <div key={hour}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant/60 mb-2">{hour}</p>
                    <div className="space-y-1.5">
                      {items.map((inv) => (
                        <div key={inv.id}>
                          <div
                            className="flex items-center gap-2 rounded-lg bg-of-surface-container-high px-3 py-2 cursor-pointer hover:bg-of-surface-container-highest transition-colors"
                            onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                          >
                            {expandedId === inv.id ? (
                              <ChevronDown className="h-3 w-3 text-of-on-surface-variant shrink-0" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-of-on-surface-variant shrink-0" />
                            )}
                            <div className={`w-1 h-8 rounded-full shrink-0 ${inv.exit_code === 0 ? "bg-emerald-500" : "bg-of-error"}`} />
                            <div className="min-w-0 flex-1">
                              <span className="font-mono text-sm text-of-on-surface truncate block">{inv.command}</span>
                              <span className="text-of-on-surface-variant text-xs truncate block">{inv.agent_id}</span>
                            </div>
                            <span className="text-[10px] text-of-on-surface-variant shrink-0">{inv.duration_ms}ms</span>
                            <span className="text-[10px] text-of-on-surface-variant/60 shrink-0">{relativeTime(inv.timestamp)}</span>
                          </div>
                          {expandedId === inv.id && (
                            <div className="bg-of-surface-container-low rounded-b-lg px-5 py-3 space-y-2 -mt-0.5 border-t border-of-outline-variant/5">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Command</p>
                                  <p className="font-mono text-xs text-of-on-surface break-all">{inv.command}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Agent</p>
                                  <p className="font-mono text-xs text-of-on-surface">{inv.agent_id}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Duration</p>
                                  <p className="text-xs text-of-on-surface">{inv.duration_ms}ms</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Exit Code</p>
                                  <p className={`text-xs font-mono ${inv.exit_code === 0 ? "text-emerald-400" : "text-of-error"}`}>{inv.exit_code}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Policy Verdict</p>
                                  <p className="text-xs text-of-on-surface">
                                    {inv.policy_verdict ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        inv.policy_verdict === "deny" ? "bg-of-error/15 text-of-error" : "bg-emerald-500/15 text-emerald-400"
                                      }`}>{inv.policy_verdict}</span>
                                    ) : (
                                      <span className="text-of-on-surface-variant/60">n/a</span>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Sanitizer Verdict</p>
                                  <p className="text-xs text-of-on-surface">
                                    {inv.sanitizer_verdict ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        inv.sanitizer_verdict === "block" ? "bg-of-error/15 text-of-error"
                                          : inv.sanitizer_verdict === "warn" ? "bg-yellow-500/15 text-yellow-400"
                                          : "bg-emerald-500/15 text-emerald-400"
                                      }`}>{inv.sanitizer_verdict}</span>
                                    ) : (
                                      <span className="text-of-on-surface-variant/60">n/a</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              {inv.working_dir && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Working Directory</p>
                                  <p className="font-mono text-xs text-of-on-surface break-all">{inv.working_dir}</p>
                                </div>
                              )}
                              {inv.policy_rule_matched && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Policy Rule Matched</p>
                                  <p className="font-mono text-xs text-of-on-surface">{inv.policy_rule_matched}</p>
                                </div>
                              )}
                              {inv.patterns_matched && inv.patterns_matched.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Patterns Matched</p>
                                  <div className="flex flex-wrap gap-1">
                                    {inv.patterns_matched.map((p) => (
                                      <span key={p} className="px-1.5 py-0.5 rounded bg-of-error/15 text-of-error text-[10px] font-mono">{p}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {inv.args && inv.args.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Args</p>
                                  <pre className="font-mono text-xs text-of-on-surface bg-of-surface-container-high rounded p-2 overflow-x-auto">
                                    {JSON.stringify(inv.args, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
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
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
              Command Frequency
            </p>
            <p className="text-[10px] text-of-on-surface-variant/60 mb-3">Click a command to filter the timeline</p>
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
                  <button
                    key={cmd.command}
                    onClick={() => setCommandFilter(commandFilter === cmd.command ? null : cmd.command)}
                    className={`flex items-center gap-3 w-full text-left rounded-lg px-2 py-1 transition-colors ${
                      commandFilter === cmd.command
                        ? "bg-of-primary/15 ring-1 ring-of-primary/30"
                        : "hover:bg-of-surface-container-high"
                    }`}
                  >
                    <span className="font-mono text-xs text-of-on-surface w-28 truncate shrink-0" title={cmd.command}>{cmd.command}</span>
                    <div className="flex-1 h-5 bg-of-surface-container-high rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          commandFilter === cmd.command ? "bg-of-primary/60" : "bg-of-primary/40"
                        }`}
                        style={{ width: `${(cmd.count / maxCommandCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-of-on-surface-variant w-10 text-right">{cmd.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agent Activity Ranking */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
              Agent Activity
            </p>
            <p className="text-[10px] text-of-on-surface-variant/60 mb-3">Click an agent to filter the timeline</p>
            {statsLoading && (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-6 rounded bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!statsLoading && agentSummary.length === 0 && (
              <p className="text-xs text-of-on-surface-variant text-center py-8">No agent data available</p>
            )}
            {!statsLoading && agentSummary.length > 0 && (
              <div className="space-y-2">
                {agentSummary.map((agent) => (
                  <button
                    key={agent.agent_id}
                    onClick={() => setAgentFilter(agentFilter === agent.agent_id ? null : agent.agent_id)}
                    className={`flex items-center gap-3 w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                      agentFilter === agent.agent_id
                        ? "bg-of-primary/15 ring-1 ring-of-primary/30"
                        : "hover:bg-of-surface-container-high"
                    }`}
                  >
                    <span className="font-mono text-xs text-of-on-surface w-32 truncate shrink-0" title={agent.agent_id}>{agent.agent_id}</span>
                    <div className="flex-1 h-5 bg-of-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-400/50 rounded-full transition-all"
                        style={{ width: `${(agent.count / maxAgentCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-of-on-surface-variant w-10 text-right">{agent.count}</span>
                  </button>
                ))}
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
                  <div key={inv.id}>
                    <div
                      className="border-l-2 border-of-error/40 rounded-r-lg bg-of-surface-container-high px-3 py-2.5 cursor-pointer hover:bg-of-surface-container-highest transition-colors"
                      onClick={() => setExpandedDenyId(expandedDenyId === inv.id ? null : inv.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {expandedDenyId === inv.id ? (
                          <ChevronDown className="h-3 w-3 text-of-on-surface-variant shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-of-on-surface-variant shrink-0" />
                        )}
                        <span className="font-mono text-xs text-of-on-surface">{inv.command}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          inv.policy_verdict === "deny"
                            ? "bg-of-error/15 text-of-error"
                            : "bg-orange-500/15 text-orange-400"
                        }`}>
                          {inv.policy_verdict === "deny" ? "deny" : "block"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-of-on-surface-variant ml-5">
                        <span>{inv.agent_id}</span>
                        <span>{inv.policy_rule_matched ?? "sanitizer"}</span>
                        <span>{relativeTime(inv.timestamp)}</span>
                      </div>
                    </div>
                    {expandedDenyId === inv.id && (
                      <div className="bg-of-surface-container-low rounded-b-lg px-5 py-3 space-y-2 -mt-0.5 border-l-2 border-of-error/40">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Command</p>
                            <p className="font-mono text-xs text-of-on-surface break-all">{inv.command}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Agent</p>
                            <p className="font-mono text-xs text-of-on-surface">{inv.agent_id}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Policy Verdict</p>
                            <p className="text-xs text-of-on-surface">
                              {inv.policy_verdict ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  inv.policy_verdict === "deny" ? "bg-of-error/15 text-of-error" : "bg-emerald-500/15 text-emerald-400"
                                }`}>{inv.policy_verdict}</span>
                              ) : (
                                <span className="text-of-on-surface-variant/60">n/a</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Sanitizer Verdict</p>
                            <p className="text-xs text-of-on-surface">
                              {inv.sanitizer_verdict ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  inv.sanitizer_verdict === "block" ? "bg-of-error/15 text-of-error"
                                    : inv.sanitizer_verdict === "warn" ? "bg-yellow-500/15 text-yellow-400"
                                    : "bg-emerald-500/15 text-emerald-400"
                                }`}>{inv.sanitizer_verdict}</span>
                              ) : (
                                <span className="text-of-on-surface-variant/60">n/a</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Timestamp</p>
                            <p className="font-mono text-xs text-of-on-surface">{new Date(inv.timestamp).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Duration</p>
                            <p className="text-xs text-of-on-surface">{inv.duration_ms}ms</p>
                          </div>
                        </div>
                        {inv.policy_rule_matched && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Rule Matched</p>
                            <p className="font-mono text-xs text-of-on-surface">{inv.policy_rule_matched}</p>
                          </div>
                        )}
                        {inv.patterns_matched && inv.patterns_matched.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Patterns Matched</p>
                            <div className="flex flex-wrap gap-1">
                              {inv.patterns_matched.map((p) => (
                                <span key={p} className="px-1.5 py-0.5 rounded bg-of-error/15 text-of-error text-[10px] font-mono">{p}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {inv.args && inv.args.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Args</p>
                            <pre className="font-mono text-xs text-of-on-surface bg-of-surface-container-high rounded p-2 overflow-x-auto">
                              {JSON.stringify(inv.args, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
