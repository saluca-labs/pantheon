'use client';

/**
 * Business OS Phase 1 — interaction-type pill.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import type { InteractionType } from '@/lib/agentic-os/business/crm';

const STYLE: Record<InteractionType, string> = {
  call: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  email: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  meeting: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  demo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  proposal: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  follow_up: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  note: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  linkedin: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  other: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
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
