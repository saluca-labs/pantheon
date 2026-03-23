"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TierGate } from "@/components/dashboard/TierGate";
import { AlertTriangle } from "lucide-react";

/** MSSP detection -- cross-tenant anomaly correlation view. Uses live API via useWidgetData. */

type SeverityLevel = "critical" | "high" | "medium" | "low" | "informational";

interface MsspDetectionMatch {
  id: string;
  tenant_id: string;
  rule_id: string;
  rule_name: string;
  level: SeverityLevel;
  soulkey_id: string;
  timestamp: string;
}

interface MsspDetectionResponse {
  matches?: MsspDetectionMatch[];
}

const SEVERITY_STYLES: Record<SeverityLevel, string> = {
  critical: "bg-of-error/20 text-of-error border border-of-error/30",
  high: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  medium: "bg-warning/15 text-warning border border-warning/20",
  low: "bg-of-on-surface-variant/10 text-of-on-surface-variant border border-of-outline-variant/20",
  informational: "bg-of-primary/10 text-of-primary border border-of-primary/20",
};

function MsspDetectionContent() {
  const [levelFilter, setLevelFilter] = useState<"" | SeverityLevel>("");

  const params = levelFilter ? `?level=${levelFilter}&limit=100` : "?limit=100";
  const { data, loading } = useWidgetData<MsspDetectionResponse>({
    endpoint: `/v1/mssp/detection/matches${params}`,
    refreshInterval: 30000,
  });

  const matches: MsspDetectionMatch[] =
    data?.matches ?? (Array.isArray(data) ? (data as MsspDetectionMatch[]) : []);

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header + filters */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-of-on-surface">Cross-Tenant Detection</h2>
          <p className="text-[11px] text-of-on-surface-variant mt-0.5">
            Sigma rule matches across all child tenants — auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["", "critical", "high", "medium", "low"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={`px-3 h-7 rounded-full text-[11px] font-bold uppercase transition-colors ${
                levelFilter === level
                  ? "bg-of-primary/20 text-of-primary"
                  : "text-of-on-surface-variant hover:text-of-on-surface"
              }`}
            >
              {level === "" ? "All" : level}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && matches.length === 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 flex flex-col items-center justify-center py-16 gap-3 text-of-on-surface-variant">
          <AlertTriangle className="h-8 w-8 opacity-30" />
          <p className="text-sm">
            No cross-tenant detection matches{levelFilter ? ` for level "${levelFilter}"` : ""}
          </p>
        </div>
      )}

      {/* Match table */}
      {!loading && matches.length > 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          <div className="grid grid-cols-[100px_1fr_200px_200px_160px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Severity", "Rule", "Tenant", "Soulkey", "Timestamp"].map((h) => (
              <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                {h}
              </span>
            ))}
          </div>

          {matches.map((match) => (
            <div
              key={match.id}
              className="grid grid-cols-[100px_1fr_200px_200px_160px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center"
            >
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                  SEVERITY_STYLES[match.level] ?? SEVERITY_STYLES.low
                }`}
              >
                {match.level}
              </span>

              <div className="min-w-0">
                <p className="text-sm font-bold text-of-on-surface truncate">{match.rule_name}</p>
                <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">{match.rule_id}</p>
              </div>

              <span className="font-mono text-xs text-of-on-surface-variant truncate" title={match.tenant_id}>
                {match.tenant_id}
              </span>

              <span className="font-mono text-xs text-of-on-surface-variant truncate" title={match.soulkey_id}>
                {match.soulkey_id}
              </span>

              <span className="font-mono text-[11px] text-of-on-surface-variant">
                {match.timestamp ? new Date(match.timestamp).toLocaleString() : "\u2014"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MsspDetectionPage() {
  return (
    <TierGate requiredTier="mssp" featureLabel="Cross-Tenant Detection">
      <MsspDetectionContent />
    </TierGate>
  );
}
