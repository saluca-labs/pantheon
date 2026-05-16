'use client';

/**
 * Creator OS — Editorial Calendar component (updated for Phase 2 schema).
 *
 * Lets creators plan posts with status and an optional publish date.
 *
 * Wave D-4b (UI Depth Wave) — `CalendarView` adoption, additive pattern:
 *   The bespoke ISO-week list was a depth-winning surface, but the posts it
 *   groups all carry real date fields (`scheduledAt` / `publishedAt` /
 *   `publishAt`), so they fit the shared month/week grid cleanly. The
 *   editorial calendar now ADOPTS `CalendarView` for the calendar *display*
 *   while keeping every bespoke editing affordance layered on:
 *     - The "Plan a post" form is unchanged. `CalendarView.onCreate` now
 *       pre-fills its date when a day cell's `+` is clicked.
 *     - The inline status-picker `<select>` is preserved — it renders inside
 *       each post chip via `renderEvent`, so drag-free status edits still work
 *       right on the calendar.
 *     - A "Week list" toggle keeps the original ISO-week grouping available
 *       (depth not dropped — `groupByWeek` + `isoWeek` still used there).
 *   Net: no capability lost, primitive genuinely adopted for the grid.
 *
 * @license MIT — original work for Tiresias platform
 */

import { useState, useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  POST_STATUSES,
} from '@/lib/agentic-os/creator/posts';
import type { CreatorPost, PostStatus } from '@/lib/agentic-os/creator/posts';
import { validatePost, isoWeek } from '@/lib/agentic-os/creator/calendar';
import { EmptyState, CalendarView } from '@/components/agentic-os/_shared/views';
import type { CalendarViewMode } from '@/components/agentic-os/_shared/views';

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
  idea: 'bg-text-secondary/15 text-text-secondary border-text-secondary/30',
  draft: 'bg-accent/15 text-accent border-accent/30',
  scheduled: 'bg-warning/15 text-warning border-warning/30',
  published: 'bg-positive/15 text-positive border-positive/30',
  archived: 'bg-text-secondary/15 text-text-secondary border-text-secondary/30',
};

/** The date a post is anchored to on the calendar — schedule wins, then publish. */
function postDateStr(post: CreatorPost): string | null {
  return post.scheduledAt ?? post.publishedAt ?? post.publishAt ?? null;
}

function groupByWeek(posts: CreatorPost[]): Map<string, CreatorPost[]> {
  const map = new Map<string, CreatorPost[]>();
  for (const post of posts) {
    const dateStr = postDateStr(post);
    const weekKey = dateStr ? isoWeek(new Date(dateStr)) : 'unscheduled';
    const bucket = map.get(weekKey) ?? [];
    bucket.push(post);
    map.set(weekKey, bucket);
  }
  return map;
}

/** A datetime-local value (no timezone) for the plan-a-post form's date field. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
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

  // CalendarView is controlled — this component owns focus date + view mode.
  const [calDate, setCalDate] = useState<Date>(() => new Date());
  const [calMode, setCalMode] = useState<CalendarViewMode>('month');
  const [layout, setLayout] = useState<'calendar' | 'weeklist'>('calendar');

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
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${r.status})`);
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

  /** Day-cell `+` affordance: pre-fill the plan-a-post form's date and focus it. */
  function handleCreateOnDate(date: Date) {
    setForm((f) => ({ ...f, scheduledAt: toLocalInputValue(date) }));
    setError(null);
    // Scroll the form into view so the pre-filled date is obvious.
    if (typeof document !== 'undefined') {
      document
        .getElementById('plan-a-post')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Inline status-picker chip — preserved bespoke affordance, now on the grid. */
  function StatusPicker({ post }: { post: CreatorPost }) {
    return (
      <select
        value={post.status}
        onChange={(e) =>
          handleStatusChange(post.id, e.target.value as PostStatus)
        }
        onClick={(e) => e.stopPropagation()}
        aria-label={`Status for ${post.title}`}
        className={`w-full text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-pointer bg-transparent ${STATUS_COLORS[post.status]}`}
      >
        {POST_STATUSES.map((s) => (
          <option
            key={s}
            value={s}
            className="bg-surface-2 text-white normal-case tracking-normal"
          >
            {s}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add post form — unchanged behavior, now anchored for onCreate scroll. */}
      <form
        id="plan-a-post"
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
            className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Adding…' : 'Add to calendar'}
          </button>
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </form>

      {/* Layout toggle: shared CalendarView grid vs. the bespoke ISO-week list. */}
      {posts.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="No posts on the calendar yet"
          description="Plan your first piece with the form above to start mapping out your publishing cadence."
        />
      ) : (
        <>
          <div className="flex overflow-hidden rounded-md border border-border-subtle w-fit">
            {(['calendar', 'weeklist'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setLayout(opt)}
                className={`px-3 py-1 text-xs font-medium capitalize transition ${
                  layout === opt
                    ? 'bg-os-creator text-white'
                    : 'bg-surface-2 text-text-secondary hover:text-white'
                }`}
              >
                {opt === 'calendar' ? 'Calendar' : 'Week list'}
              </button>
            ))}
          </div>

          {layout === 'calendar' ? (
            <CalendarView<CreatorPost>
              events={posts}
              view={calMode}
              date={calDate}
              slug="creator"
              getEventDate={(post) => {
                const d = postDateStr(post);
                return d ? new Date(d) : null;
              }}
              getEventId={(post) => post.id}
              onDateChange={setCalDate}
              onViewChange={setCalMode}
              onCreate={handleCreateOnDate}
              renderEvent={(post) => (
                <div className="rounded bg-surface-0 border border-border-subtle px-1.5 py-1 space-y-1">
                  <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">
                    {post.title}
                  </p>
                  <StatusPicker post={post} />
                </div>
              )}
            />
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
                          <div className="shrink-0 flex items-center gap-2 w-32">
                            <StatusPicker post={post} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
