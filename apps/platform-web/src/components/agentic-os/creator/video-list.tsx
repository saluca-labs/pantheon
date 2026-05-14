'use client';

/**
 * Creator OS Phase 5 — Video list component.
 *
 * Displays a grid of video cards with thumbnail, title, duration, and status
 * badge. "Add Video" button opens an inline form. Click navigates to video
 * detail page.
 *
 * Wave C-4a (UI Depth Wave): adds the shared `EntitySearch` primitive for
 * client-side title/description filtering, and swaps the ad-hoc empty
 * state for `EmptyState`. The inline add-form and card routing are
 * unchanged.
 *
 * @license MIT — Tiresias Creator OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Plus, Clock, X } from 'lucide-react';
import { EntitySearch, EmptyState } from '@/components/agentic-os/_shared/views';
import { VideoForm } from './video-form';
import type { CreatorVideoAsset } from '@/lib/agentic-os/creator/video';

interface VideoListProps {
  videos: CreatorVideoAsset[];
}

const STATUS_COLORS: Record<string, string> = {
  processing: 'bg-amber-500/20 text-amber-400',
  ready: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VideoCard({ video }: { video: CreatorVideoAsset }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboard/os/creator/videos/${video.id}`)}
      className="group relative rounded-lg border border-border-subtle bg-surface-2 p-0 text-left hover:border-os-creator/50 hover:bg-surface-3 transition-colors overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-surface-0 flex items-center justify-center overflow-hidden">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Video className="w-10 h-10 text-text-tertiary" />
        )}

        {/* Duration badge */}
        {video.durationSeconds != null && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 text-[11px] text-white font-mono">
            <Clock className="w-3 h-3" />
            {formatDuration(video.durationSeconds)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-white text-sm mb-1 truncate">
          {video.title}
        </h3>

        {video.description && (
          <p className="text-xs text-text-tertiary mb-3 line-clamp-2">
            {video.description}
          </p>
        )}

        <span
          className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[video.status] ?? STATUS_COLORS.ready}`}
        >
          {video.status}
        </span>
      </div>
    </button>
  );
}

export function VideoList({ videos }: VideoListProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = videos.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.title.toLowerCase().includes(q) ||
      (v.description ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Videos</h2>
          <p className="text-sm text-text-tertiary mt-0.5">
            Video library with HLS streaming playback via Video.js player.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-os-creator text-white text-sm font-medium hover:bg-os-creator/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Video
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="relative rounded-lg border border-border-subtle bg-surface-2 p-6">
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="absolute top-4 right-4 text-text-tertiary hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <VideoForm
            isNew
            onSuccess={(video) => {
              setShowForm(false);
              router.push(`/dashboard/os/creator/videos/${video.id}`);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Search */}
      {videos.length > 0 && (
        <EntitySearch
          placeholder="Search videos by title or description…"
          defaultValue={searchQuery}
          onQueryChange={setSearchQuery}
        />
      )}

      {/* Video grid */}
      {filtered.length === 0 && !showForm ? (
        searchQuery ? (
          <EmptyState
            icon={<Video className="h-6 w-6" />}
            title="No videos match"
            description="Try a different search term."
          />
        ) : (
          <EmptyState
            icon={<Video className="h-6 w-6" />}
            title="No videos yet"
            description="Add your first video by providing an HLS manifest URL."
            primaryCta={{
              label: 'Add Video',
              onClick: () => setShowForm(true),
              icon: <Plus className="h-4 w-4" />,
            }}
          />
        )
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
