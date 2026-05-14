'use client';

/**
 * Autobiographer OS — MemoryPeoplePicker.
 *
 * In-line picker that lives on the memory detail page. Shows the current
 * list of linked people with their role chips and lets the author:
 *
 *   - link an existing person (with optional free-form role)
 *   - create a new person + link in a single flow ("Create new…")
 *   - edit the role on an existing link
 *   - unlink a person from this memory
 *
 * Uses the /memories/[id]/people routes. Cross-ownership safety is
 * enforced server-side; this component surfaces 404/409 errors via
 * toast-style banners.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, UserPlus, Users, Pencil, Trash2 } from 'lucide-react';
import { PersonForm } from './person-form';
import { ConsentBadge } from './consent-badge';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';
import { COMMON_MEMORY_PERSON_ROLES } from '@/lib/agentic-os/autobiographer/memory-people';

export interface PickerLinkedPerson {
  id: string;
  canonicalName: string;
  consentToPublish: ConsentState;
  role: string | null;
  notes: string | null;
}

export interface PickerAvailablePerson {
  id: string;
  canonicalName: string;
  aliases: string[];
  consentToPublish: ConsentState;
}

export interface MemoryPeoplePickerProps {
  memoryId: string;
  /** People currently linked to this memory. */
  linked: PickerLinkedPerson[];
  /** Full workshop people roster, used for the link picker. */
  available: PickerAvailablePerson[];
}

export function MemoryPeoplePicker({
  memoryId,
  linked,
  available,
}: MemoryPeoplePickerProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');

  // Reset transient state when navigation re-renders this with fresh props.
  useEffect(() => {
    setPendingPersonId(null);
    setPendingRole('');
    setError(null);
  }, [linked]);

  const linkedIds = useMemo(() => new Set(linked.map((p) => p.id)), [linked]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available
      .filter((p) => !linkedIds.has(p.id))
      .filter((p) => {
        if (!q) return true;
        const hay = [p.canonicalName, ...p.aliases].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 25);
  }, [available, linkedIds, search]);

  async function linkPerson() {
    if (!pendingPersonId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/memories/${memoryId}/people`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            personId: pendingPersonId,
            role: pendingRole.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      setPendingPersonId(null);
      setPendingRole('');
      setSearch('');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to link person');
    } finally {
      setBusy(false);
    }
  }

  async function unlinkPerson(personId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/memories/${memoryId}/people/${personId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to unlink person');
    } finally {
      setBusy(false);
    }
  }

  async function saveRole(personId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/memories/${memoryId}/people/${personId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role: editRole.trim() || null }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      setEditingPersonId(null);
      setEditRole('');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save role');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase tracking-wide text-text-secondary inline-flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          People in this memory
        </h2>
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white transition"
        >
          <UserPlus className="w-3.5 h-3.5" />
          New person
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {linked.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {linked.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded border border-border-subtle bg-surface-0 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {p.canonicalName}
                  </span>
                  <ConsentBadge state={p.consentToPublish} />
                </div>
                {editingPersonId === p.id ? (
                  <div className="flex items-center gap-1 mt-1.5">
                    <input
                      autoFocus
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      placeholder="role (e.g. protagonist)"
                      maxLength={100}
                      className="flex-1 text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1 text-white focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => saveRole(p.id)}
                      disabled={busy}
                      className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-[#3a52d8] disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPersonId(null);
                        setEditRole('');
                      }}
                      className="text-xs px-2 py-1 rounded border border-border-subtle text-text-secondary hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : p.role ? (
                  <span className="text-[10px] text-text-secondary">
                    Role: <span className="text-text-primary">{p.role}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-[#64748b] italic">
                    No role set
                  </span>
                )}
              </div>
              {editingPersonId !== p.id && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPersonId(p.id);
                      setEditRole(p.role ?? '');
                    }}
                    className="text-text-secondary hover:text-white"
                    title="Edit role"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => unlinkPerson(p.id)}
                    disabled={busy}
                    className="text-rose-400 hover:text-rose-200 disabled:opacity-50"
                    title="Unlink"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#64748b] italic mb-4">
          No people linked yet. Search below to add someone.
        </p>
      )}

      {/* Link picker */}
      <div className="space-y-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a person to link…"
          className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
        />
        {filtered.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded border border-border-subtle bg-surface-0">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPendingPersonId(p.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 transition ${
                    pendingPersonId === p.id
                      ? 'bg-accent/20 text-white'
                      : 'text-text-primary hover:bg-surface-2'
                  }`}
                >
                  <span className="truncate">{p.canonicalName}</span>
                  <ConsentBadge state={p.consentToPublish} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pendingPersonId && (
          <div className="flex items-center gap-2 rounded border border-accent/40 bg-accent/5 p-2">
            <input
              value={pendingRole}
              onChange={(e) => setPendingRole(e.target.value)}
              placeholder="role (optional)"
              maxLength={100}
              list="common-roles"
              className="flex-1 text-xs bg-surface-0 border border-border-subtle rounded px-2 py-1 text-white focus:outline-none focus:border-accent"
            />
            <datalist id="common-roles">
              {COMMON_MEMORY_PERSON_ROLES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={linkPerson}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-accent text-white hover:bg-[#3a52d8] disabled:opacity-50 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Link
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingPersonId(null);
                setPendingRole('');
              }}
              className="text-text-secondary hover:text-white"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <PersonForm open={showNewForm} onClose={() => setShowNewForm(false)} />
    </section>
  );
}
