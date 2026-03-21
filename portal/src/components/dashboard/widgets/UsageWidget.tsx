"use client";

import { useWidgetData } from "@/lib/useWidgetData";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { ErrorCard } from "@/components/ui/ErrorCard";

interface UsageDimensions {
  agents: number;
  requests: number;
  storage_bytes: number;
}

interface UsageLimits {
  agents: number;      // -1 = unlimited
  requests: number;
  storage_bytes: number;
}

interface UsagePct {
  agents: number;
  requests: number;
  storage_bytes: number;
}

interface UsageCurrent {
  tenant_id: string;
  tier: string;
  period: { start: string; end: string };
  usage: UsageDimensions;
  limits: UsageLimits;
  pct: UsagePct;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatLimit(val: number, formatter?: (n: number) => string): string {
  if (val === -1) return "\u221e";
  return formatter ? formatter(val) : val.toLocaleString();
}

function UsageBar({
  label,
  current,
  limit,
  pct,
  formatVal,
}: {
  label: string;
  current: number;
  limit: number;
  pct: number;
  formatVal?: (n: number) => string;
}) {
  const fmt = formatVal ?? ((n: number) => n.toLocaleString());
  const unlimited = limit === -1;
  const barColor =
    unlimited || pct < 80
      ? "bg-of-primary"
      : pct < 100
      ? "bg-amber-400"
      : "bg-of-error";

  const clampedWidth = Math.min(pct, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase tracking-wider text-of-on-surface-variant">
          {label}
        </span>
        <span className="text-[11px] font-mono text-of-on-surface tabular-nums">
          {fmt(current)}{" "}
          <span className="text-of-on-surface-variant">
            / {formatLimit(limit, fmt)}
          </span>
          {!unlimited && (
            <span
              className={`ml-1.5 ${
                pct >= 100
                  ? "text-of-error"
                  : pct >= 80
                  ? "text-amber-400"
                  : "text-of-on-surface-variant"
              }`}
            >
              ({pct.toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-of-surface-container-high overflow-hidden">
        {unlimited ? (
          <div className="h-full w-full bg-of-primary/20 rounded-full" />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${clampedWidth}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function UsageWidget() {
  const { data, loading, error, refetch } = useWidgetData<UsageCurrent>({
    endpoint: "/v1/usage/current",
    refreshInterval: 60_000,
  });

  if (loading) return <SkeletonCard lines={4} showHeader={true} />;
  if (error)
    return (
      <ErrorCard
        message={`Failed to load usage data: ${error}`}
        onRetry={refetch}
      />
    );
  if (!data) return null;

  const tierLabel = data.tier.charAt(0).toUpperCase() + data.tier.slice(1);
  const periodStart = new Date(data.period.start).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const periodEnd = new Date(data.period.end).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="bg-of-surface-container rounded-xl p-5 border border-of-outline-variant/5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-of-on-surface">Usage</h3>
          <p className="text-[10px] text-of-on-surface-variant mt-0.5">
            {periodStart} &ndash; {periodEnd}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-of-primary/10 text-of-primary uppercase tracking-wider">
          {tierLabel}
        </span>
      </div>

      <div className="space-y-3">
        <UsageBar
          label="Agents"
          current={data.usage.agents}
          limit={data.limits.agents}
          pct={data.pct.agents}
        />
        <UsageBar
          label="Requests"
          current={data.usage.requests}
          limit={data.limits.requests}
          pct={data.pct.requests}
        />
        <UsageBar
          label="Storage"
          current={data.usage.storage_bytes}
          limit={data.limits.storage_bytes}
          pct={data.pct.storage_bytes}
          formatVal={formatBytes}
        />
      </div>
    </div>
  );
}
