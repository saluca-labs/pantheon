"use client";

import { useMemo, useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";

interface ToolInvocation {
  id: string;
  command: string;
  agent_id: string;
  exit_code: number;
  duration_ms: number;
  timestamp: string;
  sanitizer_verdict?: string | null;
  patterns_matched?: string[];
  stdout_hash?: string;
  stderr_hash?: string;
  args?: string[];
}

interface InvocationsData {
  invocations?: ToolInvocation[];
}

interface StatsData {
  sanitizer_verdicts?: { pass: number; warn: number; block: number };
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

export default function SanitizerPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: statsData, loading: statsLoading } = useWidgetData<StatsData>({
    endpoint: "/watch/v1/aletheia/tools/invocations/stats",
    refreshInterval: 60000,
  });

  const { data: invData, loading: invLoading, error: invError } = useWidgetData<InvocationsData>({
    endpoint: "/watch/v1/aletheia/tools/invocations?limit=100",
    refreshInterval: 30000,
  });

  const invocations: ToolInvocation[] = invData?.invocations ?? (Array.isArray(invData) ? (invData as ToolInvocation[]) : []);
  const verdicts = statsData?.sanitizer_verdicts ?? { pass: 0, warn: 0, block: 0 };
  const verdictTotal = verdicts.pass + verdicts.warn + verdicts.block;

  // Pattern frequency aggregation
  const patternFrequency = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inv of invocations) {
      if (inv.patterns_matched) {
        for (const pattern of inv.patterns_matched) {
          counts[pattern] = (counts[pattern] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count);
  }, [invocations]);

  const maxPatternCount = patternFrequency.length > 0 ? patternFrequency[0].count : 1;

  // Blocked responses
  const blockedResponses = useMemo(
    () => invocations.filter((i) => i.sanitizer_verdict === "block"),
    [invocations]
  );

  return (
    <TierGate requiredTier="enterprise" featureLabel="Aletheia Sanitizer">
      <div className="max-w-7xl space-y-6">
        {/* Verdict Distribution */}
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
            Verdict Distribution
          </p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-emerald-500/10 rounded-xl p-4 text-center border border-emerald-500/10">
              <p className="text-3xl font-black tabular-nums text-emerald-400">
                {statsLoading ? <Skeleton /> : verdicts.pass}
              </p>
              <p className="text-[10px] font-bold uppercase text-emerald-400/70 mt-1">Pass</p>
              {verdictTotal > 0 && (
                <p className="text-[10px] text-emerald-400/50 mt-0.5">
                  {((verdicts.pass / verdictTotal) * 100).toFixed(1)}%
                </p>
              )}
            </div>
            <div className="bg-yellow-500/10 rounded-xl p-4 text-center border border-yellow-500/10">
              <p className="text-3xl font-black tabular-nums text-yellow-400">
                {statsLoading ? <Skeleton /> : verdicts.warn}
              </p>
              <p className="text-[10px] font-bold uppercase text-yellow-400/70 mt-1">Warn</p>
              {verdictTotal > 0 && (
                <p className="text-[10px] text-yellow-400/50 mt-0.5">
                  {((verdicts.warn / verdictTotal) * 100).toFixed(1)}%
                </p>
              )}
            </div>
            <div className="bg-of-error/10 rounded-xl p-4 text-center border border-of-error/10">
              <p className="text-3xl font-black tabular-nums text-of-error">
                {statsLoading ? <Skeleton /> : verdicts.block}
              </p>
              <p className="text-[10px] font-bold uppercase text-of-error/70 mt-1">Block</p>
              {verdictTotal > 0 && (
                <p className="text-[10px] text-of-error/50 mt-0.5">
                  {((verdicts.block / verdictTotal) * 100).toFixed(1)}%
                </p>
              )}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pattern Match Frequency */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Pattern Match Frequency
            </p>
            {invLoading && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-6 rounded bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!invLoading && patternFrequency.length === 0 && (
              <p className="text-xs text-of-on-surface-variant text-center py-8">No pattern matches recorded</p>
            )}
            {!invLoading && patternFrequency.length > 0 && (
              <div className="space-y-2.5">
                {patternFrequency.map((pf) => (
                  <div key={pf.pattern} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-of-on-surface w-32 truncate shrink-0" title={pf.pattern}>{pf.pattern}</span>
                    <div className="flex-1 h-5 bg-of-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full bg-of-primary/30 rounded-full transition-all"
                        style={{ width: `${(pf.count / maxPatternCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-of-on-surface-variant w-10 text-right">{pf.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Blocked Response Forensics */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Blocked Response Forensics
            </p>
            <div className="bg-of-surface-container-high rounded-lg p-3 text-xs text-of-on-surface-variant mb-3">
              Full blocked content available via forensics API
            </div>
            {invError && <p className="text-of-error text-xs">{invError}</p>}
            {invLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!invLoading && blockedResponses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
                <ShieldCheck className="h-6 w-6 opacity-30" />
                <p className="text-xs">No blocked responses</p>
              </div>
            )}
            {!invLoading && blockedResponses.length > 0 && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {blockedResponses.map((inv) => (
                  <div key={inv.id}>
                    <div
                      className="bg-of-surface-container-high rounded-lg px-3 py-2.5 cursor-pointer hover:bg-of-surface-container-highest transition-colors"
                      onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {expandedId === inv.id ? (
                          <ChevronDown className="h-3 w-3 text-of-on-surface-variant shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-of-on-surface-variant shrink-0" />
                        )}
                        <span className="font-mono text-xs text-of-on-surface truncate">{inv.command}</span>
                        <span className="text-[10px] text-of-on-surface-variant ml-auto shrink-0">{relativeTime(inv.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-5">
                        <span className="text-[10px] text-of-on-surface-variant">{inv.agent_id}</span>
                        {inv.patterns_matched && inv.patterns_matched.map((p) => (
                          <span key={p} className="px-1.5 py-0.5 rounded bg-of-error/15 text-of-error text-[10px] font-mono">{p}</span>
                        ))}
                      </div>
                      {inv.stdout_hash && (
                        <p className="font-mono text-[10px] text-of-on-surface-variant/60 ml-5 mt-1 truncate">
                          stdout: {inv.stdout_hash.slice(0, 24)}...
                        </p>
                      )}
                    </div>
                    {expandedId === inv.id && (
                      <div className="bg-of-surface-container-low rounded-b-lg px-5 py-3 space-y-2 -mt-1 border-t border-of-outline-variant/5">
                        {inv.stderr_hash && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Stderr Hash</p>
                            <p className="font-mono text-xs text-of-on-surface break-all">{inv.stderr_hash}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Duration</p>
                          <p className="text-xs text-of-on-surface">{inv.duration_ms}ms</p>
                        </div>
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
    </TierGate>
  );
}
