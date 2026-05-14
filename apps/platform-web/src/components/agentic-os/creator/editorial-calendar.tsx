'use client';

/**
 * Creator OS — Editorial Calendar component (updated for Phase 2 schema).
 *
 * Lets creators plan posts with status and an optional publish date.
 * Posts are grouped by ISO week for a calendar-style view.
 *
 * Updated for Phase 2: channel and content_format dropped;
 * uses the new PostStatus and CreatorPost types from posts.ts.
 *
 * @license MIT — original work for Tiresias platform
 */

import { useState, useMemo } from 'react';
import {
  POST_STATUSES,
} from '@/lib/agentic-os/creator/posts';
import type { CreatorPost, PostStatus } from '@/lib/agentic-os/creator/posts';
import { validatePost, isoWeek } from '@/lib/agentic-os/creator/calendar';

interface Props {
  initial: CreatorPost[];
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const STATUS_COLORS: Record<PostStatus, string> = {
  idea: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  draft: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  scheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  published: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  archived: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
};

function groupByWeek(posts: CreatorPost[]): Map<string, CreatorPost[]> {
  const map = new Map<string, CreatorPost[]>();
  for (const post of posts) {
    const dateStr = post.scheduledAt ?? post.publishedAt ?? post.publishAt;
    const weekKey = dateStr ? isoWeek(new Date(dateStr)) : 'unscheduled';
    const bucket = map.get(weekKey) ?? [];
    bucket.push(post);
    map.set(weekKey, bucket);
  }
  return map;
}

const BLANK_FORM = {
  title: '',
  status: 'idea' as PostStatus,
  scheduledAt: '',
  tags: '',
};

export function EditorialCalendar({ initial }: Props) {
  const [posts, setPosts] = useState<CreatorPost[]>(initial);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekGroups = useMemo(() => groupByWeek(posts), [posts]);
  const sortedWeeks = useMemo(() => {
    const keys = Array.from(weekGroups.keys()).sort();
    const idx = keys.indexOf('unscheduled');
    if (idx > -1) {
      keys.splice(idx, 1);
      keys.push('unscheduled');
    }
    return keys;
  }, [weekGroups]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const errors = validatePost({
      title: form.title,
      status: form.status,
      channel: 'blog',
      contentFormat: 'article',
      publishAt: form.scheduledAt || undefined,
    });
    if (errors.length > 0) {
      setError(errors[0] ?? 'Validation error');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        status: form.status,
        scheduledAt: form.scheduledAt || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const r = await fetch('/api/tiresias/agentic-os/creator/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Failed (${r.status})`);
      }
      const data = await r.json();
      setPosts((prev) => [data.post, ...prev]);
      setForm({ ...BLANK_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(postId: string, newStatus: PostStatus) {
    const r = await fetch(`/api/tiresias/agentic-os/creator/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (r.ok) {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p)),
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Add post form */}
      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-white">Plan a post</h2>

        <Field label="Title">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. 10 Things I Learned About TypeScript"
            className={inputCls}
            required
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PostStatus }))}
              className={inputCls}
            >
              {POST_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Schedule / Publish date (optional)">
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="e.g. typescript, tips"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Adding…' : 'Add to calendar'}
          </button>
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      </form>

      {/* Calendar view grouped by week */}
      {posts.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-2 px-5 py-10 text-center">
          <p className="text-sm text-text-secondary">No posts yet. Plan your first piece above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedWeeks.map((week) => {
            const weekPosts = weekGroups.get(week) ?? [];
            return (
              <div key={week} className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
                <div className="px-5 py-2 border-b border-border-subtle bg-surface-0">
                  <span className="text-xs font-mono font-semibold text-text-secondary uppercase">
                    {week === 'unscheduled' ? 'Unscheduled' : week}
                  </span>
                </div>
                <ul className="divide-y divide-border-subtle">
                  {weekPosts.map((post) => (
                    <li key={post.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{post.title}</p>
                        <p className="text-xs text-text-secondary">
                          {post.tags.length > 0 && `Tags: ${post.tags.slice(0, 3).join(', ')}`}
                          {post.scheduledAt && ` · ${new Date(post.scheduledAt).toLocaleDateString()}`}
                          {post.publishedAt && ` · Published ${new Date(post.publishedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <select
                          value={post.status}
                          onChange={(e) => handleStatusChange(post.id, e.target.value as PostStatus)}
                          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border cursor-pointer bg-transparent ${STATUS_COLORS[post.status]}`}
                        >
                          {POST_STATUSES.map((s) => (
                            <option key={s} value={s} className="bg-surface-2 text-white normal-case tracking-normal">
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
