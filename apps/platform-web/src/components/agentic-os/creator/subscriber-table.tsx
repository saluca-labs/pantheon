'use client';

/**
 * Creator OS Phase 2 — Subscriber management table.
 *
 * Renders the email subscriber list with add/status/delete actions.
 * Supports filtering by status and search.
 *
 * Wave C-4a (UI Depth Wave): the ad-hoc search input is now the shared
 * `EntitySearch` primitive, the zero-data / no-match states use
 * `EmptyState`, and a row-selection model drives `BulkActionsBar` for
 * bulk unsubscribe / reactivate / delete. Single-row actions and the
 * add-subscriber form are unchanged.
 *
 * Wave D-4b (UI Depth Wave) — subscriber-table depth, built ON the Wave C
 * selection model:
 *   - Selected rows now get an `os-creator` tint + a left accent rail so a
 *     multi-select reads at a glance.
 *   - The table header shows a live "N selected" count next to the
 *     select-all checkbox.
 *   - A fourth bulk action — **Export CSV** — downloads the selected
 *     subscribers client-side (no API change; the data is already loaded).
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

import { useId, useState } from 'react';
import {
  Mail,
  Plus,
  Trash2,
  UserX,
  UserCheck,
  AlertTriangle,
  Download,
} from 'lucide-react';
import {
  EntitySearch,
  EmptyState,
  BulkActionsBar,
} from '@/components/agentic-os/_shared/views';
import type {
  CreatorSubscriber,
  SubscriberStatus,
} from '@/lib/agentic-os/creator/subscribers';

interface SubscriberTableProps {
  subscribers: CreatorSubscriber[];
}

const STATUS_COLORS: Record<SubscriberStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  unsubscribed: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  bounced: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const STATUS_ICONS: Record<SubscriberStatus, React.ReactNode> = {
  active: <UserCheck className="w-3 h-3" />,
  unsubscribed: <UserX className="w-3 h-3" />,
  bounced: <AlertTriangle className="w-3 h-3" />,
};

const inputCls =
  'rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-text-secondary/40 focus:border-os-creator outline-none';

export function SubscriberTable({ subscribers }: SubscriberTableProps) {
  const [subs, setSubs] = useState<CreatorSubscriber[]>(subscribers);
  const [searchQuery, setSearchQuery] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<SubscriberStatus | 'all'>(
    'all',
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const emailInputId = useId();
  const nameInputId = useId();

  const activeCount = subs.filter((s) => s.status === 'active').length;

  const filtered = subs.filter((s) => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        s.email.toLowerCase().includes(q) ||
        (s.name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.includes(s.id));

  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((s) => s.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      setSelectedIds((prev) => [
        ...new Set([...prev, ...filtered.map((s) => s.id)]),
      ]);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/tiresias/agentic-os/creator/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          source: 'manual',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Failed (${res.status})`);
      }
      const data = await res.json();
      if (data.created) {
        setSubs((prev) => [data.subscriber, ...prev]);
      } else {
        // Existing subscriber reactivated
        setSubs((prev) =>
          prev.map((s) =>
            s.id === data.subscriber.id ? data.subscriber : s,
          ),
        );
      }
      setEmail('');
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function handleStatusChange(
    id: string,
    newStatus: SubscriberStatus,
  ) {
    const res = await fetch(
      `/api/tiresias/agentic-os/creator/subscribers/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      },
    );
    if (res.ok) {
      const updated = await res.json();
      setSubs((prev) => prev.map((s) => (s.id === id ? updated : s)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this subscriber?')) return;
    const res = await fetch(
      `/api/tiresias/agentic-os/creator/subscribers/${id}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      setSubs((prev) => prev.filter((s) => s.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    }
  }

  // ─── Bulk actions ─────────────────────────────────────────────────────
  async function bulkStatusChange(ids: string[], status: SubscriberStatus) {
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(
          `/api/tiresias/agentic-os/creator/subscribers/${id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          },
        );
        return res.ok ? ((await res.json()) as CreatorSubscriber) : null;
      }),
    );
    const updates = new Map(
      results.filter((r): r is CreatorSubscriber => r !== null).map((r) => [r.id, r]),
    );
    setSubs((prev) => prev.map((s) => updates.get(s.id) ?? s));
    setSelectedIds([]);
  }

  async function bulkDelete(ids: string[]) {
    if (!confirm(`Remove ${ids.length} subscriber${ids.length === 1 ? '' : 's'}?`))
      return;
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(
          `/api/tiresias/agentic-os/creator/subscribers/${id}`,
          { method: 'DELETE' },
        );
        return res.ok ? id : null;
      }),
    );
    const removed = new Set(results.filter((id): id is string => id !== null));
    setSubs((prev) => prev.filter((s) => !removed.has(s.id)));
    setSelectedIds([]);
  }

  /**
   * Client-side CSV export of the selected subscribers. No API change — the
   * full subscriber list is already in component state.
   */
  function bulkExportCsv(ids: string[]) {
    const idSet = new Set(ids);
    const rows = subs.filter((s) => idSet.has(s.id));
    if (rows.length === 0) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['email', 'name', 'status', 'source', 'created_at'];
    const lines = [
      header.join(','),
      ...rows.map((s) =>
        [
          esc(s.email),
          esc(s.name ?? ''),
          esc(s.status),
          esc(s.source ?? ''),
          esc(s.createdAt),
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Subscribers</h1>
          <p className="text-sm text-text-secondary">
            Manage your email subscriber list.
            {activeCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300">
                <UserCheck className="w-3 h-3" />
                {activeCount} active
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Add subscriber form */}
      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-border-subtle bg-surface-2 p-5 mb-6"
      >
        <h2 className="text-sm font-semibold text-white mb-3">
          Add a subscriber
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor={emailInputId} className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
              Email
            </label>
            <input
              id={emailInputId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="subscriber@example.com"
              className={`${inputCls} w-full`}
              required
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label htmlFor={nameInputId} className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
              Name (optional)
            </label>
            <input
              id={nameInputId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              className={`${inputCls} w-full`}
            />
          </div>
          <button
            type="submit"
            disabled={adding || !email.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-os-creator text-white text-sm font-medium hover:bg-os-creator/90 disabled:opacity-50 transition whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </form>

      {/* Search + status filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <EntitySearch
            placeholder="Search by email or name…"
            defaultValue={searchQuery}
            onQueryChange={setSearchQuery}
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as SubscriberStatus | 'all')
          }
          className={`${inputCls} text-sm`}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
        </select>
      </div>

      {/* Subscriber list */}
      {filtered.length === 0 ? (
        searchQuery || filterStatus !== 'all' ? (
          <EmptyState
            icon={<Mail className="h-6 w-6" />}
            title="No subscribers match"
            description="Loosen the search or status filter to see more."
          />
        ) : (
          <EmptyState
            icon={<Mail className="h-6 w-6" />}
            title="No subscribers yet"
            description="Add your first subscriber above to start building your newsletter audience."
          />
        )
      ) : (
        <>
          <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-3 px-5 py-2.5 border-b border-border-subtle bg-surface-0 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
              <div className="col-span-1 flex items-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  aria-label="Select all subscribers"
                  className="h-3.5 w-3.5 rounded border-border-strong bg-surface-2 accent-os-creator"
                />
              </div>
              <div className="col-span-3 flex items-center gap-2">
                Email
                {selectedIds.length > 0 && (
                  <span
                    data-testid="subscriber-selection-count"
                    className="inline-flex items-center rounded bg-os-creator/15 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-os-creator tabular-nums"
                  >
                    {selectedIds.length} selected
                  </span>
                )}
              </div>
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* Table body */}
            <div className="divide-y divide-border-subtle">
              {filtered.map((sub) => {
                const selected = selectedIds.includes(sub.id);
                return (
                <div
                  key={sub.id}
                  data-selected={selected || undefined}
                  className={`grid grid-cols-12 gap-3 px-5 py-3 items-center transition text-sm border-l-2 ${
                    selected
                      ? 'bg-os-creator/10 border-l-os-creator'
                      : 'border-l-transparent hover:bg-surface-3'
                  }`}
                >
                  <div className="col-span-1 flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(sub.id)}
                      onChange={() => toggleRow(sub.id)}
                      aria-label={`Select ${sub.email}`}
                      className="h-3.5 w-3.5 rounded border-border-strong bg-surface-2 accent-os-creator"
                    />
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="text-white truncate">{sub.email}</p>
                    {sub.source && (
                      <p className="text-[10px] text-text-secondary/60">
                        via {sub.source}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="text-text-secondary truncate">
                      {sub.name ?? <span className="text-text-secondary/40">--</span>}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${STATUS_COLORS[sub.status]}`}
                    >
                      {STATUS_ICONS[sub.status]}
                      {sub.status}
                    </span>
                  </div>
                  <div className="col-span-2 text-text-secondary/70 text-xs">
                    {new Date(sub.createdAt).toLocaleDateString()}
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    {sub.status === 'active' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleStatusChange(sub.id, 'unsubscribed')
                        }
                        className="p-1 rounded hover:bg-slate-500/10 text-text-secondary hover:text-white transition"
                        title="Mark unsubscribed"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {sub.status === 'unsubscribed' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleStatusChange(sub.id, 'active')
                        }
                        className="p-1 rounded hover:bg-emerald-500/10 text-text-secondary hover:text-emerald-300 transition"
                        title="Re-activate"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(sub.id)}
                      className="p-1 rounded hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <BulkActionsBar
            selectedIds={selectedIds}
            onClear={() => setSelectedIds([])}
            countLabel={(n) =>
              `${n} subscriber${n === 1 ? '' : 's'} selected`
            }
            actions={[
              {
                id: 'export',
                label: 'Export CSV',
                icon: <Download className="h-3.5 w-3.5" />,
                onClick: (ids) => bulkExportCsv(ids),
              },
              {
                id: 'reactivate',
                label: 'Reactivate',
                icon: <UserCheck className="h-3.5 w-3.5" />,
                onClick: (ids) => bulkStatusChange(ids, 'active'),
              },
              {
                id: 'unsubscribe',
                label: 'Unsubscribe',
                icon: <UserX className="h-3.5 w-3.5" />,
                onClick: (ids) => bulkStatusChange(ids, 'unsubscribed'),
              },
              {
                id: 'delete',
                label: 'Delete',
                icon: <Trash2 className="h-3.5 w-3.5" />,
                variant: 'danger',
                onClick: (ids) => bulkDelete(ids),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
