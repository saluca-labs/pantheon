'use client';

/**
 * Business OS Phase 1 — interaction-type pill.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import type { InteractionType } from '@/lib/agentic-os/business/crm';

const STYLE: Record<InteractionType, string> = {
  call: 'bg-os-research/15 text-os-research border-os-research/30',
  email: 'bg-os-secure-dev/15 text-os-secure-dev border-os-secure-dev/30',
  meeting: 'bg-warning/15 text-warning border-warning/30',
  demo: 'bg-positive/15 text-positive border-positive/30',
  proposal: 'bg-os-creator/15 text-os-creator border-os-creator/30',
  follow_up: 'bg-os-autobiographer/15 text-os-autobiographer border-os-autobiographer/30',
  note: 'bg-surface-2 text-text-secondary border-border-subtle',
  linkedin: 'bg-accent/15 text-accent border-accent/30',
  other: 'bg-surface-2 text-text-tertiary border-border-subtle',
};

const LABEL: Record<InteractionType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  demo: 'Demo',
  proposal: 'Proposal',
  follow_up: 'Follow-up',
  note: 'Note',
  linkedin: 'LinkedIn',
  other: 'Other',
};

export function InteractionTypePill({ type }: { type: InteractionType }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STYLE[type]}`}
    >
      {LABEL[type]}
    </span>
  );
}
