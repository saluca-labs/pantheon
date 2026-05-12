/**
 * Autobiographer OS — ArcCard.
 *
 * Server-rendered card for a single arc. Renders title, kind chip,
 * is_primary badge, chapter count, and the inline edit / make-primary
 * affordances. Used in the book detail page's Arcs section and on the
 * standalone arc edit landing (post-creation flow).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { GitBranch, Star } from 'lucide-react';
import { ArcEditButton } from './arc-edit-button';
import { MakePrimaryButton } from './make-primary-button';
import { ARC_KIND_LABELS, type ArcKind } from '@/lib/agentic-os/autobiographer/arcs';

export interface ArcCardData {
  id: string;
  title: string;
  kind: ArcKind;
  description: string | null;
  isPrimary: boolean;
  chapterCount: number;
}

export interface ArcCardProps {
  arc: ArcCardData;
}

const KIND_COLOR: Record<ArcKind, string> = {
  chronological: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  thematic: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  character_led: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  custom: 'text-[#cbd5e1] bg-[#1a1d27] border-[#2a2d3e]',
};

export function ArcCard({ arc }: ArcCardProps) {
  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/30 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <GitBranch className="w-4 h-4 text-[#4361EE]/60 shrink-0" />
            <h3 className="text-sm font-semibold text-white truncate">
              {arc.title}
            </h3>
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${KIND_COLOR[arc.kind]}`}
            >
              {ARC_KIND_LABELS[arc.kind]}
            </span>
            {arc.isPrimary && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
                <Star className="w-3 h-3 fill-amber-300/40" />
                Primary
              </span>
            )}
          </div>
          {arc.description && (
            <p className="text-xs text-[#94a3b8] leading-relaxed mt-1.5">
              {arc.description}
            </p>
          )}
          <p className="text-[10px] text-[#64748b] mt-1.5">
            {arc.chapterCount}{' '}
            {arc.chapterCount === 1 ? 'chapter' : 'chapters'} in this arc
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!arc.isPrimary && <MakePrimaryButton arcId={arc.id} />}
          <ArcEditButton arcId={arc.id} initial={arc} />
        </div>
      </div>
    </div>
  );
}
