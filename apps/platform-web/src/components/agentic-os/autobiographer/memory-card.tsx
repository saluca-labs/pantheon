'use client';

/**
 * Autobiographer OS — MemoryCard.
 *
 * Compact memory row used by the workshop list and per-book detail page.
 * Surfaces title, era label, location, content + emotion tag chips, and
 * a one-line body preview. The sensitive flag adds a discreet badge so
 * the author can see at a glance which captures need Phase 6 review.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { Calendar, MapPin, ShieldAlert, ImageIcon, Mic } from 'lucide-react';
import {
  MEMORY_SOURCE_LABELS,
  type MemorySource,
} from '@/lib/agentic-os/autobiographer/memories';

export interface MemoryCardData {
  id: string;
  bookId: string | null;
  title: string;
  bodyMarkdown: string;
  whenInLife: string | null;
  eraDateEstimate: string | null;
  location: string | null;
  contentTags: string[];
  emotionTags: string[];
  isSensitive: boolean;
  source: MemorySource;
  photoUrls: string[];
  audioUrl: string | null;
  updatedAt: string;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

export function MemoryCard({ memory }: { memory: MemoryCardData }) {
  const preview = truncate(memory.bodyMarkdown.replace(/\s+/g, ' '), 180);
  const hasPhotos = memory.photoUrls.length > 0;
  const hasAudio = Boolean(memory.audioUrl);

  return (
    <Link
      href={`/dashboard/os/autobiographer/memories/${memory.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 p-4 hover:border-accent/60 transition group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-white font-medium group-hover:text-accent transition truncate">
          {memory.title}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          {memory.isSensitive && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 inline-flex items-center gap-1"
              title="Marked sensitive — Phase 6 review will surface this"
            >
              <ShieldAlert className="w-3 h-3" />
              Sensitive
            </span>
          )}
          {hasPhotos && (
            <span
              className="text-[10px] text-text-secondary inline-flex items-center gap-0.5"
              title={`${memory.photoUrls.length} photo${memory.photoUrls.length === 1 ? '' : 's'}`}
            >
              <ImageIcon className="w-3 h-3" />
              {memory.photoUrls.length}
            </span>
          )}
          {hasAudio && (
            <span
              className="text-[10px] text-text-secondary inline-flex items-center gap-0.5"
              title="Has audio"
            >
              <Mic className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-text-secondary leading-relaxed mb-2">{preview}</p>

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-secondary">
        {(memory.whenInLife || memory.eraDateEstimate) && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {memory.whenInLife ?? memory.eraDateEstimate}
          </span>
        )}
        {memory.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {memory.location}
          </span>
        )}
        <span className="text-[#64748b]">{MEMORY_SOURCE_LABELS[memory.source]}</span>
      </div>

      {(memory.contentTags.length > 0 || memory.emotionTags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {memory.contentTags.slice(0, 4).map((t) => (
            <span
              key={`c-${t}`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-primary"
            >
              {t}
            </span>
          ))}
          {memory.emotionTags.slice(0, 4).map((t) => (
            <span
              key={`e-${t}`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/5 border border-rose-500/20 text-rose-200/80"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
