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
    <li className="flex items-start gap-3 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-3">
      <InteractionTypePill type={interaction.interactionType} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{interaction.summary}</p>
        <p className="text-[11px] text-[#94a3b8] mt-1">
          {new Date(interaction.occurredAt).toLocaleString()}
        </p>
      </div>
    </li>
  );
}
