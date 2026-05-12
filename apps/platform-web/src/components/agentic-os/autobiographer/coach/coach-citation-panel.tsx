/**
 * Autobiographer coach — chapter_drafter citation map panel.
 *
 * Renders the parsed citation entries from the chapter_drafter
 * assistant output. One row per `[cites: …]` marker (one cited
 * paragraph). Each row lists its source memories as chips.
 *
 * The parsing is done client-side from the raw assistant text using
 * `parseCitations` — same regex / shape the route's commit handler
 * uses on the server side, so what the user sees here matches the
 * row that would persist on commit.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

'use client';

import { useMemo } from 'react';
import { Quote } from 'lucide-react';
import { parseCitations } from '@/lib/agentic-os/autobiographer/coach/citations';
import { CoachCitationChip } from './coach-citation-chip';

interface Props {
  /** The full assistant message text. */
  assistantText: string;
  /** Memory id → display title map for chip labels. */
  memoryTitles?: Record<string, string | null>;
}

export function CoachCitationPanel({ assistantText, memoryTitles }: Props) {
  const citations = useMemo(() => parseCitations(assistantText), [assistantText]);
  if (citations.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3 text-xs text-[#64748b] italic">
        No citation markers yet. The drafter appends a{' '}
        <code className="font-mono">[cites: …]</code> line after each paragraph;
        none have been emitted on this turn.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#cbd5e1]">
        <Quote className="w-3.5 h-3.5 text-[#4361EE]" />
        Citation map ({citations.length}{' '}
        {citations.length === 1 ? 'paragraph' : 'paragraphs'})
      </div>
      <ol className="space-y-2">
        {citations.map((c) => (
          <li
            key={c.paragraph_index}
            className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] p-3 space-y-1.5"
          >
            <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">
              Paragraph {c.paragraph_index}
            </div>
            <div className="flex flex-wrap gap-1">
              {c.memory_ids.map((mid) => (
                <CoachCitationChip
                  key={mid}
                  memoryId={mid}
                  title={memoryTitles?.[mid] ?? null}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
