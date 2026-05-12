/**
 * Autobiographer coach — recent-session list item.
 *
 * Renders a single session row in the hub sidebar. Mode pill + book
 * scope pill + last-updated stamp. The whole card is a Link.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import {
  COACH_MODE_LABELS,
  type CoachMode,
} from '@/lib/agentic-os/autobiographer/coach/modes';

export interface CoachSessionCardProps {
  id: string;
  title: string;
  mode: CoachMode;
  bookId: string | null;
  updatedAt: string;
}

export function CoachSessionCard(props: CoachSessionCardProps) {
  return (
    <Link
      href={`/dashboard/os/autobiographer/coach/${props.id}`}
      className="block rounded-lg px-3 py-2 text-sm text-[#cbd5e1] hover:bg-[#0f1117] hover:text-white transition"
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="w-3.5 h-3.5 shrink-0 text-[#64748b]" />
        <span className="truncate">{props.title || 'Untitled session'}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] uppercase tracking-wide text-[#4361EE]">
          {COACH_MODE_LABELS[props.mode]}
        </span>
        <span className="text-[10px] text-[#64748b]">
          {new Date(props.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
