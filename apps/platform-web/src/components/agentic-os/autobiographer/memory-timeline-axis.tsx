'use client';

/**
 * Autobiographer OS — MemoryTimelineAxis (Wave D).
 *
 * A cross-book memory timeline built on the shared `TimelineView`
 * primitive. Each dated memory is plotted as a milestone point on an
 * absolute year axis; lanes are one-per-book so the workshop reads as
 * parallel rows of life. Clicking a point opens the memory.
 *
 * This is a *complementary* surface to the decade-grouped
 * `TimelineList`: the axis answers "when, across all my books" at a
 * glance; the list keeps the undated memories, arc-membership stripes,
 * and full body excerpts. The timeline page offers a toggle between
 * the two — neither replaces the other, so no capability is lost.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, Lock } from 'lucide-react';
import {
  TimelineView,
  type TimelineItemGeometry,
} from '@/components/agentic-os/_shared/views';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import type { TimelineMemory } from '@/lib/agentic-os/autobiographer/timeline';
import {
  buildMemoryAxisModel,
  type MemoryAxisItem,
} from '@/lib/agentic-os/autobiographer/timeline-axis';

export interface MemoryTimelineAxisProps {
  memories: TimelineMemory[];
}

/** Render one memory as a labelled milestone marker on the axis. */
function renderMemoryItem(
  item: MemoryAxisItem,
  _geometry: TimelineItemGeometry,
) {
  const { memory } = item;
  return (
    <div className="flex flex-col items-center gap-0.5" title={memory.title}>
      <span
        className={`h-2.5 w-2.5 rotate-45 rounded-[2px] ring-2 ring-surface-2 ${
          memory.isSensitive ? 'bg-amber-400' : 'bg-os-autobiographer'
        }`}
      />
      <span className="max-w-[8rem] truncate text-2xs text-text-tertiary">
        {memory.eraDateEstimate?.slice(0, 4) ?? ''} · {memory.title}
      </span>
    </div>
  );
}

export function MemoryTimelineAxis({ memories }: MemoryTimelineAxisProps) {
  const router = useRouter();
  const model = useMemo(() => buildMemoryAxisModel(memories), [memories]);

  if (!model.range || model.items.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange className="h-6 w-6" />}
        title="No dated memories to plot"
        description={
          model.undatedCount > 0
            ? `${model.undatedCount} ${
                model.undatedCount === 1 ? 'memory' : 'memories'
              } match the filters, but none carry an era-date estimate yet. Add an estimated date on a memory to place it on the axis, or switch to the grouped list view.`
            : 'No memories match the current filters. Try clearing one, or capture a new memory.'
        }
      />
    );
  }

  return (
    <div className="space-y-2" data-testid="memory-timeline-axis">
      <TimelineView<MemoryAxisItem>
        items={model.items}
        range={model.range}
        lanes={model.lanes}
        renderItem={renderMemoryItem}
        onItemClick={(item) =>
          router.push(
            `/dashboard/os/autobiographer/memories/${item.memory.id}`,
          )
        }
        slug="autobiographer"
        emptyLabel="No dated memories in this range."
        tickCount={6}
      />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
        <span>
          {model.items.length}{' '}
          {model.items.length === 1 ? 'dated memory' : 'dated memories'} ·{' '}
          {model.lanes.length}{' '}
          {model.lanes.length === 1 ? 'lane' : 'lanes'}
        </span>
        {model.undatedCount > 0 ? (
          <span>
            {model.undatedCount} undated (see the grouped list view)
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3 text-amber-300" />
          sensitive memories marked amber
        </span>
      </p>
    </div>
  );
}
