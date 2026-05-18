"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { tenantName, truncateSoulkey } from "@/lib/display";
import { AlertTriangle, ChevronRight } from "lucide-react";

/** MSSP detection -- cross-tenant anomaly correlation view. Uses live API via useWidgetData. */

type SeverityLevel = "critical" | "high" | "medium" | "low" | "informational";

interface MsspDetectionMatch {
  id: string;
  tenant_id: string;
  rule_id: string;
  rule_name: string;
  level: SeverityLevel;
  description?: string;
  matched_fields?: string[];
  event_data?: Record<string, unknown>;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          <div className="grid grid-cols-[100px_1fr_200px_200px_160px_28px] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Severity", "Rule", "Tenant", "Agent Name", "Timestamp", ""].map((h) => (
              <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                {h}
              </span>
            ))}
          </div>

          {matches.map((match) => {
            const isExpanded = expandedId === match.id;
            return (
              <div key={match.id}>
                <div
                  className="grid grid-cols-[100px_1fr_200px_200px_160px_28px] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : match.id)}
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

                  <span className="text-xs text-of-on-surface-variant truncate" title={match.tenant_id}>
                    {tenantName(match.tenant_id)}
                  </span>

                  <span className="text-xs text-of-on-surface-variant truncate" title={match.soulkey_id}>
                    {truncateSoulkey(match.soulkey_id)}
                  </span>

                  <span className="font-mono text-[11px] text-of-on-surface-variant">
                    {match.timestamp ? new Date(match.timestamp).toLocaleString() : "\u2014"}
                  </span>

                  <ChevronRight
                    className={`h-4 w-4 text-of-on-surface-variant transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-8 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Detection ID</span>
                        <p className="font-mono text-of-on-surface mt-0.5">{match.id}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Rule ID</span>
                        <p className="font-mono text-of-on-surface mt-0.5">{match.rule_id}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Severity</span>
                        <p className="mt-0.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${SEVERITY_STYLES[match.level] ?? SEVERITY_STYLES.low}`}>
                            {match.level}
                          </span>
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Timestamp</span>
                        <p className="font-mono text-of-on-surface mt-0.5">{match.timestamp ? new Date(match.timestamp).toLocaleString() : "\u2014"}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Tenant</span>
                        <p className="text-of-on-surface mt-0.5">{tenantName(match.tenant_id)}</p>
                        <p className="font-mono text-[10px] text-of-on-surface-variant">{match.tenant_id}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Agent (Soulkey)</span>
                        <p className="font-mono text-of-on-surface mt-0.5">{match.soulkey_id}</p>
                      </div>
                    </div>

                    {match.description && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Description</span>
                        <p className="text-xs text-of-on-surface mt-1">{match.description}</p>
                      </div>
                    )}

                    {match.matched_fields && match.matched_fields.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Matched Fields</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {match.matched_fields.map((f) => (
                            <span key={f} className="px-2 py-0.5 rounded bg-of-primary/10 text-of-primary text-[10px] font-mono">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {match.event_data && Object.keys(match.event_data).length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Event Data</span>
                        <pre className="mt-1 p-3 rounded-lg bg-of-surface-container text-[11px] font-mono text-of-on-surface overflow-x-auto max-h-48 border border-of-outline-variant/10">
                          {JSON.stringify(match.event_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MsspDetectionPage() {
  return (
      <MsspDetectionContent />
  );
}
