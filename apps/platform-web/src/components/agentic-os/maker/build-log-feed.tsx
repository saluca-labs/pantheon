'use client';

/**
 * Maker OS — BuildLogFeed.
 *
 * Timestamped feed of build-log entries for one project. Each entry renders
 * its body, author timestamp, and any attached_urls as inline thumbnails
 * (photo kind), play-link anchors (video kind), or plain anchors (link /
 * file kinds). A compose form at the top accepts a body + comma- or
 * newline-separated URL entries that parse to `{url, kind, label}` via the
 * pure helper in `log.ts`.
 *
 * Wave C-3a: the ad-hoc `<ul>` timeline + empty `<li>` were replaced by the
 * shared `ActivityFeed` primitive — day-grouping, ordering, EmptyState.
 *
 * Wave D.4 — feed redesign (builds ON the Wave C ActivityFeed adoption, does
 * not replace it):
 *  - The flat date string per entry is gone; `ActivityFeed`'s day headers
 *    already group by day, so each entry now leads with a compact relative
 *    timestamp ("3h ago") + a kind-derived accent dot via `summarizeEntry`.
 *  - Photo attachments render in a tighter responsive grid with a count
 *    badge when an entry carries more than the inline preview cap.
 *  - Link / file / video attachments collapse into a single chip row with
 *    per-kind icons instead of a stacked list — far more scannable in a
 *    dense feed.
 *  - The compose form gains a live attachment-kind summary chip row.
 *  - A header strip surfaces the entry count + photo count at a glance.
 *
 * @license MIT — Tiresias Maker OS Phase 3 + Wave D.4 (internal).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link as LinkIcon,
  Trash2,
  Play,
  FileText,
  Hammer,
  ImageIcon,
} from 'lucide-react';
import {
  parseUrlInput,
  type AttachedUrl,
  type BuildLogEntry,
} from '@/lib/agentic-os/maker/log';
import { ActivityFeed } from '@/components/agentic-os/_shared/views';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';

const API_BASE = '/api/tiresias/agentic-os/maker';

/** How many photo thumbnails to render inline before collapsing to a "+N" tile. */
const PHOTO_PREVIEW_CAP = 6;

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  projectId: string;
  initialEntries: BuildLogEntry[];
}

/** Compact relative-time label: "just now" / "3h ago" / "2d ago". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  if (!Number.isFinite(diffMs)) return '';
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Derive a feed-row summary for one entry: photo / attachment counts so the
 * row can show at-a-glance badges without re-walking `attachedUrls` in JSX.
 */
function summarizeEntry(entry: BuildLogEntry): {
  photos: AttachedUrl[];
  others: AttachedUrl[];
} {
  const photos = entry.attachedUrls.filter((u) => u.kind === 'photo');
  const others = entry.attachedUrls.filter((u) => u.kind !== 'photo');
  return { photos, others };
}

