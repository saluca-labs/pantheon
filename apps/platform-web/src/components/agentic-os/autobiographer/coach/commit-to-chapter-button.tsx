/**
 * Autobiographer coach — "Commit to chapter" CTA for chapter_drafter mode.
 *
 * Wraps the user's next ask in `{ commit_to_chapter: true, chapter_id }`
 * so the messages route writes a new chapter_revision row after the
 * stream completes. The button is only enabled when:
 *
 *   - The session is in `chapter_drafter` mode.
 *   - A `chapterId` is in scope (the conversation has been bound to a
 *     specific chapter via the session metadata or URL parameter).
 *   - The user has typed a non-empty next prompt.
 *
 * The actual fetch + stream-drain lives in the parent `CoachSession`
 * component; this button just exposes a checkbox-style toggle the
 * parent reads when assembling the request body.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

'use client';

import { CheckSquare, Square } from 'lucide-react';

interface Props {
  value: boolean;
  onChange: (next: boolean) => void;
  /** Chapter id this commit will target. Required for the button to enable. */
  chapterId: string | null;
  disabled?: boolean;
}

export function CommitToChapterButton({
  value,
  onChange,
  chapterId,
  disabled,
}: Props) {
  const canEnable = !!chapterId && !disabled;
  return (
    <button
      type="button"
      onClick={() => {
        if (!canEnable) return;
        onChange(!value);
      }}
      disabled={!canEnable}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition ${
        value
          ? 'bg-accent/15 text-text-primary border-accent/60'
          : 'bg-surface-0 text-text-secondary border-border-subtle hover:text-white'
      } disabled:opacity-40`}
      title={
        chapterId
          ? 'Toggle: when on, the next assistant turn is written as a new chapter revision'
          : 'No chapter in scope — open the coach from a chapter to enable this'
      }
    >
      {value ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
      Commit to chapter
    </button>
  );
}
