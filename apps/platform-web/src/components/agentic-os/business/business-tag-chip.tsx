'use client';

/**
 * Business OS Phase 1 — small tag chip used across people + orgs.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

export interface BusinessTagChipProps {
  tag: string;
  onRemove?: () => void;
  small?: boolean;
}

export function BusinessTagChip({ tag, onRemove, small }: BusinessTagChipProps) {
  const sizeCls = small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-os-business/15 text-os-business border border-os-business/30 ${sizeCls}`}
    >
      <span className="font-medium uppercase tracking-wide">{tag}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag ${tag}`}
          onClick={onRemove}
          className="text-os-business/70 hover:text-os-business transition"
        >
          ×
        </button>
      )}
    </span>
  );
}
