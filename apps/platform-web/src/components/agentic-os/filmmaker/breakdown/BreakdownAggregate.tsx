'use client';

/**
 * Filmmaker OS — BreakdownAggregate.
 *
 * Top-of-page summary tile for the breakdown view. Stats + per-category
 * chips.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import {
  BREAKDOWN_CATEGORIES,
  pagesLabel,
  type ProjectBreakdownSummary,
} from '@/lib/agentic-os/filmmaker/breakdown';

interface Props {
  summary: ProjectBreakdownSummary;
}

export function BreakdownAggregate({ summary }: Props) {
  const pct =
    summary.totalScenes === 0
      ? 0
      : Math.round((summary.scenesWithBreakdown / summary.totalScenes) * 100);
  const avgPerScene =
    summary.totalScenes === 0
      ? 0
      : Math.round((summary.totalElements / summary.totalScenes) * 10) / 10;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Stat label="Scenes" value={String(summary.totalScenes)} />
      <Stat
        label="Total pages"
        value={pagesLabel(summary.totalEighths)}
        hint={`${summary.totalEighths} eighths`}
      />
      <Stat label="Avg elements / scene" value={avgPerScene.toFixed(1)} />
      <Stat
        label="Filled"
        value={`${pct}%`}
        hint={`${summary.scenesWithBreakdown} / ${summary.totalScenes}`}
      />
      {summary.byCategory.length > 0 && (
        <div className="col-span-2 md:col-span-4 rounded-xl border border-border-subtle bg-surface-2 p-4">
          <h3 className="text-[11px] uppercase tracking-wide text-text-secondary mb-2">
            Elements by category
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {BREAKDOWN_CATEGORIES.filter((c) =>
              summary.byCategory.find((b) => b.category === c.category),
            ).map((c) => {
              const count =
                summary.byCategory.find((b) => b.category === c.category)?.count ?? 0;
              return (
                <span
                  key={c.category}
                  className={`text-xs px-2 py-0.5 rounded border ${c.color}`}
                >
                  {count} {c.label.toLowerCase()}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="text-xl font-semibold text-white mt-1">{value}</p>
      {hint && <p className="text-[10px] text-[#64748b] mt-0.5">{hint}</p>}
    </div>
  );
}