export function BuildLogFeed({ projectId, initialEntries }: Props) {
  const [entries, setEntries] = useState<BuildLogEntry[]>(initialEntries);
  const [body, setBody] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch(`${API_BASE}/projects/${projectId}/log`);
    if (r.ok) {
      const { entries: latest } = await r.json();
      setEntries(latest ?? []);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const previewUrls = parseUrlInput(urlInput);

  // Header strip stats — entry count + total photos across the feed.
  const feedStats = useMemo(() => {
    let photos = 0;
    for (const e of entries) {
      for (const u of e.attachedUrls) if (u.kind === 'photo') photos += 1;
    }
    return { entries: entries.length, photos };
  }, [entries]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) {
      setError('Body is required.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          attachedUrls: previewUrls,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Post failed (${r.status})`);
      }
      setBody('');
      setUrlInput('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Post failed');
    } finally {
      setAdding(false);
    }
  }

  async function remove(entry: BuildLogEntry) {
    const prev = entries;
    setEntries((es) => es.filter((e) => e.id !== entry.id));
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/log/${entry.id}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
    } catch (err) {
      setEntries(prev);
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      {/* Compose form */}
      <form
        onSubmit={submit}
        className="space-y-2 rounded-lg border border-border-subtle bg-surface-2 p-4"
      >
        <h3 className="text-sm font-semibold text-white">New log entry</h3>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="What did you do? Notes, learnings, blockers…"
          className={`${inputCls} resize-y`}
        />
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          rows={2}
          placeholder={
            'Optional URLs (comma or newline separated). Format: https://… or https://…|photo or https://…|link|My label'
          }
          className={`${inputCls} resize-y font-mono text-xs`}
        />
        {previewUrls.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
            <span>
              Will attach {previewUrls.length} URL
              {previewUrls.length === 1 ? '' : 's'}:
            </span>
            {previewUrls.map((u, i) => {
              const Icon =
                u.kind === 'photo'
                  ? ImageIcon
                  : u.kind === 'video'
                    ? Play
                    : u.kind === 'file'
                      ? FileText
                      : LinkIcon;
              return (
                <span
                  key={i}
                  data-testid="build-log-compose-chip"
                  className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-0 px-2 py-0.5"
                >
                  <Icon className="h-3 w-3" />
                  {u.label ?? u.kind}
                </span>
              );
            })}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={adding || !body.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[#3651D9] disabled:opacity-50 disabled:hover:bg-accent"
          >
            {adding ? 'Posting…' : 'Post entry'}
          </button>
        </div>
      </form>

      {/* Header strip — at-a-glance feed stats */}
      {feedStats.entries > 0 && (
        <div
          data-testid="build-log-stats"
          className="flex flex-wrap items-center gap-3 px-1 text-xs text-text-secondary"
        >
          <span className="inline-flex items-center gap-1.5">
            <Hammer className="h-3.5 w-3.5" />
            <span className="tabular-nums text-text-primary">
              {feedStats.entries}
            </span>{' '}
            {feedStats.entries === 1 ? 'entry' : 'entries'}
          </span>
          {feedStats.photos > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="tabular-nums text-text-primary">
                {feedStats.photos}
              </span>{' '}
              {feedStats.photos === 1 ? 'photo' : 'photos'}
            </span>
          )}
        </div>
      )}

      {/* Feed — ActivityFeed primitive, redesigned rich entry body via renderItem */}
      <ActivityFeed<BuildLogEvent>
        events={entries.map((entry) => ({
          id: entry.id,
          occurredAt: entry.createdAt,
          // Entries with photos read warmer; plain notes stay accent.
          tone: entry.attachedUrls.some((u) => u.kind === 'photo')
            ? 'positive'
            : 'accent',
          entry,
        }))}
        grouping="day"
        emptyState={{
          icon: <Hammer className="h-6 w-6" />,
          title: 'No log entries yet',
          description:
            'Capture your first build note above — notes, photos, and links land here in a timestamped feed.',
        }}
        renderItem={(event) => (
          <LogEntryBody entry={event.entry} onDelete={remove} />
        )}
      />
    </div>
  );
}

/** ActivityFeed event carrying the full build-log entry for `renderItem`. */
interface BuildLogEvent extends ActivityEvent {
  entry: BuildLogEntry;
}

function LogEntryBody({
  entry,
  onDelete,
}: {
  entry: BuildLogEntry;
  onDelete: (entry: BuildLogEntry) => void;
}) {
  const { photos, others } = summarizeEntry(entry);
  const shownPhotos = photos.slice(0, PHOTO_PREVIEW_CAP);
  const overflowPhotos = photos.length - shownPhotos.length;

  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div
          className="text-xs text-text-secondary tabular-nums"
          title={new Date(entry.createdAt).toLocaleString()}
        >
          {relativeTime(entry.createdAt)}
        </div>
        <button
          type="button"
          onClick={() => onDelete(entry)}
          aria-label="Delete entry"
          className="rounded p-1 text-text-secondary hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white">
        {entry.body}
      </p>

      {/* Photos — tighter responsive grid with a "+N" overflow tile */}
      {photos.length > 0 && (
        <div
          data-testid="build-log-photo-grid"
          className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4"
        >
          {shownPhotos.map((p, i) => {
            const isLastShown =
              i === shownPhotos.length - 1 && overflowPhotos > 0;
            return (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="relative block overflow-hidden rounded-md border border-border-subtle"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.label ?? 'attached photo'}
                  className="aspect-square w-full object-cover transition hover:opacity-80"
                />
                {isLastShown && (
                  <span
                    data-testid="build-log-photo-overflow"
                    className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white"
                  >
                    +{overflowPhotos}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}

      {/* Link / file / video attachments — single scannable chip row */}
      {others.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {others.map((u, i) => {
            const Icon =
              u.kind === 'video' ? Play : u.kind === 'file' ? FileText : LinkIcon;
            return (
              <a
                key={i}
                href={u.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border border-border-subtle bg-surface-0 px-2.5 py-1 text-xs text-accent transition hover:border-accent/60"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{u.label ?? u.url}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
