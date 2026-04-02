"use client";

import { useMemo, useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { ShieldCheck, ChevronDown, ChevronRight, X } from "lucide-react";

/** Response sanitizer dashboard -- pattern match stats and invocation log. Uses live API via useWidgetData. */

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

type VerdictFilter = "pass" | "warn" | "block" | null;

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
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>(null);
  const [patternFilter, setPatternFilter] = useState<string | null>(null);

  const { data: statsData, loading: statsLoading } = useWidgetData<StatsData>({
    endpoint: "/api/watch/v1/aletheia/tools/summary",
    refreshInterval: 60000,
  });

  const { data: invData, loading: invLoading, error: invError } = useWidgetData<InvocationsData>({
    endpoint: "/api/watch/v1/aletheia/tools/invocations?limit=100",
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

  // Filtered invocations based on verdict and/or pattern filter
  const filteredInvocations = useMemo(() => {
    let result = invocations;
    if (verdictFilter) {
      result = result.filter((i) => i.sanitizer_verdict === verdictFilter);
    }
    if (patternFilter) {
      result = result.filter((i) => i.patterns_matched?.includes(patternFilter));
    }
    return result;
  }, [invocations, verdictFilter, patternFilter]);

  // Blocked responses (unfiltered, for the forensics panel when no filter active)
  const displayInvocations = useMemo(() => {
    if (verdictFilter || patternFilter) return filteredInvocations;
    return invocations.filter((i) => i.sanitizer_verdict === "block");
  }, [invocations, filteredInvocations, verdictFilter, patternFilter]);

  const activeFilter = verdictFilter || patternFilter;

  return (
    <TierGate requiredTier="enterprise" featureLabel="Aletheia Sanitizer">
      <div className="max-w-7xl space-y-6">
        {/* Active Filter Banner */}
        {activeFilter && (
          <div className="flex items-center gap-2 bg-of-primary/10 border border-of-primary/20 rounded-lg px-4 py-2">
            <span className="text-xs text-of-on-surface-variant">Filtering by:</span>
            {verdictFilter && (
              <button
                onClick={() => setVerdictFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-of-primary/20 text-of-primary text-xs font-mono hover:bg-of-primary/30 transition-colors"
              >
                verdict: {verdictFilter}
                <X className="h-3 w-3" />
              </button>
            )}
            {patternFilter && (
              <button
                onClick={() => setPatternFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-of-primary/20 text-of-primary text-xs font-mono hover:bg-of-primary/30 transition-colors"
              >
                pattern: {patternFilter}
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => { setVerdictFilter(null); setPatternFilter(null); }}
              className="text-[10px] text-of-on-surface-variant hover:text-of-on-surface ml-auto"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Verdict Distribution */}
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
            Verdict Distribution
          </p>
          <p className="text-[10px] text-of-on-surface-variant/60 mb-3">Click a verdict to filter invocations below</p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <button
              onClick={() => setVerdictFilter(verdictFilter === "pass" ? null : "pass")}
              className={`bg-emerald-500/10 rounded-xl p-4 text-center border transition-all ${
                verdictFilter === "pass"
                  ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
                  : "border-emerald-500/10 hover:border-emerald-500/30"
              }`}
            >
              <p className="text-3xl font-black tabular-nums text-emerald-400">
                {statsLoading ? <Skeleton /> : verdicts.pass}
              </p>
              <p className="text-[10px] font-bold uppercase text-emerald-400/70 mt-1">Pass</p>
              {verdictTotal > 0 && (
                <p className="text-[10px] text-emerald-400/50 mt-0.5">
                  {((verdicts.pass / verdictTotal) * 100).toFixed(1)}%
                </p>
              )}
            </button>
            <button
              onClick={() => setVerdictFilter(verdictFilter === "warn" ? null : "warn")}
              className={`bg-yellow-500/10 rounded-xl p-4 text-center border transition-all ${
                verdictFilter === "warn"
                  ? "border-yellow-500/50 ring-1 ring-yellow-500/30"
                  : "border-yellow-500/10 hover:border-yellow-500/30"
              }`}
            >
              <p className="text-3xl font-black tabular-nums text-yellow-400">
                {statsLoading ? <Skeleton /> : verdicts.warn}
              </p>
              <p className="text-[10px] font-bold uppercase text-yellow-400/70 mt-1">Warn</p>
              {verdictTotal > 0 && (
                <p className="text-[10px] text-yellow-400/50 mt-0.5">
                  {((verdicts.warn / verdictTotal) * 100).toFixed(1)}%
                </p>
              )}
            </button>
            <button
              onClick={() => setVerdictFilter(verdictFilter === "block" ? null : "block")}
              className={`bg-of-error/10 rounded-xl p-4 text-center border transition-all ${
                verdictFilter === "block"
                  ? "border-of-error/50 ring-1 ring-of-error/30"
                  : "border-of-error/10 hover:border-of-error/30"
              }`}
            >
              <p className="text-3xl font-black tabular-nums text-of-error">
                {statsLoading ? <Skeleton /> : verdicts.block}
              </p>
              <p className="text-[10px] font-bold uppercase text-of-error/70 mt-1">Block</p>
              {verdictTotal > 0 && (
                <p className="text-[10px] text-of-error/50 mt-0.5">
                  {((verdicts.block / verdictTotal) * 100).toFixed(1)}%
                </p>
              )}
            </button>
          </div>
          {verdictTotal > 0 && (
            <div className="h-3 rounded-full overflow-hidden flex bg-of-surface-container-high">
              <button
                onClick={() => setVerdictFilter(verdictFilter === "pass" ? null : "pass")}
                className="bg-emerald-500/60 transition-all hover:bg-emerald-500/80"
                style={{ width: `${(verdicts.pass / verdictTotal) * 100}%` }}
                title={`Pass: ${verdicts.pass}`}
              />
              <button
                onClick={() => setVerdictFilter(verdictFilter === "warn" ? null : "warn")}
                className="bg-yellow-500/60 transition-all hover:bg-yellow-500/80"
                style={{ width: `${(verdicts.warn / verdictTotal) * 100}%` }}
                title={`Warn: ${verdicts.warn}`}
              />
              <button
                onClick={() => setVerdictFilter(verdictFilter === "block" ? null : "block")}
                className="bg-of-error/60 transition-all hover:bg-of-error/80"
                style={{ width: `${(verdicts.block / verdictTotal) * 100}%` }}
                title={`Block: ${verdicts.block}`}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pattern Match Frequency */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
              Pattern Match Frequency
            </p>
            <p className="text-[10px] text-of-on-surface-variant/60 mb-3">Click a pattern to filter matching invocations</p>
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
                  <button
                    key={pf.pattern}
                    onClick={() => setPatternFilter(patternFilter === pf.pattern ? null : pf.pattern)}
                    className={`flex items-center gap-3 w-full text-left rounded-lg px-2 py-1 transition-colors ${
                      patternFilter === pf.pattern
                        ? "bg-of-primary/15 ring-1 ring-of-primary/30"
                        : "hover:bg-of-surface-container-high"
                    }`}
                  >
                    <span className="font-mono text-xs text-of-on-surface w-32 truncate shrink-0" title={pf.pattern}>{pf.pattern}</span>
                    <div className="flex-1 h-5 bg-of-surface-container-high rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          patternFilter === pf.pattern ? "bg-of-primary/50" : "bg-of-primary/30"
                        }`}
                        style={{ width: `${(pf.count / maxPatternCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-of-on-surface-variant w-10 text-right">{pf.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Invocation Detail View */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                {activeFilter ? "Filtered Invocations" : "Blocked Response Details"}
              </p>
              {activeFilter && (
                <span className="text-[10px] text-of-primary font-bold tabular-nums">
                  {displayInvocations.length} results
                </span>
              )}
            </div>
            <div className="bg-of-surface-container-high rounded-lg p-3 text-xs text-of-on-surface-variant mb-3">
              Blocked content details available in invocation detail view below. Click any row to expand.
            </div>
            {invError && <p className="text-of-error text-xs">{invError}</p>}
            {invLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-of-surface-container-high animate-pulse" />
                ))}
              </div>
            )}
            {!invLoading && displayInvocations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
                <ShieldCheck className="h-6 w-6 opacity-30" />
                <p className="text-xs">{activeFilter ? "No matching invocations" : "No blocked responses"}</p>
              </div>
            )}
            {!invLoading && displayInvocations.length > 0 && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {displayInvocations.map((inv) => (
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
                        {inv.sanitizer_verdict && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                            inv.sanitizer_verdict === "block" ? "bg-of-error/15 text-of-error"
                              : inv.sanitizer_verdict === "warn" ? "bg-yellow-500/15 text-yellow-400"
                              : "bg-emerald-500/15 text-emerald-400"
                          }`}>{inv.sanitizer_verdict}</span>
                        )}
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
                        </div>
                        {inv.stderr_hash && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Stderr Hash</p>
                            <p className="font-mono text-xs text-of-on-surface break-all">{inv.stderr_hash}</p>
                          </div>
                        )}
                        {inv.stdout_hash && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Stdout Hash</p>
                            <p className="font-mono text-xs text-of-on-surface break-all">{inv.stdout_hash}</p>
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
    </TierGate>
  );
}
