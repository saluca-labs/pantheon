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
 * Wave C-3a: the ad-hoc `<ul>` timeline + empty `<li>` are replaced by the
 * shared `ActivityFeed` primitive. Each entry's rich body (photo grids,
 * link/file lists, delete button) is preserved verbatim through the
 * `renderItem` render-prop escape hatch; `ActivityFeed` supplies the
 * day-grouping headers, ordering, and the `EmptyState`. The compose form is
 * unchanged.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link as LinkIcon, Trash2, Play, FileText, Hammer } from 'lucide-react';
import {
  parseUrlInput,
  type AttachedUrl,
  type BuildLogEntry,
} from '@/lib/agentic-os/maker/log';
import { ActivityFeed } from '@/components/agentic-os/_shared/views';
import type { ActivityEvent } from '@/components/agentic-os/_shared/views';

const API_BASE = '/api/tiresias/agentic-os/maker';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  projectId: string;
  initialEntries: BuildLogEntry[];
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
          <div className="text-xs text-text-secondary">
            Will attach {previewUrls.length} URL{previewUrls.length === 1 ? '' : 's'}:{' '}
            {previewUrls.map((u, i) => (
              <span key={i} className="mr-2">
                {u.kind}:{u.label ?? u.url}
              </span>
            ))}
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

      {/* Feed — ActivityFeed primitive, rich entry body via renderItem */}
      <ActivityFeed<BuildLogEvent>
        events={entries.map((entry) => ({
          id: entry.id,
          occurredAt: entry.createdAt,
          tone: 'accent',
          entry,
        }))}
        grouping="day"
        emptyState={{
          icon: <Hammer className="h-6 w-6" />,
          title: 'No log entries yet',
          description: 'Capture your first build note above — notes, photos, and links land here in a timestamped feed.',
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
  const photos = entry.attachedUrls.filter((u) => u.kind === 'photo');
  const others = entry.attachedUrls.filter((u) => u.kind !== 'photo');
  const dt = new Date(entry.createdAt);
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-text-secondary">{dt.toLocaleString()}</div>
        <button
          type="button"
          onClick={() => onDelete(entry)}
          aria-label="Delete entry"
          className="rounded p-1 text-text-secondary hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-white">{entry.body}</p>
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <a
              key={i}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-md border border-border-subtle"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.label ?? 'attached photo'}
                className="aspect-video w-full object-cover transition hover:opacity-80"
              />
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="mt-3 space-y-1">
          {others.map((u, i) => {
            const Icon =
              u.kind === 'video' ? Play : u.kind === 'file' ? FileText : LinkIcon;
            return (
              <li key={i}>
                <a
                  href={u.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {u.label ?? u.url}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
