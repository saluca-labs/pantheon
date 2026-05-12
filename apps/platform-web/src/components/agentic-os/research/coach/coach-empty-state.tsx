/**
 * Research coach — empty state for the session view (no messages yet).
 *
 * Renders inline within the transcript scroll when a fresh session has
 * no turns yet. Mode-aware copy nudges the user toward the right
 * starting move for the active mode.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { MessageCircle } from 'lucide-react';
import { COACH_MODE_LABELS, type CoachMode } from '@/lib/agentic-os/research/coach/modes';

interface Props {
  mode: CoachMode;
}

const NUDGE: Record<CoachMode, string> = {
  lit_reviewer:
    'Ask the coach to organize, contrast, or surface gaps across your recent papers.',
  hypothesis_critic:
    'Pick a hypothesis to stress-test — falsifiability, confounders, evidence asymmetry.',
  methods_advisor:
    'Ask about controls, sample sizes, or reproducibility gaps for the scoped experiment.',
  general:
    'Workshop-level snapshot or "what should I focus on?" works here. Switch modes for deeper help.',
};

export function CoachEmptyState({ mode }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 text-[#94a3b8]">
      <MessageCircle className="w-7 h-7 mb-2 text-[#4361EE]/50" />
      <p className="text-sm font-medium text-[#cbd5e1] mb-1">
        {COACH_MODE_LABELS[mode]} mode
      </p>
      <p className="text-xs max-w-md leading-relaxed">{NUDGE[mode]}</p>
    </div>
  );
}
