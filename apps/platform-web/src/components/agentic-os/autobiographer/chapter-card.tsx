/**
 * Autobiographer OS — ChapterCard.
 *
 * Row card used inside the book detail page's chapter list. Shows
 * title + slug, status pill, word-count from the latest revision, and
 * last-updated timestamp.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import Link from 'next/link';
import { FileText, Clock } from 'lucide-react';
import { ChapterStatusPill } from './chapter-status-pill';
import type { ChapterStatus } from '@/lib/agentic-os/autobiographer/chapters';

export interface ChapterCardData {
  id: string;
  title: string | null;
  slug: string | null;
  position: number;
  status: ChapterStatus;
  summary: string | null;
  targetWordCount: number | null;
  /** Latest revision word count (0 if no revisions yet). */
  latestWordCount: number;
  /** Revision count across versions. */
  revisionCount: number;
  updatedAt: string;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return iso.slice(0, 10);
}

export function ChapterCard({ chapter }: { chapter: ChapterCardData }) {
  const title = chapter.title ?? 'Untitled chapter';
  const positionLabel = String(chapter.position + 1).padStart(2, '0');
  return (
    <Link
      href={`/dashboard/os/autobiographer/chapters/${chapter.id}`}
      className="block rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
    >
      <div className="flex items-start gap-3">
        <div className="text-xs text-[#94a3b8] font-mono mt-0.5 w-8 shrink-0">
          {positionLabel}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium group-hover:text-[#4361EE] transition truncate">
              {title}
            </h3>
            <ChapterStatusPill status={chapter.status} />
            {chapter.slug ? (
              <span className="text-[10px] font-mono text-[#64748b] truncate">
                {chapter.slug}
              </span>
            ) : null}
          </div>
          {chapter.summary ? (
            <p className="text-xs text-[#94a3b8] line-clamp-2 leading-relaxed">
              {chapter.summary}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8] pt-0.5">
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              {chapter.latestWordCount.toLocaleString()} words
              {chapter.targetWordCount
                ? ` / ${chapter.targetWordCount.toLocaleString()}`
                : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatRelative(chapter.updatedAt)}
            </span>
            <span>
              {chapter.revisionCount}{' '}
              {chapter.revisionCount === 1 ? 'revision' : 'revisions'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
