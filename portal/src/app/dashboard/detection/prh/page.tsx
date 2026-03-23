"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { ShieldAlert, TrendingUp, AlertTriangle, Settings, X, CheckCircle } from "lucide-react";

/** PRH (Proactive Risk Heuristics) dashboard -- risk scoring and flagged agents. Uses live API via useWidgetData. */

interface PRHStats {
  tenant_id: string;
  total_scored: number;
  flagged_count: number;
  avg_score: number;
  category_breakdown: Record<string, number>;
}

interface PRHResult {
  score: number;
  flagged: boolean;
  category: string | null;
  patterns_matched: string[];
  confidence: number;
  timestamp: string;
  prompt_preview?: string;
}

interface PRHRecentData {
  tenant_id: string;
  count: number;
  results: PRHResult[];
}

interface PRHConfig {
  enabled: boolean;
  threshold: number;
  auto_quarantine_threshold: number;
  enabled_categories: string[];
}

interface PRHConfigData {
  tenant_id: string;
  config: PRHConfig;
}

const CATEGORY_LABELS: Record<string, string> = {
  injection: "Injection",
  jailbreak: "Jailbreak",
  data_exfiltration: "Data Exfil",
  pii_leakage: "PII Leakage",
  instruction_override: "Instr. Override",
  role_manipulation: "Role Manip.",
};

const CATEGORY_COLORS: Record<string, string> = {
  injection: "bg-of-error/20 text-of-error border-of-error/30",
  jailbreak: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  data_exfiltration: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  pii_leakage: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  instruction_override: "bg-of-primary/15 text-of-primary border-of-primary/20",
  role_manipulation: "bg-pink-500/15 text-pink-400 border-pink-500/20",
};

const CATEGORY_DOT: Record<string, string> = {
  injection: "bg-of-error",
  jailbreak: "bg-orange-400",
  data_exfiltration: "bg-purple-400",
  pii_leakage: "bg-yellow-400",
  instruction_override: "bg-of-primary",
  role_manipulation: "bg-pink-400",
};

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-of-error";
  if (score >= 0.4) return "text-yellow-400";
  return "text-emerald-400";
}

function scoreBarColor(score: number): string {
  if (score >= 0.7) return "bg-of-error";
  if (score >= 0.4) return "bg-yellow-400";
  return "bg-emerald-400";
}

