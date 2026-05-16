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
  rose: 'text-os-filmmaker bg-os-filmmaker/10 border-os-filmmaker/30',
  red: 'text-danger bg-danger/10 border-danger/30',
  violet: 'text-os-secure-dev bg-os-secure-dev/10 border-os-secure-dev/30',
  amber: 'text-warning bg-warning/10 border-warning/30',
  emerald: 'text-positive bg-positive/10 border-positive/30',
  slate: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
  sky: 'text-os-research bg-os-research/10 border-os-research/30',
  zinc: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
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
