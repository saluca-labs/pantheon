'use client';

/**
 * Business OS Phase 1 — interaction timeline list.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import type { Interaction } from '@/lib/agentic-os/business/crm';
import { InteractionRow } from './interaction-row';

export function InteractionTimeline({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-[#94a3b8] italic">
        No interactions logged yet. Log one above to start the timeline.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {interactions.map((i) => (
        <InteractionRow key={i.id} interaction={i} />
      ))}
    </ul>
  );
}
