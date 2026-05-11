'use client';

/**
 * Filmmaker OS — BreakdownSummaryChips.
 *
 * Category chips with counts. Used inline on a scene row and in
 * project-level summary tiles. Categories with zero count are hidden.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import {
  BREAKDOWN_CATEGORIES,
  type BreakdownCategory,
  type BreakdownElement,
} from '@/lib/agentic-os/filmmaker/breakdown';

interface Props {
  elements: BreakdownElement[];
  size?: 'sm' | 'md';
}

export function BreakdownSummaryChips({ elements, size = 'sm' }: Props) {
  const counts = new Map<BreakdownCategory, number>();
  for (const e of elements) {
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return (
      <span className="text-[11px] text-[#64748b] italic">No breakdown yet</span>
    );
  }
  const cls =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5'
      : 'text-xs px-2 py-0.5';
  return (
    <div className="flex flex-wrap gap-1">
      {BREAKDOWN_CATEGORIES.filter((c) => counts.has(c.category)).map((c) => (
        <span
          key={c.category}
          className={`${cls} rounded border ${c.color} font-medium`}
        >
          {counts.get(c.category)} {c.label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}
