/**
 * Autobiographer OS — TimelineList.
 *
 * Vertical timeline rendering. Groups memories by decade for visual
 * cohesion; within each decade memories appear in the order returned by
 * the composite query (life-year ASC NULLS LAST, created_at ASC).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { History } from 'lucide-react';
import type { TimelineMemory } from '@/lib/agentic-os/autobiographer/timeline';
import { EmptyState } from '@/components/agentic-os/_shared/views';
import { TimelineCard } from './timeline-card';

export interface TimelineListProps {
  memories: TimelineMemory[];
}

function decadeOf(memory: TimelineMemory): string {
  if (!memory.eraDateEstimate) return 'Undated';
  const year = Number(memory.eraDateEstimate.slice(0, 4));
  if (!Number.isFinite(year)) return 'Undated';
  return `${Math.floor(year / 10) * 10}s`;
}

export function TimelineList({ memories }: TimelineListProps) {
  if (memories.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6" />}
        title="No memories on the timeline"
        description="No memories match the current filters. Try clearing one, or capture a new memory."
      />
    );
  }
  const groups: Array<{ label: string; rows: TimelineMemory[] }> = [];
  let lastLabel: string | null = null;
  for (const m of memories) {
    const label = decadeOf(m);
    if (label !== lastLabel) {
      groups.push({ label, rows: [m] });
      lastLabel = label;
    } else {
      groups[groups.length - 1]!.rows.push(m);
    }
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2">
            {g.label}
          </h3>
          <div className="space-y-3">
            {g.rows.map((m) => (
              <TimelineCard key={m.id} memory={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
