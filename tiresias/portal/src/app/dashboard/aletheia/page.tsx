"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { ShieldCheck, Link2, Activity } from "lucide-react";

/** Aletheia overview -- CoT hash-chain viewer with integrity verification. Uses live API via useWidgetData. */

interface ChainEntry {
  request_id: string;
  model: string;
  provider: string;
  cot_token_count: number;
  timestamp: string;
  chain_hash: string;
}

interface ChainData {
  entries?: ChainEntry[];
  total?: number;
}

interface ToolInvocation {
  id: string;
  command: string;
  agent_id: string;
  exit_code: number;
  duration_ms: number;
  timestamp: string;
  policy_verdict?: string | null;
  policy_rule_matched?: string | null;
  sanitizer_verdict?: string;
}

interface InvocationsData {
  invocations?: ToolInvocation[];
}

interface StatsData {
  sanitizer_verdicts?: { pass: number; warn: number; block: number };
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

export default function AletheiaOverviewPage() {
  const { data: chainData, loading: chainLoading, error: chainError } = useWidgetData<ChainData>({
    endpoint: "/api/watch/v1/aletheia/cot/chain?limit=10",
    refreshInterval: 30000,
  });

  const { data: invocationsData, loading: invLoading, error: invError } = useWidgetData<InvocationsData>({
    endpoint: "/api/watch/v1/aletheia/tools/invocations?limit=20",
    refreshInterval: 30000,
  });

  const { data: statsData, loading: statsLoading } = useWidgetData<StatsData>({
    endpoint: "/api/watch/v1/aletheia/tools/summary",
    refreshInterval: 60000,
  });

  const { data: violationsData, loading: violLoading } = useWidgetData<InvocationsData>({
    endpoint: "/api/watch/v1/aletheia/tools/invocations?limit=50",
    refreshInterval: 30000,
  });

  const entries: ChainEntry[] = chainData?.entries ?? (Array.isArray(chainData) ? (chainData as ChainEntry[]) : []);
  const invocations: ToolInvocation[] = invocationsData?.invocations ?? (Array.isArray(invocationsData) ? (invocationsData as ToolInvocation[]) : []);
  const violations = (violationsData?.invocations ?? (Array.isArray(violationsData) ? (violationsData as ToolInvocation[]) : []))
    .filter((i) => i.policy_verdict && i.policy_verdict !== "allow");

  const verdicts = statsData?.sanitizer_verdicts ?? { pass: 0, warn: 0, block: 0 };
  const verdictTotal = verdicts.pass + verdicts.warn + verdicts.block;

  return (
    <TierGate requiredTier="enterprise" featureLabel="Aletheia Overview">
      <div className="max-w-7xl space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CoT Chain Health */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              CoT Chain Health
            </p>
            {chainError && <p className="text-of-error text-xs">{chainError}</p>}
            <div className="flex items-center gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-of-primary/10">
                <Link2 className="h-5 w-5 text-of-primary" />
              </div>
              <div>
                <p className="text-2xl font-black text-of-on-surface tabular-nums">
                  {chainLoading ? <Skeleton /> : (chainData?.total ?? entries.length)}
                </p>
                <p className="text-[11px] text-of-on-surface-variant">Total chain entries</p>
              </div>
              <div className="ml-auto">
                {chainLoading ? (
                  <Skeleton />
                ) : entries.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    Healthy
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                    Unverified
                  </span>
                )}
              </div>
            </div>
            {entries.length > 0 && (
              <p className="text-[11px] text-of-on-surface-variant">
                Latest entry: <span className="font-mono">{relativeTime(entries[0].timestamp)}</span>
              </p>
            )}
          </div>

          {/* Tool Invocation Timeline */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Tool Invocation Timeline
            </p>
            {invError && <p className="text-of-error text-xs">{invError}</p>}
            {invLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!invLoading && invocations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
                <Activity className="h-6 w-6 opacity-30" />
                <p className="text-xs">No tool invocations recorded</p>
              </div>
            )}
            {!invLoading && invocations.length > 0 && (
              <div className="relative pl-4 border-l-2 border-of-outline-variant/20 space-y-3 max-h-64 overflow-y-auto">
                {invocations.slice(0, 8).map((inv) => (
                  <div key={inv.id} className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-of-on-surface-variant/40" />
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-of-on-surface truncate max-w-[180px]">{inv.command}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${inv.exit_code === 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-of-error/15 text-of-error"}`}>
                        {inv.exit_code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-of-on-surface-variant text-xs truncate">{inv.agent_id}</span>
                      <span className="text-of-on-surface-variant text-[10px]">{relativeTime(inv.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sanitizer Verdicts */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Sanitizer Verdicts
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                <p className="text-xl font-black tabular-nums text-emerald-400">
                  {statsLoading ? <Skeleton /> : verdicts.pass}
                </p>
                <p className="text-[10px] font-bold uppercase text-emerald-400/70">Pass</p>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                <p className="text-xl font-black tabular-nums text-yellow-400">
                  {statsLoading ? <Skeleton /> : verdicts.warn}
                </p>
                <p className="text-[10px] font-bold uppercase text-yellow-400/70">Warn</p>
              </div>
              <div className="bg-of-error/10 rounded-lg p-3 text-center">
                <p className="text-xl font-black tabular-nums text-of-error">
                  {statsLoading ? <Skeleton /> : verdicts.block}
                </p>
                <p className="text-[10px] font-bold uppercase text-of-error/70">Block</p>
              </div>
            </div>
            {verdictTotal > 0 && (
              <div className="h-3 rounded-full overflow-hidden flex bg-of-surface-container-high">
                <div className="bg-emerald-500/60 transition-all" style={{ width: `${(verdicts.pass / verdictTotal) * 100}%` }} />
                <div className="bg-yellow-500/60 transition-all" style={{ width: `${(verdicts.warn / verdictTotal) * 100}%` }} />
                <div className="bg-of-error/60 transition-all" style={{ width: `${(verdicts.block / verdictTotal) * 100}%` }} />
              </div>
            )}
          </div>

          {/* Policy Violations */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Policy Violations
            </p>
            {violLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!violLoading && violations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
                <ShieldCheck className="h-6 w-6 opacity-30" />
                <p className="text-xs">No policy violations detected</p>
              </div>
            )}
            {!violLoading && violations.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-of-outline-variant/10">
                      <th className="text-left py-2 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Command</th>
                      <th className="text-left py-2 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Agent</th>
                      <th className="text-left py-2 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Rule</th>
                      <th className="text-left py-2 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.slice(0, 10).map((v) => (
                      <tr key={v.id} className="border-b border-of-outline-variant/5">
                        <td className="py-2 font-mono text-of-on-surface truncate max-w-[120px]">{v.command}</td>
                        <td className="py-2 text-of-on-surface-variant truncate max-w-[100px]">{v.agent_id}</td>
                        <td className="py-2 font-mono text-of-on-surface-variant">{v.policy_rule_matched ?? "—"}</td>
                        <td className="py-2 text-of-on-surface-variant">{relativeTime(v.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </TierGate>
  );
}
