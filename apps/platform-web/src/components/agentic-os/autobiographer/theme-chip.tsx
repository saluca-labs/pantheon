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
  indigo: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30',
  teal: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
  rose: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  sky: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  violet: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  fuchsia: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30',
  slate: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  orange: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
};
const DEFAULT_CLASS = 'text-[#cbd5e1] bg-[#1a1d27] border-[#2a2d3e]';

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
          className="ml-0.5 text-[#94a3b8] hover:text-white"
        >
          ×
        </button>
      )}
    </span>
  );
}
