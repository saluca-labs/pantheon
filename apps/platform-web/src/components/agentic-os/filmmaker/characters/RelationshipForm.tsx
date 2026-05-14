'use client';

/**
 * Filmmaker OS — RelationshipForm.
 *
 * Editor for a single character relationship. The `fromId` is fixed when
 * called from a character detail page (anchored character); the project
 * relationships page lets the user pick both ends.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_DIRECTIONS,
  type Character,
  type CharacterRelationship,
  type CharacterRelationshipUpsert,
  type RelationshipKind,
  type RelationshipDirection,
} from '@/lib/agentic-os/filmmaker/characters';

interface Props {
  /** Characters in the same project the user can link to. */
  characters: Character[];
  /** Fixed "from" character (e.g. the character detail page). */
  fixedFromId?: string;
  initial?: CharacterRelationship | null;
  submitLabel: string;
  onSubmit: (data: CharacterRelationshipUpsert) => Promise<void> | void;
  onCancel?: () => void;
  busy?: boolean;
  error?: string | null;
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-text-secondary/80 mt-1">{hint}</span>
      )}
    </label>
  );
}

export function RelationshipForm({
  characters,
  fixedFromId,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
  error,
}: Props) {
  const defaultFromId = fixedFromId ?? initial?.fromId ?? characters[0]?.id ?? '';
  const otherDefault =
    initial?.toId ??
    characters.find((c) => c.id !== defaultFromId)?.id ??
    '';

  const [fromId, setFromId] = useState(defaultFromId);
  const [toId, setToId] = useState(otherDefault);
  const [kind, setKind] = useState<RelationshipKind>(initial?.kind ?? 'ally');
  const [direction, setDirection] = useState<RelationshipDirection>(
    initial?.direction ?? 'mutual',
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tension, setTension] = useState<number | ''>(
    initial?.tension == null ? '' : initial.tension,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromId || !toId || fromId === toId) return;
    await onSubmit({
      fromId,
      toId,
      kind,
      direction,
      description: description.trim() || null,
      tension: tension === '' ? null : Number(tension),
    });
  }

  const isCreate = !initial;
  const fromOptions = characters;
  const toOptions = characters.filter((c) => c.id !== fromId);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            disabled={!!fixedFromId || !isCreate}
            className={inputCls + ' disabled:opacity-60'}
          >
            {fromOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To">
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            disabled={!isCreate}
            className={inputCls + ' disabled:opacity-60'}
          >
            {toOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as RelationshipKind)}
            className={inputCls}
          >
            {RELATIONSHIP_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Direction"
          hint="Mutual = symmetric. Directional = from → to only."
        >
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as RelationshipDirection)}
            className={inputCls}
          >
            {RELATIONSHIP_DIRECTIONS.map((d) => (
              <option key={d.direction} value={d.direction}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description" hint="In their words — what this relationship is.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputCls + ' resize-none'}
        />
      </Field>

      <Field label="Tension" hint="0 = harmonious, 10 = fierce conflict.">
        <input
          type="number"
          min={0}
          max={10}
          step={1}
          value={tension}
          onChange={(e) => setTension(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
          placeholder="—"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2">
        {error && <span className="text-sm text-red-300 mr-auto">{error}</span>}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border-subtle bg-surface-0 hover:border-accent/60 text-white px-4 py-2 text-sm transition"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !fromId || !toId || fromId === toId}
          className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
