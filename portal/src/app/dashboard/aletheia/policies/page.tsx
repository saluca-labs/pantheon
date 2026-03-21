"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Play, RefreshCw, CheckCircle, XCircle, AlertTriangle, FileCode } from "lucide-react";

interface EvalResult {
  verdict: string;
  matched_rule?: string;
  reason?: string;
}

interface ToolInvocation {
  id: string;
  command: string;
  agent_id: string;
  timestamp: string;
  policy_verdict?: string | null;
}

interface InvocationsData {
  invocations?: ToolInvocation[];
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

export default function PoliciesPage() {
  const { session } = useAuth();
  const [yamlContent, setYamlContent] = useState("# Paste your tool policy YAML here\n# See docs for policy schema\n");
  const [reloadStatus, setReloadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [reloadLoading, setReloadLoading] = useState(false);

  // Evaluation simulator state
  const [evalAgentId, setEvalAgentId] = useState("");
  const [evalTenantId, setEvalTenantId] = useState(session?.tenant_id ?? "");
  const [evalCommand, setEvalCommand] = useState("");
  const [evalArgs, setEvalArgs] = useState("[]");
  const [evalWorkDir, setEvalWorkDir] = useState("/");
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const { data: recentData, loading: recentLoading } = useWidgetData<InvocationsData>({
    endpoint: "/watch/v1/aletheia/tools/invocations?limit=20",
    refreshInterval: 30000,
  });

  const recentEvals = (recentData?.invocations ?? (Array.isArray(recentData) ? (recentData as ToolInvocation[]) : []))
    .filter((i) => i.policy_verdict != null);

  async function handleReload() {
    setReloadLoading(true);
    setReloadStatus(null);
    try {
      await api.post("/v1/aletheia/tool/reload", {});
      setReloadStatus({ type: "success", message: "Policies reloaded successfully" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setReloadStatus({ type: "error", message });
    } finally {
      setReloadLoading(false);
    }
  }

  async function handleEvaluate() {
    setEvalLoading(true);
    setEvalResult(null);
    try {
      let parsedArgs: unknown[];
      try {
        parsedArgs = JSON.parse(evalArgs);
      } catch {
        parsedArgs = [];
      }
      const result = await api.post("/v1/aletheia/tool/evaluate", {
        agent_id: evalAgentId,
        tenant_id: evalTenantId,
        command: evalCommand,
        args: parsedArgs,
        working_directory: evalWorkDir,
      });
      setEvalResult(result as EvalResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Evaluation failed";
      setEvalResult({ verdict: "error", reason: message });
    } finally {
      setEvalLoading(false);
    }
  }

  const verdictStyles: Record<string, string> = {
    allow: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    deny: "bg-of-error/15 text-of-error border border-of-error/20",
    audit: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
    error: "bg-of-error/15 text-of-error border border-of-error/20",
  };

  return (
    <TierGate requiredTier="enterprise" featureLabel="Aletheia Policy Editor">
      <div className="max-w-7xl space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* YAML Policy Editor */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Policy YAML
            </p>
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              className="w-full min-h-[300px] bg-of-surface-container-high text-of-on-surface font-mono text-sm p-4 rounded-lg border border-of-outline-variant/10 resize-y focus:outline-none focus:border-of-primary/40 transition-colors"
              spellCheck={false}
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleReload}
                disabled={reloadLoading}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reloadLoading ? "animate-spin" : ""}`} />
                {reloadLoading ? "Reloading..." : "Reload Policies"}
              </button>
              <button
                disabled
                className="flex items-center gap-2 h-9 px-4 rounded-lg border border-of-outline-variant/20 text-of-on-surface-variant/40 text-xs font-bold cursor-not-allowed"
                title="GET policy endpoint planned for future phase"
              >
                Save
              </button>
            </div>
            {reloadStatus && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
                reloadStatus.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-of-error/10 text-of-error border border-of-error/20"
              }`}>
                {reloadStatus.message}
              </div>
            )}
            <div className="bg-of-surface-container-high rounded-lg p-3 text-xs text-of-on-surface-variant mt-3">
              Policy files are loaded from disk. Use Reload to pick up changes.
            </div>
          </div>

          {/* Evaluation Simulator */}
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
              Evaluation Simulator
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Agent ID</label>
                <input
                  value={evalAgentId}
                  onChange={(e) => setEvalAgentId(e.target.value)}
                  placeholder="agent-001"
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/10 rounded-lg text-sm text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Tenant ID</label>
                <input
                  value={evalTenantId}
                  onChange={(e) => setEvalTenantId(e.target.value)}
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/10 rounded-lg text-sm font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Command</label>
                <input
                  value={evalCommand}
                  onChange={(e) => setEvalCommand(e.target.value)}
                  placeholder="bash"
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/10 rounded-lg text-sm font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Args (JSON)</label>
                <textarea
                  value={evalArgs}
                  onChange={(e) => setEvalArgs(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-of-surface-container-high border border-of-outline-variant/10 rounded-lg text-sm font-mono text-of-on-surface placeholder:text-of-on-surface-variant/40 focus:outline-none focus:border-of-primary/40 resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">Working Directory</label>
                <input
                  value={evalWorkDir}
                  onChange={(e) => setEvalWorkDir(e.target.value)}
                  className="w-full h-9 px-3 bg-of-surface-container-high border border-of-outline-variant/10 rounded-lg text-sm font-mono text-of-on-surface focus:outline-none focus:border-of-primary/40"
                />
              </div>
              <button
                onClick={handleEvaluate}
                disabled={evalLoading || !evalCommand.trim()}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 transition-colors text-xs font-bold disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" />
                {evalLoading ? "Evaluating..." : "Evaluate"}
              </button>
            </div>

            {/* Eval result */}
            {evalResult && (
              <div className="mt-4 bg-of-surface-container-high rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {evalResult.verdict === "allow" ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  ) : evalResult.verdict === "audit" ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-of-error" />
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${verdictStyles[evalResult.verdict] ?? verdictStyles.error}`}>
                    {evalResult.verdict}
                  </span>
                </div>
                {evalResult.matched_rule && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Matched Rule</p>
                    <p className="font-mono text-xs text-of-on-surface">{evalResult.matched_rule}</p>
                  </div>
                )}
                {evalResult.reason && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-0.5">Reason</p>
                    <p className="text-xs text-of-on-surface">{evalResult.reason}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent Evaluations */}
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
            Recent Policy Evaluations
          </p>
          {recentLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-of-surface-container-high animate-pulse" />
              ))}
            </div>
          )}
          {!recentLoading && recentEvals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-of-on-surface-variant gap-2">
              <FileCode className="h-6 w-6 opacity-30" />
              <p className="text-xs">No policy evaluations recorded</p>
            </div>
          )}
          {!recentLoading && recentEvals.length > 0 && (
            <div className="space-y-1.5">
              {recentEvals.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 px-3 py-2 bg-of-surface-container-high rounded-lg">
                  <span className="text-[10px] text-of-on-surface-variant shrink-0">{relativeTime(inv.timestamp)}</span>
                  <span className="text-xs text-of-on-surface-variant truncate">{inv.agent_id}</span>
                  <span className="font-mono text-xs text-of-on-surface truncate">{inv.command}</span>
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    verdictStyles[inv.policy_verdict ?? ""] ?? "bg-of-surface-container text-of-on-surface-variant"
                  }`}>
                    {inv.policy_verdict}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TierGate>
  );
}
