'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreatorPodcast } from '@/lib/agentic-os/creator/podcast';

interface PodcastSettingsFormProps {
  podcast: CreatorPodcast | null;
}

export function PodcastSettingsForm({ podcast }: PodcastSettingsFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(podcast?.title ?? '');
  const [description, setDescription] = useState(podcast?.description ?? '');
  const [author, setAuthor] = useState(podcast?.author ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(podcast?.coverImageUrl ?? '');
  const [language, setLanguage] = useState(podcast?.language ?? 'en');
  const [category, setCategory] = useState(podcast?.category ?? '');
  const [explicit, setExplicit] = useState(podcast?.explicit ?? false);
  const [websiteUrl, setWebsiteUrl] = useState(podcast?.websiteUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description || undefined,
        author: author || undefined,
        coverImageUrl: coverImageUrl || undefined,
        language: language || 'en',
        category: category || undefined,
        explicit,
        websiteUrl: websiteUrl || undefined,
      };

      const res = await fetch('/api/tiresias/agentic-os/creator/podcast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save');
      }

      router.push('/dashboard/os/creator/podcast');
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">
          {podcast ? 'Podcast Settings' : 'Create Your Podcast'}
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
          <label htmlFor={fid('title')} className="block text-sm font-medium text-zinc-400 mb-1.5">
            Show Title <span className="text-red-400">*</span>
          </label>
          <input
            id={fid('title')}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Awesome Podcast"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
        </div>

        {/* Author */}
        <div>
          <label htmlFor={fid('author')} className="block text-sm font-medium text-zinc-400 mb-1.5">
            Author
          </label>
          <input
            id={fid('author')}
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor={fid('description')} className="block text-sm font-medium text-zinc-400 mb-1.5">
            Description
          </label>
          <textarea
            id={fid('description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is your podcast about?"
            rows={4}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 resize-y"
          />
        </div>

        {/* Cover Image URL */}
        <div>
          <label htmlFor={fid('cover-image')} className="block text-sm font-medium text-zinc-400 mb-1.5">
            Cover Image URL
          </label>
          <input
            id={fid('cover-image')}
            type="text"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="https://storage.example.com/cover.jpg"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
          <p className="mt-1 text-xs text-zinc-600">iTunes recommends 1400x1400 minimum. URL-only — no upload.</p>
        </div>

        {/* Row: Language + Category */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={fid('language')} className="block text-sm font-medium text-zinc-400 mb-1.5">
              Language
            </label>
            <input
              id={fid('language')}
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
          <div>
            <label htmlFor={fid('category')} className="block text-sm font-medium text-zinc-400 mb-1.5">
              Apple Podcasts Category
            </label>
            <input
              id={fid('category')}
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Technology"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
        </div>

        {/* Website URL */}
        <div>
          <label htmlFor={fid('website')} className="block text-sm font-medium text-zinc-400 mb-1.5">
            Website URL
          </label>
          <input
            id={fid('website')}
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://mywebsite.com/podcast"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
        </div>

        {/* Explicit checkbox */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="explicit"
            checked={explicit}
            onChange={(e) => setExplicit(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-fuchsia-500 focus:ring-fuchsia-500"
          />
          <label htmlFor="explicit" className="text-sm font-medium text-zinc-400">
            Explicit content
          </label>
        </div>
      </div>
    </div>
  );
}
