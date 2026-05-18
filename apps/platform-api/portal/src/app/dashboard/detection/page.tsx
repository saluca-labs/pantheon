"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { truncateSoulkey } from "@/lib/display";
import { TrendingUp, Cpu, Clock, MapPin, ShieldAlert, AlertTriangle, ExternalLink, Download } from "lucide-react";

/** Detection overview -- anomaly matches with severity and type breakdown. Uses live API via useWidgetData. */

type SeverityLevel = "critical" | "high" | "medium" | "low" | "informational";
type AnomalyType = "rate_spike" | "unusual_resources" | "off_hours" | "geo_anomaly" | "scope_escalation";

interface DetectionMatch {
  id: string;
  rule_id: string;
  rule_title: string;
  level: SeverityLevel;
  soulkey_id: string;
  persona_id?: string | null;
  matched_fields?: Record<string, unknown>;
  event_data?: Record<string, unknown>;
  description?: string;
  response_playbook?: string;
  created_at: string;
}

interface DetectionMatchesData {
  detections?: DetectionMatch[];
}

interface AnomalyEntry {
  id: string;
  anomaly_type: string;
  severity: SeverityLevel;
  soulkey_id: string;
  description: string;
  created_at: string;
  evidence?: Record<string, unknown>;
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
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("24h");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRawEvent, setShowRawEvent] = useState<string | null>(null);

  const sinceHours = timeRange === "24h" ? 24 : timeRange === "7d" ? 168 : 720;
  const matchParams = `?page_size=50&since_hours=${sinceHours}${levelFilter ? `&level=${levelFilter}` : ""}`;

  const { data: matchesData, loading: matchesLoading } = useWidgetData<DetectionMatchesData>({
    endpoint: `/api/watch/v1/detections${matchParams}`,
    refreshInterval: 30000,
  });

  const { data: anomaliesData, loading: anomaliesLoading, error: anomaliesError } = useWidgetData<AnomaliesData>({
    endpoint: "/api/watch/v1/anomalies?page_size=100",
    refreshInterval: 60000,
  });

  const rawMatches: DetectionMatch[] =
    matchesData?.detections ?? (Array.isArray(matchesData) ? (matchesData as DetectionMatch[]) : []);

  // Hydrate soulkey_id and persona_id from event_data when the top-level fields are
  // missing (SoulWatch stores these inside event_data but does not always promote
  // them to the detection row).
  const matches: DetectionMatch[] = rawMatches.map((m) => ({
    ...m,
    soulkey_id:
      m.soulkey_id ??
      ((m.event_data as Record<string, unknown> | undefined)?.soulkey_id as string | null | undefined ?? null) ??
      "",
    persona_id:
      m.persona_id ??
      ((m.event_data as Record<string, unknown> | undefined)?.persona_id as string | null | undefined ?? null),
  }));

  const anomalies: AnomalyEntry[] =
    anomaliesData?.anomalies ?? (Array.isArray(anomaliesData) ? (anomaliesData as AnomalyEntry[]) : []);

  const anomalyCountByType = (Object.keys(ANOMALY_ICONS) as AnomalyType[]).map((type) => ({
    type,
    count: anomalies.filter((a) => a.anomaly_type === type).length,
    hasCritical: anomalies.some(
      (a) => a.anomaly_type === type && (a.severity === "critical" || a.severity === "high")
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
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-of-on-surface">Detection Matches</h2>
            <p className="text-[11px] text-of-on-surface-variant mt-0.5">
              Recent Sigma rule matches — auto-refreshes every 30s
            </p>
          </div>
          {matches.length > 0 && (
            <button
              onClick={() => {
                const csv =
                  "id,rule_id,rule_title,level,soulkey_id,persona_id,response_playbook,description,created_at\n" +
                  matches
                    .map(
                      (m) =>
                        `"${m.id}","${m.rule_id}","${m.rule_title}","${m.level}","${m.soulkey_id ?? ""}","${m.persona_id ?? ""}","${m.response_playbook ?? ""}","${(m.description ?? "").replace(/"/g, '""')}","${m.created_at}"`
                    )
                    .join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `detections-${timeRange}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-bold text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container-high transition-colors"
              title="Export to CSV"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 border-r border-of-outline-variant/20 pr-4">
            {(["24h", "7d", "30d"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 h-7 rounded-full text-[11px] font-bold uppercase transition-colors ${
                  timeRange === range
                    ? "bg-of-primary/20 text-of-primary"
                    : "text-of-on-surface-variant hover:text-of-on-surface"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
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
          <div className="grid grid-cols-[120px_1fr_200px_200px_160px_100px_auto] gap-4 px-5 py-3 border-b border-of-outline-variant/10">
            {["Severity", "Rule", "Agent Name", "Playbook", "Timestamp", "ID", ""].map((h, i) => (
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
                className="grid grid-cols-[120px_1fr_200px_200px_160px_100px_auto] gap-4 px-5 py-4 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors items-center cursor-pointer"
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
                  <p className="text-sm font-bold text-of-on-surface truncate">{match.rule_title}</p>
                  <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">
                    {match.rule_id}
                  </p>
                </div>

                {/* Agent Name */}
                <div className="min-w-0">
                  <span className="text-xs text-of-on-surface truncate block font-medium">
                    {match.persona_id || truncateSoulkey(match.soulkey_id)}
                  </span>
                  {match.persona_id && (
                    <span className="text-[10px] font-mono text-of-on-surface-variant truncate block" title={match.soulkey_id}>
                      {truncateSoulkey(match.soulkey_id)}
                    </span>
                  )}
                </div>

                {/* Playbook link */}
                <div>
                  {match.response_playbook ? (
                    <span className="flex items-center gap-1 text-xs text-of-primary hover:text-of-primary-fixed transition-colors">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{match.response_playbook}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-of-on-surface-variant/10 text-of-on-surface-variant border border-of-outline-variant/20">
                      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      Log Only
                    </span>
                  )}
                </div>

                {/* Timestamp */}
                <span className="font-mono text-[11px] text-of-on-surface-variant">
                  {match.created_at ? new Date(match.created_at).toLocaleString() : "\u2014"}
                </span>

                {/* Detection ID */}
                <span
                  className="font-mono text-[10px] text-of-on-surface-variant truncate"
                  title={match.id}
                >
                  {match.id ? match.id.slice(0, 8) : "\u2014"}
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

              {/* Expanded detail panel */}
              {expandedId === match.id && (
                  <div className="bg-of-surface-container-low border-b border-of-outline-variant/10 px-5 py-4">
                    {/* Detection ID */}
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                        Detection ID
                      </span>
                      <code className="text-[11px] font-mono text-of-on-surface bg-of-surface-container px-2 py-0.5 rounded border border-of-outline-variant/10 select-all">
                        {match.id}
                      </code>
                    </div>

                    {/* Description */}
                    {match.description && (
                      <p className="text-xs text-of-on-surface mb-4 leading-relaxed">
                        {match.description}
                      </p>
                    )}

                    {match.matched_fields && Object.keys(match.matched_fields).length > 0 && (
                      <>
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
                      </>
                    )}

                    {/* Raw event data (collapsible) */}
                    {match.event_data && Object.keys(match.event_data).length > 0 && (
                      <div className="mt-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowRawEvent(showRawEvent === match.id ? null : match.id);
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant hover:text-of-on-surface transition-colors mb-2"
                        >
                          <svg
                            className={`h-3 w-3 transition-transform ${showRawEvent === match.id ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          Raw Event Data
                        </button>
                        {showRawEvent === match.id && (
                          <pre className="bg-of-surface-container rounded-lg px-4 py-3 border border-of-outline-variant/5 text-[11px] font-mono text-of-on-surface-variant overflow-x-auto max-h-64 overflow-y-auto">
                            {JSON.stringify(match.event_data, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

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
                              const aType = a.anomaly_type as AnomalyType;
                              const Icon = ANOMALY_ICONS[aType] ?? AlertTriangle;
                              return (
                                <div
                                  key={a.id}
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
                                    SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.low
                                  }`}
                                  title={`Anomaly ID: ${a.id}`}
                                >
                                  <Icon className="h-3 w-3" />
                                  <span className="font-bold">{ANOMALY_LABELS[aType] ?? a.anomaly_type}</span>
                                  <span className="font-mono text-[9px] opacity-50">{a.id.slice(0, 8)}</span>
                                  <span className="opacity-70">— {a.description}</span>
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
