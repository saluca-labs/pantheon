'use client';

/**
 * Creator OS Phase 5 — Video form component.
 *
 * Create or edit a video asset. Only stores an HLS manifest URL — no file
 * upload, no ffmpeg, no transcoding.
 *
 * @license MIT — Tiresias Creator OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft } from 'lucide-react';
import type {
  CreatorVideoAsset,
  CreateVideoAssetInput,
  UpdateVideoAssetInput,
} from '@/lib/agentic-os/creator/video';

interface VideoFormProps {
  /** Pre-populate for an edit flow. */
  video?: CreatorVideoAsset;
  /** If true, the form is creating a new video (POST). */
  isNew?: boolean;
  /** Called with the created/updated video after successful save. */
  onSuccess?: (video: CreatorVideoAsset) => void;
  /** Called when the user cancels the form. */
  onCancel?: () => void;
}

export function VideoForm({ video, isNew, onSuccess, onCancel }: VideoFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(video?.title ?? '');
  const [description, setDescription] = useState(video?.description ?? '');
  const [url, setUrl] = useState(video?.url ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(video?.thumbnailUrl ?? '');
  const [durationSeconds, setDurationSeconds] = useState(
    video?.durationSeconds != null ? String(video.durationSeconds) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle(video?.title ?? '');
    setDescription(video?.description ?? '');
    setUrl(video?.url ?? '');
    setThumbnailUrl(video?.thumbnailUrl ?? '');
    setDurationSeconds(
      video?.durationSeconds != null ? String(video.durationSeconds) : '',
    );
    setError(null);
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!url.trim()) {
      setError('HLS manifest URL is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isNew) {
        const body: CreateVideoAssetInput = {
          title: title.trim(),
          url: url.trim(),
        };
        if (description.trim()) body.description = description.trim();
        if (thumbnailUrl.trim()) body.thumbnailUrl = thumbnailUrl.trim();
        if (durationSeconds.trim()) {
          body.durationSeconds = parseInt(durationSeconds.trim(), 10);
        }

        const r = await fetch('/api/tiresias/agentic-os/creator/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error((data as any).error ?? 'Failed to create video');
        }

        const created = await r.json();
        onSuccess?.(created);
        router.refresh();
      } else if (video) {
        const patch: UpdateVideoAssetInput = {};
        if (title.trim() !== video.title) patch.title = title.trim();
        if (description.trim() !== (video.description ?? ''))
          patch.description = description.trim() || null;
        if (url.trim() !== video.url) patch.url = url.trim();
        if (thumbnailUrl.trim() !== (video.thumbnailUrl ?? ''))
          patch.thumbnailUrl = thumbnailUrl.trim() || null;
        if (durationSeconds.trim()) {
          const d = parseInt(durationSeconds.trim(), 10);
          if (d !== video.durationSeconds) patch.durationSeconds = d;
        } else if (video.durationSeconds != null) {
          patch.durationSeconds = null;
        }

        if (Object.keys(patch).length === 0) {
          onSuccess?.(video);
          return;
        }

        const r = await fetch(
          `/api/tiresias/agentic-os/creator/videos/${video.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );

        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error((data as any).error ?? 'Failed to update video');
        }

        const updated = await r.json();
        onSuccess?.(updated);
        router.refresh();
      }
    } catch (err: unknown) {
      const errErr = err instanceof Error ? err : new Error(String(err));
      setError(errErr.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="space-y-5"
    >
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label
          htmlFor="v-title"
          className="block text-sm font-medium text-text-secondary mb-1.5"
        >
          Title *
        </label>
        <input
          id="v-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My video"
          className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="v-desc"
          className="block text-sm font-medium text-text-secondary mb-1.5"
        >
          Description
        </label>
        <textarea
          id="v-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short summary of the video content"
          rows={3}
          className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none resize-vertical"
        />
      </div>

      {/* HLS URL */}
      <div>
        <label
          htmlFor="v-url"
          className="block text-sm font-medium text-text-secondary mb-1.5"
        >
          HLS Manifest URL *
        </label>
        <input
          id="v-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://cdn.example.com/videos/abc/index.m3u8"
          className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none font-mono"
          required
        />
        <p className="text-[11px] text-text-tertiary mt-1">
          Paste an HLS (.m3u8) manifest URL. No file upload is required.
        </p>
      </div>

      {/* Thumbnail URL */}
      <div>
        <label
          htmlFor="v-thumb"
          className="block text-sm font-medium text-text-secondary mb-1.5"
        >
          Thumbnail URL
        </label>
        <input
          id="v-thumb"
          type="url"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://cdn.example.com/thumbnails/abc.jpg"
          className="w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none font-mono"
        />
      </div>

      {/* Duration */}
      <div>
        <label
          htmlFor="v-dur"
          className="block text-sm font-medium text-text-secondary mb-1.5"
        >
          Duration (seconds)
        </label>
        <input
          id="v-dur"
          type="number"
          min={0}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(e.target.value)}
          placeholder="360"
          className="w-48 rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : isNew ? 'Create Video' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border-subtle text-text-secondary text-sm font-medium hover:text-white hover:border-border-strong transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </form>
  );
}
