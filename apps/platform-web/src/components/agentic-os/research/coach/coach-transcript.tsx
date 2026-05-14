/**
 * Research coach — scrolling transcript.
 *
 * Stack of message bubbles + streaming indicator + empty state. The
 * parent ref is used by the session component to programmatically
 * scroll to the bottom after each delta.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

'use client';

import { forwardRef } from 'react';
import type { CoachMode } from '@/lib/agentic-os/research/coach/modes';
import { CoachMessage, type CoachUiMessage } from './coach-message';
import { CoachStreamingIndicator } from './coach-streaming-indicator';
import { CoachEmptyState } from './coach-empty-state';

interface Props {
  mode: CoachMode;
  messages: CoachUiMessage[];
  streaming: boolean;
}

export const CoachTranscript = forwardRef<HTMLDivElement, Props>(
  function CoachTranscript({ mode, messages, streaming }, ref) {
    const empty = messages.length === 0;
    return (
      <div
        ref={ref}
        className="flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-0 p-4 space-y-4"
      >
        {empty && !streaming && <CoachEmptyState mode={mode} />}
        {messages.map((m, i) => (
          <CoachMessage key={i} message={m} />
        ))}
        {streaming && messages[messages.length - 1]?.content === '' && (
          <CoachStreamingIndicator />
        )}
      </div>
    );
  },
);
