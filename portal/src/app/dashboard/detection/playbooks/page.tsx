"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import { BookOpen, CheckCircle, XCircle, Clock, Shield } from "lucide-react";

interface PlaybookSummary {
  id: string;
  name: string;
  description: string;
  severity_threshold: string;
  cooldown_minutes: number;
  requires_approval: boolean;
  enabled: boolean;
  trigger_rules: string[];
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-of-error/20 text-of-error border border-of-error/30",
  high: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  medium: "bg-warning/15 text-warning border border-warning/20",
  low: "bg-of-on-surface-variant/10 text-of-on-surface-variant border border-of-outline-variant/20",
};

export default function PlaybooksPage() {
  const { data: playbooksData, loading, error } = useWidgetData<PlaybookSummary[]>({
    endpoint: "/v1/detection/playbooks",
    refreshInterval: 60000,
  });

  const playbooks: PlaybookSummary[] = Array.isArray(playbooksData) ? playbooksData : [];

  return (
    <div className="max-w-7xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-base font-bold text-of-on-surface">Response Playbooks</h1>
        <p className="text-[11px] text-of-on-surface-variant mt-0.5">
          Configured automated response workflows — read-only
        </p>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-of-error/10 border border-of-error/20 text-of-error text-sm">
          Failed to load playbooks: {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-of-surface-container animate-pulse border border-of-outline-variant/5" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && playbooks.length === 0 && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 flex flex-col items-center justify-center py-16 text-of-on-surface-variant gap-3">
          <BookOpen className="h-8 w-8 opacity-30" />
          <p className="text-sm">No playbooks configured</p>
        </div>
      )}

      {/* Playbook cards */}
      {!loading && playbooks.length > 0 && (
        <div className="space-y-3">
          {playbooks.map((pb) => (
            <div
              key={pb.id}
              className={`bg-of-surface-container rounded-xl border border-of-outline-variant/5 p-5 ${
                !pb.enabled ? "opacity-50" : ""
              }`}
            >
              {/* Playbook header row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-of-primary/10 shrink-0">
                    <BookOpen className="h-4 w-4 text-of-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-of-on-surface">{pb.name}</p>
                    <p className="text-[10px] font-mono text-of-on-surface-variant mt-0.5 truncate">{pb.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Enabled badge */}
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                    pb.enabled
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                      : "bg-of-outline-variant/10 text-of-on-surface-variant border-of-outline-variant/20"
                  }`}>
                    {pb.enabled ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                    {pb.enabled ? "Enabled" : "Disabled"}
                  </span>
                  {/* Severity threshold */}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    SEVERITY_STYLES[pb.severity_threshold] ?? SEVERITY_STYLES.low
                  }`}>
                    {pb.severity_threshold}
                  </span>
                </div>
              </div>

              {/* Description */}
              {pb.description && (
                <p className="text-xs text-of-on-surface-variant mb-4">{pb.description}</p>
              )}

              {/* Metadata row */}
              <div className="flex flex-wrap gap-4 mb-4">
                {/* Cooldown */}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-of-on-surface-variant" />
                  <span className="text-xs text-of-on-surface-variant">
                    Cooldown: <span className="text-of-on-surface font-bold">{pb.cooldown_minutes}m</span>
                  </span>
                </div>
                {/* Approval required */}
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-of-on-surface-variant" />
                  <span className="text-xs text-of-on-surface-variant">
                    Approval:{" "}
                    <span className={`font-bold ${pb.requires_approval ? "text-warning" : "text-emerald-400"}`}>
                      {pb.requires_approval ? "Required" : "Not required"}
                    </span>
                  </span>
                </div>
              </div>

              {/* Trigger rules */}
              {pb.trigger_rules.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-2">
                    Trigger Rules
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pb.trigger_rules.map((ruleId) => (
                      <span
                        key={ruleId}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-of-surface-container-high border border-of-outline-variant/10 text-of-on-surface-variant"
                      >
                        {ruleId}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {pb.trigger_rules.length === 0 && (
                <p className="text-[10px] text-of-on-surface-variant italic">No trigger rules configured</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
