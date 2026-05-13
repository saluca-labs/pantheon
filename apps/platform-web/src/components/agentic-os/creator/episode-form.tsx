'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreatorEpisode, EpisodeType } from '@/lib/agentic-os/creator/podcast';

interface EpisodeFormProps {
  episode?: CreatorEpisode;
  podcastId: string;
  isNew?: boolean;
}

export function EpisodeForm({ episode, podcastId, isNew }: EpisodeFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(episode?.title ?? '');
  const [description, setDescription] = useState(episode?.description ?? '');
  const [audioFileUrl, setAudioFileUrl] = useState(episode?.audioFileUrl ?? '');
  const [durationSeconds, setDurationSeconds] = useState(
    episode?.durationSeconds?.toString() ?? '',
  );
  const [seasonNumber, setSeasonNumber] = useState(
    episode?.seasonNumber?.toString() ?? '',
  );
  const [episodeNumber, setEpisodeNumber] = useState(
    episode?.episodeNumber?.toString() ?? '',
  );
  const [episodeType, setEpisodeType] = useState<EpisodeType>(
    episode?.episodeType ?? 'full',
  );
  const [notesMd, setNotesMd] = useState(episode?.notesMd ?? '');
  const [fileSizeBytes, setFileSizeBytes] = useState(
    episode?.fileSizeBytes?.toString() ?? '',
  );
  const [mimeType, setMimeType] = useState(episode?.mimeType ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDraft = !episode || episode.status === 'draft';

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { title: title.trim() };

      if (description) body.description = description;
      if (audioFileUrl) body.audioFileUrl = audioFileUrl;
      if (durationSeconds) body.durationSeconds = parseInt(durationSeconds, 10);
      if (seasonNumber) body.seasonNumber = parseInt(seasonNumber, 10);
      if (episodeNumber) body.episodeNumber = parseInt(episodeNumber, 10);
      body.episodeType = episodeType;
      if (notesMd) body.notesMd = notesMd;
      if (fileSizeBytes) body.fileSizeBytes = parseInt(fileSizeBytes, 10);
      if (mimeType) body.mimeType = mimeType;

      let res: Response;
      if (isNew) {
        res = await fetch('/api/tiresias/agentic-os/creator/podcast/episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(
          `/api/tiresias/agentic-os/creator/podcast/episodes/${episode!.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save');
      }

      const saved: CreatorEpisode = await res.json();
      if (isNew) {
        router.push(`/dashboard/os/creator/podcast/episodes/${saved.id}`);
      } else {
        router.push('/dashboard/os/creator/podcast');
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!episode) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/creator/podcast/episodes/${episode.id}/publish`,
        { method: 'POST' },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to publish');
      }

      router.push('/dashboard/os/creator/podcast');
    } catch (err: any) {
      setError(err.message ?? 'Failed to publish');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">
          {isNew ? 'New Episode' : 'Edit Episode'}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-400 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {isDraft && episode && (
            <button
              onClick={handlePublish}
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50 transition-colors"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Episode title"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Episode description..."
            rows={3}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 resize-y"
          />
        </div>

        {/* Audio file URL */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Audio File URL
          </label>
          <input
            type="text"
            value={audioFileUrl}
            onChange={(e) => setAudioFileUrl(e.target.value)}
            placeholder="https://storage.example.com/episodes/ep1.mp3"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Duration (seconds)
            </label>
            <input
              type="number"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              placeholder="3600"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              File Size (bytes)
            </label>
            <input
              type="number"
              value={fileSizeBytes}
              onChange={(e) => setFileSizeBytes(e.target.value)}
              placeholder="50000000"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              MIME Type
            </label>
            <input
              type="text"
              value={mimeType}
              onChange={(e) => setMimeType(e.target.value)}
              placeholder="audio/mpeg"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
        </div>

        {/* Season / Episode row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Season
            </label>
            <input
              type="number"
              value={seasonNumber}
              onChange={(e) => setSeasonNumber(e.target.value)}
              placeholder="1"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Episode #
            </label>
            <input
              type="number"
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(e.target.value)}
              placeholder="auto"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Type
            </label>
            <select
              value={episodeType}
              onChange={(e) => setEpisodeType(e.target.value as EpisodeType)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            >
              <option value="full">Full</option>
              <option value="trailer">Trailer</option>
              <option value="bonus">Bonus</option>
            </select>
          </div>
        </div>

        {/* Show notes */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Show Notes (Markdown)
          </label>
          <textarea
            value={notesMd}
            onChange={(e) => setNotesMd(e.target.value)}
            placeholder="## Show Notes&#10;&#10;- Topic 1&#10;- Topic 2"
            rows={8}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 font-mono resize-y"
          />
        </div>
      </div>
    </div>
  );
}
