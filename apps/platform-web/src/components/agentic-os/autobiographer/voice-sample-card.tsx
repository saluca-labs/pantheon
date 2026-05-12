'use client';

/**
 * Autobiographer OS — VoiceSampleCard.
 *
 * One row in the Voice Studio sample list. Shows the title (or first
 * ~60 chars of body), word count, memory-backed badge w/ link to the
 * source memory, archive/unarchive toggle, and edit/delete affordances.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, BookOpenText } from 'lucide-react';
import { VoiceSampleEditButton } from './voice-sample-edit-button';
import { deriveVoiceSampleTitle } from '@/lib/agentic-os/autobiographer/voice-samples';

export interface VoiceSampleCardData {
  id: string;
  title: string | null;
  bodyText: string;
  wordCount: number;
  isArchived: boolean;
  memoryId: string | null;
  updatedAt: string;
}

export interface VoiceSampleCardProps {
  sample: VoiceSampleCardData;
}

export function VoiceSampleCard({ sample }: VoiceSampleCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const displayTitle = sample.title?.trim()
    ? sample.title
    : deriveVoiceSampleTitle(sample.bodyText);

  async function toggleArchive() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/voice-samples/${sample.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isArchived: !sample.isArchived }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`rounded-xl border bg-[#1a1d27] p-4 transition ${
        sample.isArchived
          ? 'border-[#2a2d3e] opacity-60'
          : 'border-[#2a2d3e] hover:border-[#4361EE]/40'
      }`}
    >
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white truncate">
            {displayTitle}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-[#94a3b8]">
            <span>{sample.wordCount} words</span>
            <span>•</span>
            <span>Updated {new Date(sample.updatedAt).toLocaleDateString()}</span>
            {sample.memoryId && (
              <>
                <span>•</span>
                <Link
                  href={`/dashboard/os/autobiographer/memories/${sample.memoryId}`}
                  className="inline-flex items-center gap-1 text-[#4361EE] hover:underline"
                >
                  <BookOpenText className="w-3 h-3" />
                  Sourced from memory
                </Link>
              </>
            )}
            {sample.isArchived && (
              <>
                <span>•</span>
                <span className="text-amber-300">Archived</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleArchive}
            disabled={busy}
            className="text-xs px-2 py-1 rounded border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:text-white disabled:opacity-50 inline-flex items-center gap-1.5 transition"
            title={sample.isArchived ? 'Unarchive' : 'Archive'}
          >
            {sample.isArchived ? (
              <>
                <ArchiveRestore className="w-3.5 h-3.5" />
                Unarchive
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                Archive
              </>
            )}
          </button>
          <VoiceSampleEditButton
            sample={{
              id: sample.id,
              title: sample.title,
              bodyText: sample.bodyText,
            }}
          />
        </div>
      </header>

      <p className="text-sm text-[#cbd5e1]/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
        {sample.bodyText}
      </p>
    </article>
  );
}
