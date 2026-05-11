'use client';

/**
 * Filmmaker OS — CharacterDetailWorkspace.
 *
 * Client wrapper around the character detail page: header (portrait,
 * name, role/archetype chips, logline), CharacterForm in edit mode, and
 * the relationships panel.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import {
  CHARACTER_ROLE_LABEL,
  type Character,
  type CharacterRelationship,
  type CharacterUpsert,
  type CharacterRole,
} from '@/lib/agentic-os/filmmaker/characters';
import { CharacterForm } from './CharacterForm';
import { RelationshipList } from './RelationshipList';

interface Props {
  projectId: string;
  character: Character;
  allCharacters: Character[];
  relationships: CharacterRelationship[];
}

const ROLE_COLOR: Record<CharacterRole, string> = {
  protagonist: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  antagonist: 'text-red-300 bg-red-500/10 border-red-500/30',
  deuteragonist: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  supporting: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  minor: 'text-[#94a3b8] bg-[#1a1d27] border-[#2a2d3e]',
  ensemble: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function CharacterDetailWorkspace({
  projectId,
  character,
  allCharacters,
  relationships,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [current, setCurrent] = useState<Character>(character);

  async function handleSave(data: CharacterUpsert) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/characters/${character.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Save failed (${r.status})`);
      }
      const { character: updated } = (await r.json()) as { character: Character };
      setCurrent(updated);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/characters/${character.id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
      router.push(`/dashboard/os/filmmaker/projects/${projectId}/characters`);
      router.refresh();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <div className="sm:w-48 sm:h-48 h-32 bg-gradient-to-br from-[#4361EE]/20 to-[#1a1d27] sm:border-r border-b sm:border-b-0 border-[#2a2d3e] flex items-center justify-center shrink-0">
            {current.portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.portraitUrl}
                alt={current.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-5xl font-semibold text-white/80">
                {initials(current.name)}
              </span>
            )}
          </div>
          <div className="flex-1 p-6 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-2xl font-semibold text-white">
                  {current.name}
                </h1>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${ROLE_COLOR[current.role]}`}
                >
                  {CHARACTER_ROLE_LABEL[current.role]}
                </span>
                {current.archetype && (
                  <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1]">
                    {current.archetype}
                  </span>
                )}
              </div>
              {current.logline && (
                <p className="text-sm text-white/90 italic">{current.logline}</p>
              )}
              {(current.age || current.occupation || current.pronouns) && (
                <p className="text-xs text-[#94a3b8] mt-2">
                  {[current.age, current.occupation, current.pronouns]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] hover:border-[#4361EE]/60 text-white transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                {editing ? 'Cancel edit' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:border-red-500/60 text-red-300 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
          <CharacterForm
            initial={current}
            submitLabel="Save changes"
            busy={busy}
            error={error}
            onSubmit={handleSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ReadOnlySection title="Identity">
            <FieldRow label="Pronouns" value={current.pronouns} />
            <FieldRow label="Gender" value={current.gender} />
            <FieldRow label="Occupation" value={current.occupation} />
            <FieldRow label="Physical" value={current.physicalDescription} block />
          </ReadOnlySection>
          <ReadOnlySection title="Psychology">
            <FieldRow label="Backstory" value={current.backstory} block />
            <FieldRow label="Goals" value={current.goals} block />
            <FieldRow label="Needs" value={current.needs} block />
            <FieldRow label="Fears" value={current.fears} block />
            <FieldRow label="Wounds" value={current.wounds} block />
            <FieldRow label="Arc" value={current.arc} block />
          </ReadOnlySection>
          <ReadOnlySection title="Voice">
            <FieldRow label="Voice notes" value={current.voiceNotes} block />
          </ReadOnlySection>
        </div>
      )}

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <RelationshipList
          projectId={projectId}
          characters={allCharacters}
          initialRelationships={relationships}
          anchorCharacterId={current.id}
        />
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Delete character?</h3>
            <p className="text-sm text-[#94a3b8]">
              This deletes{' '}
              <span className="text-white font-medium">{current.name}</span> and
              every linked relationship. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/60 text-white px-4 py-2 text-sm transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-500/80 hover:bg-red-500 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3">
      <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  block,
}: {
  label: string;
  value: string | null;
  block?: boolean;
}) {
  if (!value) return null;
  if (block) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wide text-[#94a3b8] mb-1">
          {label}
        </p>
        <p className="text-sm text-white whitespace-pre-wrap">{value}</p>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[#94a3b8]">{label}</span>
      <span className="text-white text-right">{value}</span>
    </div>
  );
}
