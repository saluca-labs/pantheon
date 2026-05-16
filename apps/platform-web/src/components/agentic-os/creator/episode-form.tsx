'use client';

import { useId, useState } from 'react';
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

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

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
    } catch (err: unknown) {
      const errErr = err instanceof Error ? err : new Error(String(err));
      setError(errErr.message ?? 'Failed to save');
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
    } catch (err: unknown) {
      const errErr = err instanceof Error ? err : new Error(String(err));
      setError(errErr.message ?? 'Failed to publish');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">
          {isNew ? 'New Episode' : 'Edit Episode'}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-os-creator px-4 py-2 text-sm font-semibold text-white hover:bg-os-creator/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {isDraft && episode && (
            <button
              onClick={handlePublish}
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-white hover:bg-positive/90 disabled:opacity-50 transition-colors"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label htmlFor={fid('title')} className="block text-sm font-medium text-text-secondary mb-1.5">
            Title <span className="text-danger">*</span>
          </label>
          <input
            id={fid('title')}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Episode title"
            className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor={fid('description')} className="block text-sm font-medium text-text-secondary mb-1.5">
            Description
          </label>
          <textarea
            id={fid('description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Episode description..."
            rows={3}
            className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator resize-y"
          />
        </div>

        {/* Audio file URL */}
        <div>
          <label htmlFor={fid('audio-url')} className="block text-sm font-medium text-text-secondary mb-1.5">
            Audio File URL
          </label>
          <input
            id={fid('audio-url')}
            type="text"
            value={audioFileUrl}
            onChange={(e) => setAudioFileUrl(e.target.value)}
            placeholder="https://storage.example.com/episodes/ep1.mp3"
            className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
          />
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor={fid('duration')} className="block text-sm font-medium text-text-secondary mb-1.5">
              Duration (seconds)
            </label>
            <input
              id={fid('duration')}
              type="number"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              placeholder="3600"
              className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
            />
          </div>
          <div>
            <label htmlFor={fid('file-size')} className="block text-sm font-medium text-text-secondary mb-1.5">
              File Size (bytes)
            </label>
            <input
              id={fid('file-size')}
              type="number"
              value={fileSizeBytes}
              onChange={(e) => setFileSizeBytes(e.target.value)}
              placeholder="50000000"
              className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
            />
          </div>
          <div>
            <label htmlFor={fid('mime-type')} className="block text-sm font-medium text-text-secondary mb-1.5">
              MIME Type
            </label>
            <input
              id={fid('mime-type')}
              type="text"
              value={mimeType}
              onChange={(e) => setMimeType(e.target.value)}
              placeholder="audio/mpeg"
              className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
            />
          </div>
        </div>

        {/* Season / Episode row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor={fid('season')} className="block text-sm font-medium text-text-secondary mb-1.5">
              Season
            </label>
            <input
              id={fid('season')}
              type="number"
              value={seasonNumber}
              onChange={(e) => setSeasonNumber(e.target.value)}
              placeholder="1"
              className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
            />
          </div>
          <div>
            <label htmlFor={fid('episode-num')} className="block text-sm font-medium text-text-secondary mb-1.5">
              Episode #
            </label>
            <input
              id={fid('episode-num')}
              type="number"
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(e.target.value)}
              placeholder="auto"
              className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
            />
          </div>
          <div>
            <label htmlFor={fid('episode-type')} className="block text-sm font-medium text-text-secondary mb-1.5">
              Type
            </label>
            <select
              id={fid('episode-type')}
              value={episodeType}
              onChange={(e) => setEpisodeType(e.target.value as EpisodeType)}
              className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator"
            >
              <option value="full">Full</option>
              <option value="trailer">Trailer</option>
              <option value="bonus">Bonus</option>
            </select>
          </div>
        </div>

        {/* Show notes */}
        <div>
          <label htmlFor={fid('notes')} className="block text-sm font-medium text-text-secondary mb-1.5">
            Show Notes (Markdown)
          </label>
          <textarea
            id={fid('notes')}
            value={notesMd}
            onChange={(e) => setNotesMd(e.target.value)}
            placeholder="## Show Notes&#10;&#10;- Topic 1&#10;- Topic 2"
            rows={8}
            className="w-full rounded-lg border border-border-strong bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-os-creator focus:outline-none focus:ring-1 focus:ring-os-creator font-mono resize-y"
          />
        </div>
      </div>
    </div>
  );
}
