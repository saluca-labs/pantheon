'use client';

/**
 * Creator OS Phase 2 — Post editor client component.
 *
 * Full-featured editor for blog/newsletter posts. Supports:
 * - Title, slug, excerpt
 * - TipTap rich-text content body
 * - Status lifecycle (idea/draft/scheduled/published/archived)
 * - Schedule date picker
 * - Tag management
 * - Debounced auto-save (same pattern as NoteEditorClient)
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

import { useId, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Send,
  Trash2,
  Calendar,
  Archive,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import { TipTapEditor } from '@/components/agentic-os/_shared/tiptap-editor';
import type { CreatorPost, PostStatus } from '@/lib/agentic-os/creator/posts';
import { POST_STATUSES } from '@/lib/agentic-os/creator/posts';

interface PostEditorProps {
  post: CreatorPost;
}

const STATUS_OPTIONS: { value: PostStatus; label: string; color: string }[] = [
  { value: 'idea', label: 'Idea', color: 'text-text-secondary' },
  { value: 'draft', label: 'Draft', color: 'text-accent' },
  { value: 'scheduled', label: 'Scheduled', color: 'text-warning' },
  { value: 'published', label: 'Published', color: 'text-positive' },
  { value: 'archived', label: 'Archived', color: 'text-text-secondary' },
];

const inputCls =
  'w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-text-secondary/40 focus:border-os-creator outline-none';

const labelCls = 'block text-xs uppercase tracking-wide text-text-secondary mb-1.5';

export function PostEditor({ post: initialPost }: PostEditorProps) {
  const router = useRouter();
  const [post, setPost] = useState<CreatorPost>(initialPost);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>(
    'saved',
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postIdRef = useRef(initialPost.id);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  // Reset state when navigating to a different post
  useEffect(() => {
    setPost(initialPost);
    postIdRef.current = initialPost.id;
  }, [initialPost.id]);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      setSaveStatus('saving');
      try {
        const res = await fetch(
          `/api/tiresias/agentic-os/creator/posts/${post.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
        if (res.ok) {
          const updated = await res.json();
          setPost(updated);
          setSaveStatus('saved');
        } else {
          setSaveStatus('unsaved');
        }
      } catch {
        setSaveStatus('unsaved');
      } finally {
        setSaving(false);
      }
    },
    [post.id],
  );

  const debouncedSave = useCallback(
    (patch: Record<string, unknown>) => {
      setSaveStatus('unsaved');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        save(patch);
      }, 800);
    },
    [save],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function handlePublish() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/creator/posts/${post.id}/publish`,
        { method: 'POST' },
      );
      if (res.ok) {
        const data = await res.json();
        setPost(data.post);
        setSaveStatus('saved');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule(scheduledAt: string) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/creator/posts/${post.id}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledAt }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setPost(data.post);
        setSaveStatus('saved');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/creator/posts/${post.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'archived' }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setPost(data);
        setSaveStatus('saved');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this post permanently? This cannot be undone.')) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/creator/posts/${post.id}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        router.push('/dashboard/os/creator/posts');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          {/* Save status */}
          <span className="text-xs text-text-secondary/60 mr-2">
            {saveStatus === 'saving' && 'Saving…'}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'unsaved' && 'Unsaved'}
          </span>

          {/* Status dropdown */}
          <select
            value={post.status}
            onChange={(e) => {
              const newStatus = e.target.value as PostStatus;
              setPost((prev) => ({ ...prev, status: newStatus }));
              debouncedSave({ status: newStatus });
            }}
            className="text-xs font-semibold uppercase tracking-wide px-2 py-1.5 rounded-lg border border-border-subtle bg-surface-2 text-white cursor-pointer hover:border-os-creator/50 transition"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Schedule button */}
          {post.status === 'draft' || post.status === 'idea' ? (
            <div className="relative">
              <input
                type="datetime-local"
                onChange={(e) => handleSchedule(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                title="Schedule publish date"
              />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-2 text-xs text-warning hover:border-warning/50 transition"
              >
                <Calendar className="w-3.5 h-3.5" />
                Schedule
              </button>
            </div>
          ) : null}

          {/* Publish button */}
          {post.status === 'draft' || post.status === 'scheduled' ? (
            <button
              type="button"
              onClick={handlePublish}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-positive hover:bg-positive/90 text-white text-xs font-medium disabled:opacity-50 transition"
            >
              <Send className="w-3.5 h-3.5" />
              Publish
            </button>
          ) : null}

          {/* Archive button */}
          {post.status !== 'archived' && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-2 text-xs text-text-secondary hover:text-white hover:border-border-strong disabled:opacity-50 transition"
              title="Archive"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete button */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger/20 bg-danger/5 text-xs text-danger hover:bg-danger/15 disabled:opacity-50 transition"
            title="Delete permanently"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={post.title}
        onChange={(e) => {
          const newTitle = e.target.value;
          setPost((prev) => ({ ...prev, title: newTitle }));
          debouncedSave({ title: newTitle });
        }}
        placeholder="Post title"
        className="text-3xl font-bold text-white bg-transparent border-none outline-none placeholder:text-text-secondary/30 w-full mb-4"
      />

      {/* Slug */}
      <div className="mb-4">
        <label htmlFor={fid('slug')} className={labelCls}>Slug</label>
        <input
          id={fid('slug')}
          type="text"
          value={post.slug}
          onChange={(e) => {
            const newSlug = e.target.value;
            setPost((prev) => ({ ...prev, slug: newSlug }));
            debouncedSave({ slug: newSlug });
          }}
          placeholder="url-friendly-slug"
          className={inputCls}
        />
        <p className="text-[10px] text-text-secondary/50 mt-1">
          URL identifier for this post. Auto-generated from title; edit for a
          custom path.
        </p>
      </div>

      {/* Excerpt */}
      <div className="mb-4">
        <label htmlFor={fid('excerpt')} className={labelCls}>Excerpt</label>
        <textarea
          id={fid('excerpt')}
          value={post.excerpt ?? ''}
          onChange={(e) => {
            const excerpt = e.target.value || null;
            setPost((prev) => ({ ...prev, excerpt }));
            debouncedSave({ excerpt });
          }}
          placeholder="A short summary for previews and RSS (optional)"
          rows={2}
          className={inputCls}
        />
      </div>

      {/* Cover image URL */}
      <div className="mb-4">
        <label htmlFor={fid('cover-image')} className={labelCls}>Cover Image URL</label>
        <input
          id={fid('cover-image')}
          type="text"
          value={post.coverImageUrl ?? ''}
          onChange={(e) => {
            const url = e.target.value || null;
            setPost((prev) => ({ ...prev, coverImageUrl: url }));
            debouncedSave({ coverImageUrl: url });
          }}
          placeholder="https://example.com/cover.jpg"
          className={inputCls}
        />
      </div>

      {/* Tags */}
      <div className="mb-6">
        <label htmlFor={fid('tags')} className={labelCls}>Tags</label>
        <input
          id={fid('tags')}
          type="text"
          value={post.tags.join(', ')}
          onChange={(e) => {
            const tags = e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            setPost((prev) => ({ ...prev, tags }));
            debouncedSave({ tags });
          }}
          placeholder="Comma-separated tags (e.g., typescript, tutorial, devtools)"
          className={inputCls}
        />
      </div>

      {/* TipTap editor */}
      <TipTapEditor
        content={post.content}
        onChange={(json) => {
          setPost((prev) => ({ ...prev, content: json }));
          debouncedSave({ content: json });
        }}
        placeholder="Start writing your post…"
      />

      {/* Notes (internal) */}
      <details className="mt-8">
        <summary className="text-xs uppercase tracking-wide text-text-secondary/60 cursor-pointer hover:text-text-secondary transition">
          Notes / Show Notes (internal, not published)
        </summary>
        <textarea
          value={post.notesMd ?? ''}
          onChange={(e) => {
            const notes = e.target.value || null;
            setPost((prev) => ({ ...prev, notesMd: notes }));
            debouncedSave({ notesMd: notes });
          }}
          placeholder="Internal notes, outline, or show-notes scratch-pad…"
          rows={6}
          className={`${inputCls} mt-2`}
        />
      </details>
    </div>
  );
}
