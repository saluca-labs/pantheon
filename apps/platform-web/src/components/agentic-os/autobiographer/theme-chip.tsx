/**
 * Autobiographer OS — ThemeChip.
 *
 * Compact display chip for a theme. Falls back to a neutral palette when
 * the theme's `color` is missing or not a known Tailwind accent. Used
 * in: timeline cards, memory cards, chapter cards, picker chips.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { Tag } from 'lucide-react';

const COLOR_CLASS: Record<string, string> = {
  indigo: 'text-os-autobiographer bg-os-autobiographer/10 border-os-autobiographer/30',
  teal: 'text-os-business bg-os-business/10 border-os-business/30',
  rose: 'text-os-filmmaker bg-os-filmmaker/10 border-os-filmmaker/30',
  amber: 'text-warning bg-warning/10 border-warning/30',
  emerald: 'text-positive bg-positive/10 border-positive/30',
  sky: 'text-os-research bg-os-research/10 border-os-research/30',
  violet: 'text-os-secure-dev bg-os-secure-dev/10 border-os-secure-dev/30',
  fuchsia: 'text-os-creator bg-os-creator/10 border-os-creator/30',
  slate: 'text-text-secondary bg-text-secondary/10 border-text-secondary/30',
  orange: 'text-attention bg-attention/10 border-attention/30',
};
const DEFAULT_CLASS = 'text-text-primary bg-surface-2 border-border-subtle';

export interface ThemeChipProps {
  name: string;
  slug?: string | null;
  color?: string | null;
  size?: 'sm' | 'md';
  /** Optional remove button (renders an X with `onRemove` handler). */
  onRemove?: () => void;
  /** Show the small Tag icon (default off in dense lists). */
  withIcon?: boolean;
}

export function ThemeChip({
  name,
  slug,
  color,
  size = 'sm',
  onRemove,
  withIcon = false,
}: ThemeChipProps) {
  const sizeClass =
    size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  const tone = color && COLOR_CLASS[color] ? COLOR_CLASS[color] : DEFAULT_CLASS;
  return (
    <span
      className={`font-medium rounded-full border inline-flex items-center gap-1 ${sizeClass} ${tone}`}
      title={slug ? `Theme: ${name} (${slug})` : `Theme: ${name}`}
    >
      {withIcon && <Tag className="w-3 h-3" />}
      <span className="truncate max-w-[12rem]">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="ml-0.5 text-text-secondary hover:text-white"
        >
          ×
        </button>
      )}
    </span>
  );
}
