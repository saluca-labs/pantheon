/**
 * Autobiographer OS — SensitiveKindChip.
 *
 * One-kind chip rendered against the Phase 6 sensitive-kind palette.
 * Sized for inline use inside the badge strip above a chapter revision
 * body or memory body.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { X } from 'lucide-react';
import {
  SENSITIVE_KIND_ACCENTS,
  SENSITIVE_KIND_DESCRIPTIONS,
  SENSITIVE_KIND_LABELS,
  type SensitiveKind,
} from '@/lib/agentic-os/autobiographer/sensitive-kinds';

const ACCENT_CLASSES: Record<string, string> = {
  rose: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  red: 'text-red-300 bg-red-500/10 border-red-500/30',
  violet: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  slate: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  sky: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  zinc: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
};

export interface SensitiveKindChipProps {
  kind: SensitiveKind;
  size?: 'sm' | 'md';
  onRemove?: () => void;
}

export function SensitiveKindChip({
  kind,
  size = 'sm',
  onRemove,
}: SensitiveKindChipProps) {
  const accent = SENSITIVE_KIND_ACCENTS[kind];
  const sizeClass =
    size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  const classes = `font-medium uppercase tracking-wide rounded-full border inline-flex items-center gap-1 ${sizeClass} ${ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.zinc}`;
  return (
    <span className={classes} title={SENSITIVE_KIND_DESCRIPTIONS[kind]}>
      {SENSITIVE_KIND_LABELS[kind]}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-75 transition"
          aria-label={`Remove ${SENSITIVE_KIND_LABELS[kind]}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
