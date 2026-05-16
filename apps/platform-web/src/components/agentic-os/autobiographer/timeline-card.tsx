/**
 * Autobiographer OS — TimelineCard.
 *
 * One memory in the timeline. Renders date / era, title, body excerpt,
 * theme chips, attached-book pill, and arc-membership stripes when the
 * memory feeds chapters in any arc.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import Link from 'next/link';
import { BookOpenText, Calendar, ArrowRight, GitBranch, Lock } from 'lucide-react';
import { ThemeList } from './theme-list';
import type { TimelineMemory } from '@/lib/agentic-os/autobiographer/timeline';

export interface TimelineCardProps {
  memory: TimelineMemory;
}

function excerpt(body: string, max = 220): string {
  if (body.length <= max) return body;
  return body.slice(0, max).trimEnd() + '…';
}

export function TimelineCard({ memory }: TimelineCardProps) {
  return (
    <article className="rounded-xl border border-border-subtle bg-surface-2 p-5 hover:border-accent/30 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-2 text-[10px] text-text-secondary uppercase tracking-wide mb-1">
            {memory.eraDateEstimate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {memory.eraDateEstimate}
              </span>
            )}
            {memory.whenInLife && (
              <span className="text-text-primary">{memory.whenInLife}</span>
            )}
            {memory.isSensitive && (
              <span className="inline-flex items-center gap-1 text-warning">
                <Lock className="w-3 h-3" />
                sensitive
              </span>
            )}
          </header>
          <h3 className="text-base font-semibold text-white">{memory.title}</h3>
          {memory.bodyMarkdown && (
            <p className="text-sm text-text-primary/90 leading-relaxed mt-1">
              {excerpt(memory.bodyMarkdown)}
            </p>
          )}
          {memory.themes.length > 0 && (
            <div className="mt-2">
              <ThemeList themes={memory.themes} size="sm" />
            </div>
          )}
          {memory.arcs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <GitBranch className="w-3 h-3 text-accent/60" />
              {memory.arcs.map((a) => (
                <span
                  key={`${a.arcId}-${a.chapterId}`}
                  className="text-[10px] px-1.5 py-0.5 rounded-full border border-border-subtle bg-surface-0 text-text-primary"
                  title={`Position ${a.position + 1} in arc`}
                >
                  {a.arcTitle}
                </span>
              ))}
            </div>
          )}
          {memory.bookTitle && (
            <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-secondary">
              <BookOpenText className="w-3 h-3" />
              {memory.bookTitle}
            </div>
          )}
        </div>
        <Link
          href={`/dashboard/os/autobiographer/memories/${memory.id}`}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white hover:border-accent/40 transition shrink-0"
        >
          Open
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </article>
  );
}
