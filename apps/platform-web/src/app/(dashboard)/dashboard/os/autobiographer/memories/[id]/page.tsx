/**
 * Autobiographer OS — memory detail + edit page.
 *
 * Reads the memory by id, enforces user ownership via the repo's
 * user_id filter, and renders the full record. The edit button opens
 * MemoryForm in edit mode; the delete button is gated by a confirm()
 * prompt (memories are precious — UI confirms).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  ShieldAlert,
  Tag as TagIcon,
  Mic,
  ImageIcon,
} from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getMemory } from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  getBook,
  listBooks,
} from '@/lib/agentic-os/autobiographer/books-repo';
import { listPeople } from '@/lib/agentic-os/autobiographer/people-repo';
import { listPeopleForMemory } from '@/lib/agentic-os/autobiographer/memory-people-repo';
import { getVoiceSampleByMemory } from '@/lib/agentic-os/autobiographer/voice-samples-repo';
import { MEMORY_SOURCE_LABELS } from '@/lib/agentic-os/autobiographer/memories';
import { MemoryEditButton } from '@/components/agentic-os/autobiographer/memory-edit-button';
import { MemoryPeoplePicker } from '@/components/agentic-os/autobiographer/memory-people-picker';
import { MemoryThemesSection } from '@/components/agentic-os/autobiographer/memory-themes-section';
import { VoiceSampleToggle } from '@/components/agentic-os/autobiographer/voice-sample-toggle';
import { SensitiveKindsBadges } from '@/components/agentic-os/autobiographer/sensitive-kinds-badges';
import { SensitiveKindsPicker } from '@/components/agentic-os/autobiographer/sensitive-kinds-picker';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MemoryDetailPage({ params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const memory = await getMemory(id, user.userId);
  if (!memory) notFound();

  const [book, allBooks, linkedPeople, allPeople, voiceSample] =
    await Promise.all([
      memory.bookId
        ? getBook(memory.bookId, user.userId)
        : Promise.resolve(null),
      listBooks({ userId: user.userId, limit: 50 }),
      listPeopleForMemory(memory.id, user.userId),
      listPeople({ userId: user.userId, limit: 200 }),
      getVoiceSampleByMemory(memory.id, user.userId),
    ]);

  const bookOptions = allBooks.map((b) => ({ id: b.id, title: b.title }));

  const linkedPickerPeople = linkedPeople.map((lp) => ({
    id: lp.person.id,
    canonicalName: lp.person.canonicalName,
    consentToPublish: lp.person.consentToPublish,
    role: lp.role,
    notes: lp.notes,
  }));
  const availablePickerPeople = allPeople.map((p) => ({
    id: p.id,
    canonicalName: p.canonicalName,
    aliases: p.aliases,
    consentToPublish: p.consentToPublish,
  }));

  return (
    <div className="max-w-3xl space-y-5">
      <Link
        href="/dashboard/os/autobiographer/memories"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All memory captures
      </Link>

      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-white">{memory.title}</h1>
            <p className="text-xs text-[#94a3b8] mt-1">
              Last updated {new Date(memory.updatedAt).toLocaleString()}
              {' • '}
              {MEMORY_SOURCE_LABELS[memory.source]}
            </p>
          </div>
          <MemoryEditButton
            memory={{
              id: memory.id,
              bookId: memory.bookId,
              title: memory.title,
              bodyMarkdown: memory.bodyMarkdown,
              transcript: memory.transcript,
              audioUrl: memory.audioUrl,
              photoUrls: memory.photoUrls,
              whenInLife: memory.whenInLife,
              eraDateEstimate: memory.eraDateEstimate,
              location: memory.location,
              emotionTags: memory.emotionTags,
              contentTags: memory.contentTags,
              isSensitive: memory.isSensitive,
              source: memory.source,
            }}
            books={bookOptions}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
          {(memory.whenInLife || memory.eraDateEstimate) && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {memory.whenInLife ?? memory.eraDateEstimate}
            </span>
          )}
          {memory.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {memory.location}
            </span>
          )}
          {book && (
            <Link
              href={`/dashboard/os/autobiographer/books/${book.id}`}
              className="inline-flex items-center gap-1 text-[#4361EE] hover:underline"
            >
              <TagIcon className="w-3.5 h-3.5" />
              {book.title}
            </Link>
          )}
          {!book && (
            <span className="italic text-[#64748b]">Workshop-only (no book)</span>
          )}
          {memory.isSensitive && (
            <span className="inline-flex items-center gap-1 text-rose-300">
              <ShieldAlert className="w-3.5 h-3.5" />
              Marked sensitive
            </span>
          )}
        </div>

        {(memory.contentTags.length > 0 || memory.emotionTags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {memory.contentTags.map((t) => (
              <span
                key={`c-${t}`}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#2a2d3e] text-[#cbd5e1]"
              >
                {t}
              </span>
            ))}
            {memory.emotionTags.map((t) => (
              <span
                key={`e-${t}`}
                className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/5 border border-rose-500/20 text-rose-200/80"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {memory.sensitiveKinds.length > 0 && (
        <SensitiveKindsBadges kinds={memory.sensitiveKinds} variant="expanded" />
      )}

      <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <h2 className="text-sm uppercase tracking-wide text-[#94a3b8] mb-3">
          Memory
        </h2>
        <pre className="whitespace-pre-wrap text-sm text-[#cbd5e1] font-sans leading-relaxed">
          {memory.bodyMarkdown}
        </pre>
      </section>

      <SensitiveKindsPicker
        endpoint={`/api/tiresias/agentic-os/autobiographer/memories/${memory.id}`}
        initial={memory.sensitiveKinds}
      />

      <MemoryPeoplePicker
        memoryId={memory.id}
        linked={linkedPickerPeople}
        available={availablePickerPeople}
      />

      <MemoryThemesSection memoryId={memory.id} />

      <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm uppercase tracking-wide text-[#94a3b8] mb-1">
              Voice sample
            </h2>
            <p className="text-xs text-[#64748b]">
              Mark this memory as a sample of your voice so the Phase 3
              voice builder picks it up. Sourced samples are CASCADE-deleted
              if you delete the memory.
            </p>
          </div>
          <VoiceSampleToggle
            memoryId={memory.id}
            memoryTitle={memory.title}
            memoryBody={memory.bodyMarkdown}
            existingSampleId={voiceSample?.id ?? null}
          />
        </div>
      </section>

      {memory.audioUrl && (
        <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <h2 className="text-sm uppercase tracking-wide text-[#94a3b8] mb-3 inline-flex items-center gap-1.5">
            <Mic className="w-4 h-4" />
            Audio
          </h2>
          <a
            href={memory.audioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#4361EE] hover:underline break-all"
          >
            {memory.audioUrl}
          </a>
          {memory.transcript && (
            <>
              <h3 className="text-xs uppercase tracking-wide text-[#94a3b8] mt-4 mb-2">
                Transcript
              </h3>
              <pre className="whitespace-pre-wrap text-sm text-[#cbd5e1] font-sans leading-relaxed">
                {memory.transcript}
              </pre>
            </>
          )}
        </section>
      )}

      {memory.photoUrls.length > 0 && (
        <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <h2 className="text-sm uppercase tracking-wide text-[#94a3b8] mb-3 inline-flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4" />
            Photos
          </h2>
          <ul className="space-y-1">
            {memory.photoUrls.map((u) => (
              <li key={u}>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#4361EE] hover:underline break-all"
                >
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
