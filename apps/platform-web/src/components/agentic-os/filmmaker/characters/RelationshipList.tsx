'use client';

/**
 * Filmmaker OS — RelationshipList.
 *
 * Display + actions for a list of character relationships. Used on the
 * character detail page (filtered to that character) and on the
 * project-level relationships page.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  RELATIONSHIP_KIND_LABEL,
  type Character,
  type CharacterRelationship,
  type CharacterRelationshipUpsert,
  type RelationshipKind,
} from '@/lib/agentic-os/filmmaker/characters';
import { RelationshipForm } from './RelationshipForm';

interface Props {
  projectId: string;
  characters: Character[];
  initialRelationships: CharacterRelationship[];
  /** When set, the list is anchored to one character (detail page). */
  anchorCharacterId?: string;
}

function characterName(characters: Character[], id: string): string {
  return characters.find((c) => c.id === id)?.name ?? '(unknown)';
}

function tensionColor(t: number | null): string {
  if (t == null) return 'bg-border-subtle';
  if (t <= 2) return 'bg-positive/60';
  if (t <= 5) return 'bg-warning/60';
  if (t <= 7) return 'bg-attention/70';
  return 'bg-danger/70';
}

export function RelationshipList({
  projectId,
  characters,
  initialRelationships,
  anchorCharacterId,
}: Props) {
  const router = useRouter();
  const [relationships, setRelationships] =
    useState<CharacterRelationship[]>(initialRelationships);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CharacterRelationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional kind filter on the project view.
  const [kindFilter, setKindFilter] = useState<RelationshipKind | 'all'>('all');
  const visible =
    kindFilter === 'all'
      ? relationships
      : relationships.filter((r) => r.kind === kindFilter);

  async function handleCreate(data: CharacterRelationshipUpsert) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/relationships`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Create failed (${r.status})`);
      }
      const { relationship } = (await r.json()) as {
        relationship: CharacterRelationship;
      };
      setRelationships((prev) => [...prev, relationship]);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id: string, data: CharacterRelationshipUpsert) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/relationships/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: data.kind,
            direction: data.direction,
            description: data.description,
            tension: data.tension,
          }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Save failed (${r.status})`);
      }
      const { relationship } = (await r.json()) as {
        relationship: CharacterRelationship;
      };
      setRelationships((prev) =>
        prev.map((x) => (x.id === id ? relationship : x)),
      );
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this relationship?')) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/filmmaker/relationships/${id}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      setRelationships((prev) => prev.filter((x) => x.id !== id));
      router.refresh();
    }
  }

  const canAdd = characters.length >= 2;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Relationships
          </h2>
          <span className="text-xs text-text-secondary">({relationships.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {!anchorCharacterId && relationships.length > 0 && (
            <select
              value={kindFilter}
              onChange={(e) =>
                setKindFilter(e.target.value as RelationshipKind | 'all')
              }
              className="text-xs rounded border border-border-subtle bg-surface-0 px-2 py-1 text-white"
            >
              <option value="all">All kinds</option>
              {Object.entries(RELATIONSHIP_KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!canAdd}
            title={canAdd ? '' : 'Add at least two characters first'}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white hover:border-accent/60 disabled:opacity-50 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add relationship
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {anchorCharacterId
            ? 'No relationships yet for this character.'
            : 'No relationships yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((rel) => (
            <li
              key={rel.id}
              className="rounded-lg border border-border-subtle bg-surface-2 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Link2 className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      <span className="font-medium">
                        {characterName(characters, rel.fromId)}
                      </span>{' '}
                      <span className="text-text-secondary">
                        {rel.direction === 'directional' ? '→' : '↔'}
                      </span>{' '}
                      <span className="font-medium">
                        {characterName(characters, rel.toId)}
                      </span>{' '}
                      <span className="text-[10px] uppercase tracking-wide text-text-primary bg-surface-0 border border-border-subtle rounded-full px-2 py-0.5 ml-1">
                        {RELATIONSHIP_KIND_LABEL[rel.kind]}
                      </span>
                    </p>
                    {rel.description && (
                      <p className="text-xs text-text-secondary mt-1 truncate">
                        {rel.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(rel)}
                    className="p-1.5 rounded text-text-secondary hover:text-white hover:bg-surface-0 transition"
                    aria-label="Edit relationship"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rel.id)}
                    className="p-1.5 rounded text-text-secondary hover:text-danger hover:bg-surface-0 transition"
                    aria-label="Delete relationship"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary w-14">
                  Tension {rel.tension == null ? '—' : rel.tension}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-0 border border-border-subtle overflow-hidden">
                  <div
                    className={`h-full ${tensionColor(rel.tension)}`}
                    style={{
                      width: `${rel.tension == null ? 0 : (rel.tension / 10) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <Modal title="Add relationship" onClose={() => setAdding(false)}>
          <RelationshipForm
            characters={characters}
            fixedFromId={anchorCharacterId}
            submitLabel="Create"
            busy={busy}
            error={error}
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit relationship" onClose={() => setEditing(null)}>
          <RelationshipForm
            characters={characters}
            initial={editing}
            submitLabel="Save"
            busy={busy}
            error={error}
            onSubmit={(data) => handleUpdate(editing.id, data)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-border-subtle bg-surface-0 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary hover:text-white transition"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
