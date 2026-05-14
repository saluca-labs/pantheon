'use client';

/**
 * Autobiographer OS — VoiceProfileList.
 *
 * Stacks `VoiceProfileCard`s in version DESC order with a count header
 * and an empty-state copy block.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { Fingerprint } from 'lucide-react';
import { EmptyState } from '@/components/agentic-os/_shared/views';
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
      <EmptyState
        icon={<Fingerprint className="h-6 w-6" />}
        title="No voice profiles built yet"
        description="Build one from your active samples to unlock the Phase 7 chapter drafter."
      />
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
