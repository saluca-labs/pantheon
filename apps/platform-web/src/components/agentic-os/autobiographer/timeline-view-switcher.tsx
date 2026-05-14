'use client';

/**
 * Autobiographer OS — TimelineViewSwitcher (Wave D).
 *
 * Lets the timeline page render the same filtered `TimelineMemory[]`
 * payload two ways without a navigation:
 *   - "Grouped" — the bespoke decade-grouped `TimelineList` (undated
 *     memories, arc-membership stripes, full excerpts).
 *   - "Axis" — the shared-primitive `MemoryTimelineAxis` (cross-book
 *     `TimelineView`, dated memories plotted on a year axis).
 *
 * The page already loads the data and the filter bar; this component
 * only picks which presentation gets it. Default is "Grouped" so the
 * existing surface is unchanged for anyone who doesn't touch the toggle.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useState } from 'react';
import { LayoutList, CalendarRange } from 'lucide-react';
import type { TimelineMemory } from '@/lib/agentic-os/autobiographer/timeline';
import { TimelineList } from './timeline-list';
import { MemoryTimelineAxis } from './memory-timeline-axis';

type Mode = 'grouped' | 'axis';

export interface TimelineViewSwitcherProps {
  memories: TimelineMemory[];
}

export function TimelineViewSwitcher({ memories }: TimelineViewSwitcherProps) {
  const [mode, setMode] = useState<Mode>('grouped');

  return (
    <div className="space-y-3" data-testid="timeline-view-switcher">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-testid="timeline-mode-grouped"
          aria-pressed={mode === 'grouped'}
          onClick={() => setMode('grouped')}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition ${
            mode === 'grouped'
              ? 'border-accent/60 bg-accent/15 text-white'
              : 'border-border-subtle bg-surface-0 text-text-secondary hover:text-white'
          }`}
        >
          <LayoutList className="w-3.5 h-3.5" />
          Grouped
        </button>
        <button
          type="button"
          data-testid="timeline-mode-axis"
          aria-pressed={mode === 'axis'}
          onClick={() => setMode('axis')}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition ${
            mode === 'axis'
              ? 'border-accent/60 bg-accent/15 text-white'
              : 'border-border-subtle bg-surface-0 text-text-secondary hover:text-white'
          }`}
        >
          <CalendarRange className="w-3.5 h-3.5" />
          Axis
        </button>
      </div>

      {mode === 'grouped' ? (
        <TimelineList memories={memories} />
      ) : (
        <MemoryTimelineAxis memories={memories} />
      )}
    </div>
  );
}
