'use client';

/**
 * Business OS Phase 1 — single-row card for an interaction in the timeline.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import type { Interaction } from '@/lib/agentic-os/business/crm';
import { InteractionTypePill } from './interaction-type-pill';

export function InteractionRow({ interaction }: { interaction: Interaction }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-2 p-3">
      <InteractionTypePill type={interaction.interactionType} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{interaction.summary}</p>
        <p className="text-[11px] text-text-secondary mt-1">
          {new Date(interaction.occurredAt).toLocaleString()}
        </p>
      </div>
    </li>
  );
}
