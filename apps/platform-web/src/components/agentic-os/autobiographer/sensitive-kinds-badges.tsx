/**
 * Autobiographer OS — SensitiveKindsBadges.
 *
 * Read-only strip of chips. Renders above the chapter revision body
 * and the memory body. Returns null when the list is empty so the
 * caller can sprinkle it unconditionally.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { ShieldAlert } from 'lucide-react';
import { SensitiveKindChip } from './sensitive-kind-chip';
import type { SensitiveKind } from '@/lib/agentic-os/autobiographer/sensitive-kinds';

export interface SensitiveKindsBadgesProps {
  kinds: readonly SensitiveKind[];
  /** Compact (default) hides the leading label; expanded shows "Sensitive content: ". */
  variant?: 'compact' | 'expanded';
}

export function SensitiveKindsBadges({
  kinds,
  variant = 'compact',
}: SensitiveKindsBadgesProps) {
  if (!kinds || kinds.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {variant === 'expanded' && (
        <span className="inline-flex items-center gap-1 text-xs text-warning/80">
          <ShieldAlert className="w-3.5 h-3.5" />
          Sensitive content:
        </span>
      )}
      {kinds.map((k) => (
        <SensitiveKindChip key={k} kind={k} />
      ))}
    </div>
  );
}
