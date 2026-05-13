'use client';

import { useRouter } from 'next/navigation';
import type { CreatorEpisode, CreatorPodcast, EpisodeStatus } from '@/lib/agentic-os/creator/podcast';

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

  if (!podcast) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">
          No podcast configured yet
        </h2>
        <p className="text-zinc-400 mb-6 max-w-md">
          Set up your podcast show settings before creating episodes.
        </p>
        <button
          onClick={() => router.push('/dashboard/os/creator/podcast/settings')}
          className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-500/20 px-4 py-2 text-sm font-medium text-fuchsia-300 hover:bg-fuchsia-500/30 transition-colors"
        >
          Configure show
        </button>
      </div>
    );
  }

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
          className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-400 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Episode
        </button>
      </div>

      {episodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-zinc-500">No episodes yet. Create your first episode!</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {episodes.map((ep) => (
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
