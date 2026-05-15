/**
 * Research coach — typing/streaming indicator.
 *
 * Tiny animated indicator rendered while the assistant turn streams in.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

export function CoachStreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-tertiary italic">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
      <span>Coach is typing…</span>
    </div>
  );
}
