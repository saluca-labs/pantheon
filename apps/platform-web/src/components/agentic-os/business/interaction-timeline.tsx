'use client';

/**
 * Business OS — interaction timeline.
 *
 * Wave C (UI Depth Wave) adoption: the ad-hoc `<ul>` of `InteractionRow`s is
 * replaced with the shared `ActivityFeed` primitive. Each interaction maps to
 * an `ActivityEvent`; a render-prop keeps the interaction-type pill + timestamp
 * so the same information is shown. The empty state now uses `ActivityFeed`'s
 * built-in `EmptyState`. Same data, same props surface.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import type { Interaction } from '@/lib/agentic-os/business/crm';
import {
  ActivityFeed,
  type ActivityEvent,
} from '@/components/agentic-os/_shared/views';
import { InteractionTypePill } from './interaction-type-pill';

/** ActivityEvent extended with the source interaction for the render-prop. */
interface InteractionEvent extends ActivityEvent {
  interaction: Interaction;
}

export function InteractionTimeline({ interactions }: { interactions: Interaction[] }) {
  const events: InteractionEvent[] = interactions.map((i) => ({
    id: i.id,
    occurredAt: i.occurredAt,
    summary: i.summary,
    interaction: i,
  }));

  return (
    <ActivityFeed<InteractionEvent>
      events={events}
      grouping="none"
      emptyState={{
        title: 'No interactions logged yet',
        description: 'Log one above to start the timeline.',
      }}
      renderItem={(ev) => (
        <div className="flex min-w-0 items-start gap-2">
          <InteractionTypePill type={ev.interaction.interactionType} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-primary">{ev.interaction.summary}</p>
            <p className="mt-0.5 text-xs tabular-nums text-text-tertiary">
              {new Date(ev.interaction.occurredAt).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    />
  );
}
