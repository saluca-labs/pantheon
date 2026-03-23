"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { TrendingUp, Cpu, Clock, MapPin, ShieldAlert, AlertTriangle, ExternalLink } from "lucide-react";

/** Detection overview -- anomaly matches with severity and type breakdown. Uses live API via useWidgetData. */

type SeverityLevel = "critical" | "high" | "medium" | "low" | "informational";
type AnomalyType = "rate_spike" | "unusual_resources" | "off_hours" | "geo_anomaly" | "scope_escalation";

interface DetectionMatch {
  id: string;
  rule_id: string;
  rule_name: string;
  level: SeverityLevel;
  soulkey_id: string;
  matched_fields?: Record<string, unknown>;
  playbook_id?: string;
  playbook_name?: string;
  timestamp: string;
}

interface DetectionMatchesData {
  matches?: DetectionMatch[];
}

interface AnomalyEntry {
  id: string;
  type: AnomalyType;
  severity: SeverityLevel;
  soulkey_id: string;
  description: string;
  detected_at: string;
  metadata?: Record<string, unknown>;
}

interface AnomaliesData {
  anomalies?: AnomalyEntry[];
}

const SEVERITY_STYLES: Record<SeverityLevel, string> = {
  critical: "bg-of-error/20 text-of-error border border-of-error/30",
  high: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  medium: "bg-warning/15 text-warning border border-warning/20",
  low: "bg-of-on-surface-variant/10 text-of-on-surface-variant border border-of-outline-variant/20",
  informational: "bg-of-primary/10 text-of-primary border border-of-primary/20",
};

const ANOMALY_ICONS: Record<AnomalyType, React.ElementType> = {
  rate_spike: TrendingUp,
  unusual_resources: Cpu,
  off_hours: Clock,
  geo_anomaly: MapPin,
  scope_escalation: ShieldAlert,
};

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  rate_spike: "Rate Spikes",
  unusual_resources: "Unusual Resources",
  off_hours: "Off-Hours",
  geo_anomaly: "Geo Anomalies",
  scope_escalation: "Scope Escalation",
};

