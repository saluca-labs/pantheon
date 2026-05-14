'use client';

/**
 * Autobiographer OS — VoiceProfileList.
 *
 * Stacks `VoiceProfileCard`s in version DESC order with a count header
 * and an empty-state copy block.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import {
  VoiceProfileCard,
  type VoiceProfileCardData,
} from './voice-profile-card';

export interface VoiceProfileListProps {
  initial: VoiceProfileCardData[];
}

export function VoiceProfileList({ initial }: VoiceProfileListProps) {
  if (initial.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 text-center text-sm text-text-secondary">
        No voice profiles built yet. Build one from your active samples to
        unlock the Phase 7 chapter drafter.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {initial.map((p) => (
        <VoiceProfileCard key={p.id} profile={p} />
      ))}
    </div>
  );
}
