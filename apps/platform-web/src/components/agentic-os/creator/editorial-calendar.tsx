'use client';

/**
 * Creator OS — Editorial Calendar component.
 *
 * Lets creators plan posts with status, channel, content format, and an
 * optional publish date. Posts are grouped by ISO week for a calendar-style
 * view.
 *
 * @license MIT — original work for Tiresias platform
 * @see https://buffer.com/resources/content-types/ (Buffer — channel/format taxonomy)
 * @see https://developer.wordpress.org/rest-api/reference/posts/#schema-status
 *   WordPress REST API — post status taxonomy reference
 */

import { useState, useMemo } from 'react';
import {
  POST_STATUSES,
  CHANNELS,
  CONTENT_FORMATS,
  validatePost,
  groupByWeek,
} from '@/lib/agentic-os/creator/calendar';
import type { CalendarPost, PostStatus, Channel, ContentFormat } from '@/lib/agentic-os/creator/calendar';

interface Props {
  initial: CalendarPost[];
}

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">{label}</span>
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

const BLANK_FORM = {
  title: '',
  status: 'idea' as PostStatus,
  channel: 'blog' as Channel,
  contentFormat: 'article' as ContentFormat,
  publishAt: '',
  tags: '',
};

export function EditorialCalendar({ initial }: Props) {
  const [posts, setPosts] = useState<CalendarPost[]>(initial);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekGroups = useMemo(() => groupByWeek(posts), [posts]);
  const sortedWeeks = useMemo(() => {
    const keys = Array.from(weekGroups.keys()).sort();
    // Put 'unscheduled' at the end
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
      channel: form.channel,
      contentFormat: form.contentFormat,
      publishAt: form.publishAt || undefined,
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
        channel: form.channel,
        contentFormat: form.contentFormat,
        publishAt: form.publishAt || null,
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
    const r = await fetch(`/api/tiresias/agentic-os/creator/posts?id=${postId}`, {
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
        className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 space-y-4"
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <Field label="Channel">
            <select
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as Channel }))}
              className={inputCls}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{c.replace('_', '/')}</option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select
              value={form.contentFormat}
              onChange={(e) => setForm((f) => ({ ...f, contentFormat: e.target.value as ContentFormat }))}
              className={inputCls}
            >
              {CONTENT_FORMATS.map((f) => (
                <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Publish date (optional)">
            <input
              type="datetime-local"
              value={form.publishAt}
              onChange={(e) => setForm((f) => ({ ...f, publishAt: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="e.g. typescript, tips"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Adding…' : 'Add to calendar'}
          </button>
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      </form>

      {/* Calendar view grouped by week */}
      {posts.length === 0 ? (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] px-5 py-10 text-center">
          <p className="text-sm text-[#94a3b8]">No posts yet. Plan your first piece above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedWeeks.map((week) => {
            const weekPosts = weekGroups.get(week) ?? [];
            return (
              <div key={week} className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
                <div className="px-5 py-2 border-b border-[#2a2d3e] bg-[#0f1117]">
                  <span className="text-xs font-mono font-semibold text-[#94a3b8] uppercase">
                    {week === 'unscheduled' ? 'Unscheduled' : week}
                  </span>
                </div>
                <ul className="divide-y divide-[#2a2d3e]">
                  {weekPosts.map((post) => (
                    <li key={post.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{post.title}</p>
                        <p className="text-xs text-[#94a3b8]">
                          {post.channel.replace('_', '/')} · {post.contentFormat.replace(/_/g, ' ')}
                          {post.publishAt && ` · ${new Date(post.publishAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <select
                          value={post.status}
                          onChange={(e) => handleStatusChange(post.id, e.target.value as PostStatus)}
                          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border cursor-pointer bg-transparent ${STATUS_COLORS[post.status]}`}
                        >
                          {POST_STATUSES.map((s) => (
                            <option key={s} value={s} className="bg-[#1a1d27] text-white normal-case tracking-normal">
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
