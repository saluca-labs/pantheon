'use client';

/**
 * Creator OS Phase 2 — Subscriber management table.
 *
 * Renders the email subscriber list with add/status/delete actions.
 * Supports filtering by status and search.
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

import { useState } from 'react';
import {
  Mail,
  Plus,
  Trash2,
  UserX,
  Search,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import type {
  CreatorSubscriber,
  SubscriberStatus,
} from '@/lib/agentic-os/creator/subscribers';
import { SUBSCRIBER_STATUSES } from '@/lib/agentic-os/creator/subscribers';

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
  'rounded-lg border border-[#2a2d3e] bg-[#1a1d27] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/40 focus:border-[#d946ef] outline-none';

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
    }
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Subscribers</h1>
          <p className="text-sm text-[#94a3b8]">
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
        className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5 mb-6"
      >
        <h2 className="text-sm font-semibold text-white mb-3">
          Add a subscriber
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="subscriber@example.com"
              className={`${inputCls} w-full`}
              required
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
              Name (optional)
            </label>
            <input
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d946ef] text-white text-sm font-medium hover:bg-[#c026d3] disabled:opacity-50 transition whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </form>

      {/* Search + status filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by email or name…"
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-sm text-white placeholder:text-[#94a3b8]/40 focus:border-[#d946ef] outline-none"
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
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] px-5 py-10 text-center">
          <Mail className="w-8 h-8 text-[#94a3b8]/40 mx-auto mb-3" />
          <p className="text-sm text-[#94a3b8]">
            {searchQuery || filterStatus !== 'all'
              ? 'No subscribers match your filters.'
              : 'No subscribers yet. Add your first subscriber above.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-3 px-5 py-2.5 border-b border-[#2a2d3e] bg-[#0f1117] text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
            <div className="col-span-4">Email</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {/* Table body */}
          <div className="divide-y divide-[#2a2d3e]">
            {filtered.map((sub) => (
              <div
                key={sub.id}
                className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-[#222633] transition text-sm"
              >
                <div className="col-span-4 min-w-0">
                  <p className="text-white truncate">{sub.email}</p>
                  {sub.source && (
                    <p className="text-[10px] text-[#94a3b8]/60">
                      via {sub.source}
                    </p>
                  )}
                </div>
                <div className="col-span-3 min-w-0">
                  <p className="text-[#94a3b8] truncate">
                    {sub.name ?? <span className="text-[#94a3b8]/40">--</span>}
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
                <div className="col-span-2 text-[#94a3b8]/70 text-xs">
                  {new Date(sub.createdAt).toLocaleDateString()}
                </div>
                <div className="col-span-1 flex items-center justify-end gap-1">
                  {sub.status === 'active' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusChange(sub.id, 'unsubscribed')
                      }
                      className="p-1 rounded hover:bg-slate-500/10 text-[#94a3b8] hover:text-white transition"
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
                      className="p-1 rounded hover:bg-emerald-500/10 text-[#94a3b8] hover:text-emerald-300 transition"
                      title="Re-activate"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(sub.id)}
                    className="p-1 rounded hover:bg-red-500/10 text-[#94a3b8] hover:text-red-400 transition"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
