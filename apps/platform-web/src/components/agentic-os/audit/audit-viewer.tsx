'use client';

/**
 * Agentic OS — AuditViewer client component.
 *
 * Renders a filterable, cursor-paginated table of the current user's audit
 * log entries. Filters: OS slug, action substring (matched as exact action
 * via the BFF), and a from/to ISO date range. Pagination is "Load more"
 * with the opaque cursor returned by the server.
 *
 * All data is fetched from /api/tiresias/agentic-os/audit.
 *
 * @license MIT — Tiresias platform (internal).
 */

import { useCallback, useEffect, useState } from 'react';
import { AGENTIC_OS_MODULES } from '@/lib/agentic-os/registry';

interface AuditEntry {
  id: string;
  actorId: string | null;
  osSlug: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ApiResponse {
  entries: AuditEntry[];
  nextCursor: string | null;
}

const inputCls =
  'rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function AuditViewer() {
  const [slug, setSlug] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [fromTs, setFromTs] = useState<string>('');
  const [toTs, setToTs] = useState<string>('');

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);

  const fetchPage = useCallback(
    async (resetPage: boolean) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (slug) params.set('slug', slug);
      if (action) params.set('action', action);
      if (fromTs) params.set('from', new Date(fromTs).toISOString());
      if (toTs) params.set('to', new Date(toTs).toISOString());
      params.set('limit', '50');
      if (!resetPage && cursor) params.set('cursor', cursor);

      try {
        const r = await fetch(`/api/tiresias/agentic-os/audit?${params.toString()}`);
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as ApiResponse;
        setEntries((prev) => (resetPage ? data.entries : [...prev, ...data.entries]));
        setCursor(data.nextCursor);
        setHasLoaded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load audit log');
      } finally {
        setLoading(false);
      }
    },
    [slug, action, fromTs, toTs, cursor],
  );

  // Initial load
  useEffect(() => {
    void fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setCursor(null);
    void fetchPage(true);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-lg border border-border-subtle bg-surface-2 p-4 md:grid-cols-5"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-text-secondary">OS</span>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={`${inputCls} w-full`}
          >
            <option value="">All</option>
            {AGENTIC_OS_MODULES.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-text-secondary">
            Action
          </span>
          <input
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. maker.build.created"
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-text-secondary">From</span>
          <input
            type="datetime-local"
            value={fromTs}
            onChange={(e) => setFromTs(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-text-secondary">To</span>
          <input
            type="datetime-local"
            value={toTs}
            onChange={(e) => setToTs(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[#3a52d4] disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Apply filters'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-2">
        <table className="w-full text-sm">
          <thead className="bg-surface-0 text-left text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">OS</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Payload</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && hasLoaded && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">
                  No audit entries match these filters.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border-subtle align-top">
                <td className="whitespace-nowrap px-4 py-3 text-text-primary">
                  {formatTimestamp(e.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded border border-border-subtle bg-surface-0 px-2 py-0.5 text-xs text-text-primary">
                    {e.osSlug}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white">
                  {e.action}
                </td>
                <td className="px-4 py-3">
                  <pre className="overflow-x-auto rounded bg-surface-0 p-2 text-xs text-text-secondary">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        {cursor && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchPage(false)}
            className="rounded-md border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-white hover:bg-border-subtle disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