export default function DetectionPage() {
  const [levelFilter, setLevelFilter] = useState<"" | SeverityLevel>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const matchParams = levelFilter ? `?level=${levelFilter}&limit=50` : "?limit=50";

  const { data: matchesData, loading: matchesLoading } = useWidgetData<DetectionMatchesData>({
    endpoint: `/v1/detection/matches${matchParams}`,
    refreshInterval: 30000,
  });

  const { data: anomaliesData, loading: anomaliesLoading } = useWidgetData<AnomaliesData>({
    endpoint: "/v1/analytics/anomalies?limit=100",
    refreshInterval: 60000,
  });

  const matches: DetectionMatch[] =
    matchesData?.matches ?? (Array.isArray(matchesData) ? (matchesData as DetectionMatch[]) : []);
  const anomalies: AnomalyEntry[] =
    anomaliesData?.anomalies ?? (Array.isArray(anomaliesData) ? (anomaliesData as AnomalyEntry[]) : []);

  const anomalyCountByType = (Object.keys(ANOMALY_ICONS) as AnomalyType[]).map((type) => ({
    type,
    count: anomalies.filter((a) => a.type === type).length,
    hasCritical: anomalies.some(
      (a) => a.type === type && (a.severity === "critical" || a.severity === "high")
    ),
  }));

  return (
    <div className="max-w-7xl space-y-6">
      {/* Anomaly indicator strip (QUAR-06) */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-3">
          Anomaly Indicators
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {anomalyCountByType.map(({ type, count, hasCritical }) => {
            const Icon = ANOMALY_ICONS[type];
            return (
              <div
                key={type}
                className={`bg-of-surface-container rounded-xl p-4 border flex items-center gap-3 transition-colors ${
                  hasCritical && count > 0
                    ? "border-of-error/30 bg-of-error/5"
                    : count > 0
                    ? "border-warning/20 bg-warning/5"
                    : "border-of-outline-variant/5"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    hasCritical && count > 0
                      ? "bg-of-error/15"
                      : count > 0
                      ? "bg-warning/15"
                      : "bg-of-surface-container-high"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      hasCritical && count > 0
                        ? "text-of-error"
                        : count > 0
                        ? "text-warning"
                        : "text-of-on-surface-variant"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-of-on-surface-variant leading-tight">
                    {ANOMALY_LABELS[type]}
                  </p>
                  <p
                    className={`text-xl font-black tabular-nums leading-tight ${
                      hasCritical && count > 0
                        ? "text-of-error"
                        : count > 0
                        ? "text-warning"
                        : "text-of-on-surface"
                    }`}
                  >
                    {anomaliesLoading ? "\u2014" : count}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detection matches header + filter (QUAR-05) */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-of-on-surface">Detection Matches</h2>
          <p className="text-[11px] text-of-on-surface-variant mt-0.5">
            Recent Sigma rule matches \u2014 auto-refreshes every 30s
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
      {matchesLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!matchesLoading && matches.length === 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 flex flex-col items-center justify-center py-16 text-of-on-surface-variant gap-3">
          <AlertTriangle className="h-8 w-8 opacity-30" />
          <p className="text-sm">
            No detection matches{levelFilter ? ` for level "${levelFilter}"` : ""}
          </p>
        </div>
      )}

      {/* Matches feed */}
      {!matchesLoading && matches.length > 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[120px_1fr_200px_200px_160px_auto] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Severity", "Rule", "Soulkey", "Playbook", "Timestamp", ""].map((h, i) => (
              <span
                key={i}
                className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant"
              >
                {h}
              </span>
            ))}
          </div>

          {matches.map((match) => (
            <div key={match.id}>
              {/* Match row */}
              <div
                className="grid grid-cols-[120px_1fr_200px_200px_160px_auto] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center cursor-pointer"
                onClick={() => setExpandedId(expandedId === match.id ? null : match.id)}
              >
                {/* Severity badge */}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                    SEVERITY_STYLES[match.level] ?? SEVERITY_STYLES.low
                  }`}
                >
                  {match.level}
                </span>

                {/* Rule name */}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-of-on-surface truncate">{match.rule_name}</p>
                  <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">
                    {match.rule_id}
                  </p>
                </div>

                {/* Soulkey ID */}
                <span
                  className="font-mono text-xs text-of-on-surface-variant truncate"
                  title={match.soulkey_id}
                >
                  {match.soulkey_id}
                </span>

                {/* Playbook link */}
                <div>
                  {match.playbook_name ? (
                    <span className="flex items-center gap-1 text-xs text-of-primary hover:text-of-primary-fixed transition-colors">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{match.playbook_name}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-of-on-surface-variant">\u2014</span>
                  )}
                </div>

                {/* Timestamp */}
                <span className="font-mono text-[11px] text-of-on-surface-variant">
                  {match.timestamp ? new Date(match.timestamp).toLocaleString() : "\u2014"}
                </span>

                {/* Expand chevron */}
                <button className="text-of-on-surface-variant hover:text-of-on-surface transition-colors justify-self-end">
                  {expandedId === match.id ? (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Expanded matched fields panel */}
              {expandedId === match.id &&
                match.matched_fields &&
                Object.keys(match.matched_fields).length > 0 && (
                  <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-5 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-of-primary mb-3">
                      Matched Evidence
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(match.matched_fields).map(([key, value]) => (
                        <div
                          key={key}
                          className="bg-of-surface-container rounded-lg px-3 py-2 border border-of-outline-variant/5"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                            {key}
                          </p>
                          <p className="text-xs font-mono text-of-on-surface break-all">
                            {typeof value === "string" || typeof value === "number"
                              ? String(value)
                              : JSON.stringify(value)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Related anomalies for this soulkey (QUAR-06) */}
                    {(() => {
                      const relatedAnomalies = anomalies.filter(
                        (a) => a.soulkey_id === match.soulkey_id
                      );
                      if (relatedAnomalies.length === 0) return null;
                      return (
                        <div className="mt-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">
                            Related Anomalies for this Agent
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {relatedAnomalies.map((a) => {
                              const Icon = ANOMALY_ICONS[a.type];
                              return (
                                <div
                                  key={a.id}
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
                                    SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.low
                                  }`}
                                >
                                  <Icon className="h-3 w-3" />
                                  <span className="font-bold">{ANOMALY_LABELS[a.type]}</span>
                                  <span className="opacity-70">\u2014 {a.description}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
