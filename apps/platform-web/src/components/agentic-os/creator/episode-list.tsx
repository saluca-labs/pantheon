'use client';

/**
 * Creator OS Phase 6 — Podcast episode list component.
 *
 * Wave C-4a (UI Depth Wave): the "no podcast configured" and "no episodes
 * yet" ad-hoc states are now the shared `EmptyState` primitive (the
 * configure-show CTA is preserved as the primary action), and an
 * `EntitySearch` bar filters episodes client-side by title. Routing and
 * the new-episode flow are unchanged.
 *
 * @license MIT — Tiresias Creator OS Phase 6 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Plus } from 'lucide-react';
import { EntitySearch, EmptyState } from '@/components/agentic-os/_shared/views';
import type {
  CreatorEpisode,
  CreatorPodcast,
  EpisodeStatus,
} from '@/lib/agentic-os/creator/podcast';

interface EpisodeListProps {
  episodes: CreatorEpisode[];
  podcast: CreatorPodcast | null;
}

const STATUS_COLORS: Record<EpisodeStatus, string> = {
  draft: 'bg-gray-500/20 text-gray-300',
  published: 'bg-emerald-500/20 text-emerald-300',
  archived: 'bg-amber-500/20 text-amber-300',
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function EpisodeList({ episodes, podcast }: EpisodeListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  if (!podcast) {
    return (
      <EmptyState
        icon={<Mic className="h-6 w-6" />}
        title="No podcast configured yet"
        description="Set up your podcast show settings before creating episodes."
        primaryCta={{
          label: 'Configure show',
          href: '/dashboard/os/creator/podcast/settings',
        }}
      />
    );
  }

  const filtered = episodes.filter((ep) => {
    if (!searchQuery.trim()) return true;
    return ep.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{podcast.title}</h1>
          {podcast.author && (
            <p className="text-sm text-zinc-400 mt-1">by {podcast.author}</p>
          )}
        </div>
        <button
          onClick={() =>
            router.push('/dashboard/os/creator/podcast/episodes/new')
          }
          className="inline-flex items-center gap-2 rounded-lg bg-os-creator px-4 py-2 text-sm font-semibold text-white hover:bg-os-creator/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Episode
        </button>
      </div>

      {episodes.length > 0 && (
        <EntitySearch
          placeholder="Search episodes by title…"
          defaultValue={searchQuery}
          onQueryChange={setSearchQuery}
        />
      )}

      {filtered.length === 0 ? (
        searchQuery ? (
          <EmptyState
            icon={<Mic className="h-6 w-6" />}
            title="No episodes match"
            description="Try a different search term."
          />
        ) : (
          <EmptyState
            icon={<Mic className="h-6 w-6" />}
            title="No episodes yet"
            description="Create your first episode to start building your show."
            primaryCta={{
              label: 'New Episode',
              href: '/dashboard/os/creator/podcast/episodes/new',
              icon: <Plus className="h-4 w-4" />,
            }}
          />
        )
      ) : (
        <div className="grid gap-3">
          {filtered.map((ep) => (
            <button
              key={ep.id}
              onClick={() =>
                router.push(`/dashboard/os/creator/podcast/episodes/${ep.id}`)
              }
              className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 text-left hover:border-zinc-700 hover:bg-zinc-900/80 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium text-zinc-100 truncate">
                    {ep.title}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[ep.status]
                    }`}
                  >
                    {ep.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                  {ep.seasonNumber != null && (
                    <span>S{ep.seasonNumber}</span>
                  )}
                  {ep.episodeNumber != null && (
                    <span>E{ep.episodeNumber}</span>
                  )}
                  {ep.durationSeconds != null && (
                    <span>{formatDuration(ep.durationSeconds)}</span>
                  )}
                  <span className="capitalize">{ep.episodeType}</span>
                </div>
              </div>
              <svg className="h-4 w-4 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