export default function PRHDashboardPage() {
  const [showConfig, setShowConfig] = useState(false);
  const [configThreshold, setConfigThreshold] = useState<string>("");
  const [configAqThreshold, setConfigAqThreshold] = useState<string>("");
  const [configEnabled, setConfigEnabled] = useState<boolean | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configResult, setConfigResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { data: statsData, loading: statsLoading } = useWidgetData<PRHStats>({
    endpoint: "/v1/prh/stats",
    refreshInterval: 30000,
  });

  const { data: recentData, loading: recentLoading } = useWidgetData<PRHRecentData>({
    endpoint: "/v1/prh/recent?limit=50",
    refreshInterval: 30000,
  });

  const { data: configData, loading: configLoading, refetch: refetchConfig } = useWidgetData<PRHConfigData>({
    endpoint: "/v1/prh/config",
    refreshInterval: 60000,
  });

  const stats = statsData;
  const results: PRHResult[] = recentData?.results ?? [];
  const config = configData?.config;

  const riskySessions = results
    .filter((r) => r.flagged)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const breakdown = stats?.category_breakdown ?? {};
  const totalBreakdown = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const categories = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  let conicSegments = "";
  if (totalBreakdown > 0) {
    let cumPct = 0;
    conicSegments = categories
      .map(([cat, count]) => {
        const colorMap: Record<string, string> = {
          injection: "#f87171",
          jailbreak: "#fb923c",
          data_exfiltration: "#c084fc",
          pii_leakage: "#facc15",
          instruction_override: "#5adace",
          role_manipulation: "#f472b6",
        };
        const color = colorMap[cat] ?? "#6b7280";
        const pct = (count / totalBreakdown) * 100;
        const start = cumPct;
        cumPct += pct;
        return `${color} ${start.toFixed(1)}% ${cumPct.toFixed(1)}%`;
      })
      .join(", ");
  }

  async function handleSaveConfig() {
    setConfigSaving(true);
    setConfigResult(null);
    try {
      const { api } = await import("@/lib/api");
      const body: Record<string, unknown> = {};
      if (configEnabled !== null) body.enabled = configEnabled;
      const t = parseFloat(configThreshold);
      const aqt = parseFloat(configAqThreshold);
      if (!isNaN(t) && t >= 0 && t <= 1) body.threshold = t;
      if (!isNaN(aqt) && aqt >= 0 && aqt <= 1) body.auto_quarantine_threshold = aqt;
      await api.put("/v1/prh/config", body);
      setConfigResult({ type: "success", message: "Configuration saved." });
      refetchConfig();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setConfigResult({ type: "error", message });
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-of-on-surface">Prompt Risk Heuristic</h1>
          <p className="text-[11px] text-of-on-surface-variant mt-0.5">
            Real-time prompt content risk scoring and threat category analysis
          </p>
        </div>
        <button
          onClick={() => { setShowConfig(!showConfig); setConfigResult(null); }}
          className={`flex items-center gap-1.5 h-8 px-4 rounded-lg border transition-colors text-xs font-bold ${
            showConfig
              ? "bg-of-primary/20 text-of-primary border-of-primary/30"
              : "border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          Configure
        </button>
      </div>

      {/* Config panel (inline) */}
      {showConfig && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-of-primary">PRH Configuration</p>
            <button onClick={() => setShowConfig(false)} className="text-of-on-surface-variant hover:text-of-on-surface transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {configLoading && <div className="h-16 rounded-lg bg-of-surface-container-high animate-pulse" />}
          {!configLoading && config && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                  PRH Engine
                </label>
                <div className="flex gap-2">
                  {[true, false].map((val) => (
                    <button
                      key={String(val)}
                      onClick={() => setConfigEnabled(val)}
                      className={`px-3 h-8 rounded-lg text-xs font-bold border transition-colors ${
                        (configEnabled === null ? config.enabled : configEnabled) === val
                          ? val ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-of-error/15 text-of-error border-of-error/20"
                          : "border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface"
                      }`}
                    >
                      {val ? "Enabled" : "Disabled"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-of-on-surface-variant mt-1">
                  Current: <span className={config.enabled ? "text-emerald-400" : "text-of-error"}>{config.enabled ? "On" : "Off"}</span>
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                  Risk Threshold (0.0-1.0)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  placeholder={String(config.threshold)}
                  value={configThreshold}
                  onChange={(e) => setConfigThreshold(e.target.value)}
                  className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40"
                />
                <p className="text-[10px] text-of-on-surface-variant mt-1">Current: {config.threshold}</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1.5">
                  Auto-Quarantine Threshold
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  placeholder={String(config.auto_quarantine_threshold)}
                  value={configAqThreshold}
                  onChange={(e) => setConfigAqThreshold(e.target.value)}
                  className="w-full h-8 px-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs font-mono text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40"
                />
                <p className="text-[10px] text-of-on-surface-variant mt-1">Current: {config.auto_quarantine_threshold}</p>
              </div>
            </div>
          )}

          {configResult && (
            <div className={`mt-4 flex items-center gap-2 p-3 rounded-lg border text-xs ${
              configResult.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-of-error/10 border-of-error/20 text-of-error"
            }`}>
              {configResult.type === "success" ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
              {configResult.message}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSaveConfig}
              disabled={configSaving}
              className="px-4 h-8 rounded-lg text-xs font-bold bg-of-primary/15 text-of-primary border border-of-primary/20 hover:bg-of-primary/25 disabled:opacity-40 transition-colors"
            >
              {configSaving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </div>
      )}

      {/* KPI row */}
      {statsLoading && (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-of-surface-container animate-pulse" />)}
        </div>
      )}
      {!statsLoading && stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-of-on-surface-variant" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Total Scored</p>
            </div>
            <p className="text-2xl font-black text-of-on-surface">{stats.total_scored.toLocaleString()}</p>
          </div>

          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-of-error" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Flagged</p>
            </div>
            <p className="text-2xl font-black text-of-error">{stats.flagged_count.toLocaleString()}</p>
            {stats.total_scored > 0 && (
              <p className="text-[11px] text-of-on-surface-variant mt-1">
                {((stats.flagged_count / stats.total_scored) * 100).toFixed(1)}% flag rate
              </p>
            )}
          </div>

          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="h-4 w-4 text-of-on-surface-variant" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Avg Risk Score</p>
            </div>
            <p className={`text-2xl font-black ${scoreColor(stats.avg_score)}`}>
              {stats.avg_score.toFixed(3)}
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-of-surface-container-high overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreBarColor(stats.avg_score)}`}
                style={{ width: `${(stats.avg_score * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Middle row: category donut + risky sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-4">
            Category Breakdown
          </p>
          {statsLoading && <div className="h-48 rounded-lg bg-of-surface-container-high animate-pulse" />}
          {!statsLoading && totalBreakdown === 0 && (
            <div className="h-48 flex items-center justify-center text-of-on-surface-variant text-sm">
              No flagged prompts yet
            </div>
          )}
          {!statsLoading && totalBreakdown > 0 && (
            <div className="flex items-center gap-6">
              <div className="shrink-0 relative">
                <div
                  className="w-32 h-32 rounded-full"
                  style={{
                    background: `conic-gradient(${conicSegments}, transparent 0%)`,
                  }}
                />
                <div className="absolute inset-3 rounded-full bg-of-surface-container flex items-center justify-center">
                  <span className="text-sm font-black text-of-on-surface">{totalBreakdown}</span>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                {categories.map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[cat] ?? "bg-of-on-surface-variant"}`} />
                      <span className="text-xs text-of-on-surface-variant truncate">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-of-on-surface">{count}</span>
                      <span className="text-[10px] text-of-on-surface-variant">
                        {((count / totalBreakdown) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-4">
            Top Risky Prompts
          </p>
          {recentLoading && <div className="h-48 rounded-lg bg-of-surface-container-high animate-pulse" />}
          {!recentLoading && riskySessions.length === 0 && (
            <div className="h-48 flex items-center justify-center text-of-on-surface-variant text-sm">
              No flagged prompts in buffer
            </div>
          )}
          {!recentLoading && riskySessions.length > 0 && (
            <div className="space-y-2 overflow-y-auto max-h-64">
              {riskySessions.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-of-surface-container-low border border-of-outline-variant/5">
                  <span className={`shrink-0 text-xs font-black tabular-nums w-12 text-right ${scoreColor(r.score)}`}>
                    {r.score.toFixed(2)}
                  </span>
                  <div className="w-16 h-1 rounded-full bg-of-surface-container-high shrink-0 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${scoreBarColor(r.score)}`}
                      style={{ width: `${(r.score * 100).toFixed(0)}%` }}
                    />
                  </div>
                  {r.category && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 ${CATEGORY_COLORS[r.category] ?? "bg-of-outline-variant/10 text-of-on-surface-variant border-of-outline-variant/20"}`}>
                      {CATEGORY_LABELS[r.category] ?? r.category}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-of-on-surface-variant ml-auto shrink-0">
                    {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "-"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Recent scores table */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
        <div className="grid grid-cols-[80px_80px_160px_1fr_120px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
          {["Score", "Flagged", "Category", "Patterns", "Time"].map((h, i) => (
            <span key={i} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">{h}</span>
          ))}
        </div>
        {recentLoading && (
          <div className="space-y-1 p-2">
            {[1,2,3,4,5].map((i) => <div key={i} className="h-10 rounded-lg bg-of-surface-container-high animate-pulse" />)}
          </div>
        )}
        {!recentLoading && results.length === 0 && (
          <div className="flex items-center justify-center py-12 text-of-on-surface-variant text-sm">
            No PRH results in buffer yet
          </div>
        )}
        {!recentLoading && results.slice().reverse().slice(0, 30).map((r, i) => (
          <div key={i} className="grid grid-cols-[80px_80px_160px_1fr_120px] gap-4 px-5 py-3 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center">
            <span className={`text-xs font-black tabular-nums ${scoreColor(r.score)}`}>{r.score.toFixed(3)}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit border ${
              r.flagged
                ? "bg-of-error/15 text-of-error border-of-error/20"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
            }`}>
              {r.flagged ? "Yes" : "No"}
            </span>
            <span className={`text-[10px] font-bold uppercase ${r.category ? "" : "text-of-on-surface-variant italic"}`}>
              {r.category ? (CATEGORY_LABELS[r.category] ?? r.category) : "None"}
            </span>
            <div className="flex flex-wrap gap-1 min-w-0">
              {(r.patterns_matched ?? []).slice(0, 3).map((p) => (
                <span key={p} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-of-surface-container-high text-of-on-surface-variant border border-of-outline-variant/10 truncate max-w-[120px]">
                  {p}
                </span>
              ))}
              {(r.patterns_matched ?? []).length > 3 && (
                <span className="text-[10px] text-of-on-surface-variant">+{r.patterns_matched.length - 3}</span>
              )}
            </div>
            <span className="font-mono text-[10px] text-of-on-surface-variant">
              {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "-"}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}
