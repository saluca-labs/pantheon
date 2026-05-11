'use client';

/**
 * Filmmaker OS — CharacterForm.
 *
 * Full character editor — used in both the create drawer and the detail
 * page. Three tab sections: Identity / Psychology / Voice. The portrait
 * URL is a plain URL input (no upload UI — MCP-mediated storage transfer
 * is the future workstream, see docs/architecture/mcp-storage-transfer.md).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import {
  CHARACTER_ROLES,
  type Character,
  type CharacterRole,
  type CharacterUpsert,
} from '@/lib/agentic-os/filmmaker/characters';

type TabKey = 'identity' | 'psychology' | 'voice';

interface Props {
  initial?: Character | null;
  submitLabel: string;
  onSubmit: (data: CharacterUpsert) => Promise<void> | void;
  onCancel?: () => void;
  busy?: boolean;
  error?: string | null;
}

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

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
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-[#94a3b8]/80 mt-1">{hint}</span>
      )}
    </label>
  );
}

export function CharacterForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
  error,
}: Props) {
  const [tab, setTab] = useState<TabKey>('identity');
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    role: (initial?.role ?? 'supporting') as CharacterRole,
    archetype: initial?.archetype ?? '',
    logline: initial?.logline ?? '',
    age: initial?.age ?? '',
    pronouns: initial?.pronouns ?? '',
    gender: initial?.gender ?? '',
    occupation: initial?.occupation ?? '',
    portraitUrl: initial?.portraitUrl ?? '',
    physicalDescription: initial?.physicalDescription ?? '',
    backstory: initial?.backstory ?? '',
    goals: initial?.goals ?? '',
    needs: initial?.needs ?? '',
    fears: initial?.fears ?? '',
    wounds: initial?.wounds ?? '',
    arc: initial?.arc ?? '',
    voiceNotes: initial?.voiceNotes ?? '',
    tags: (initial?.tags ?? []).join(', '),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data: CharacterUpsert = {
      name: form.name.trim(),
      role: form.role,
      archetype: form.archetype.trim() || null,
      logline: form.logline.trim() || null,
      age: form.age.trim() || null,
      pronouns: form.pronouns.trim() || null,
      gender: form.gender.trim() || null,
      occupation: form.occupation.trim() || null,
      portraitUrl: form.portraitUrl.trim() || null,
      physicalDescription: form.physicalDescription.trim() || null,
      backstory: form.backstory.trim() || null,
      goals: form.goals.trim() || null,
      needs: form.needs.trim() || null,
      fears: form.fears.trim() || null,
      wounds: form.wounds.trim() || null,
      arc: form.arc.trim() || null,
      voiceNotes: form.voiceNotes.trim() || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    await onSubmit(data);
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'identity', label: 'Identity' },
    { key: 'psychology', label: 'Psychology' },
    { key: 'voice', label: 'Voice' },
  ];

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-1 border-b border-[#2a2d3e]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition',
              tab === t.key
                ? 'border-[#4361EE] text-white'
                : 'border-transparent text-[#94a3b8] hover:text-white',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'identity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) => set('role', e.target.value as CharacterRole)}
                className={inputCls}
              >
                {CHARACTER_ROLES.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Archetype" hint="Hero, Mentor, Trickster, etc.">
              <input
                value={form.archetype}
                onChange={(e) => set('archetype', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Age" hint="Free text — 30s, ageless, 10–12.">
              <input
                value={form.age}
                onChange={(e) => set('age', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Logline" hint="One-sentence character pitch.">
            <input
              value={form.logline}
              onChange={(e) => set('logline', e.target.value)}
              className={inputCls}
              placeholder="A weary detective who…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pronouns">
              <input
                value={form.pronouns}
                onChange={(e) => set('pronouns', e.target.value)}
                className={inputCls}
                placeholder="she/her, they/them"
              />
            </Field>
            <Field label="Gender">
              <input
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Occupation">
            <input
              value={form.occupation}
              onChange={(e) => set('occupation', e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field
            label="Portrait URL"
            hint="External URL only — asset uploads are a future MCP-mediated workstream."
          >
            <input
              type="url"
              value={form.portraitUrl}
              onChange={(e) => set('portraitUrl', e.target.value)}
              className={inputCls}
              placeholder="https://…"
            />
          </Field>

          <Field label="Physical description">
            <textarea
              value={form.physicalDescription}
              onChange={(e) => set('physicalDescription', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>

          <Field label="Tags (comma-separated)">
            <input
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              className={inputCls}
              placeholder="lead, family-drama, season-1"
            />
          </Field>
        </div>
      )}

      {tab === 'psychology' && (
        <div className="space-y-4">
          <Field label="Backstory">
            <textarea
              value={form.backstory}
              onChange={(e) => set('backstory', e.target.value)}
              rows={4}
              className={inputCls + ' resize-none'}
            />
          </Field>
          <Field label="Goals" hint="The external want.">
            <textarea
              value={form.goals}
              onChange={(e) => set('goals', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>
          <Field label="Needs" hint="The internal need.">
            <textarea
              value={form.needs}
              onChange={(e) => set('needs', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>
          <Field label="Fears">
            <textarea
              value={form.fears}
              onChange={(e) => set('fears', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>
          <Field label="Wounds" hint="The original wound or trauma.">
            <textarea
              value={form.wounds}
              onChange={(e) => set('wounds', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>
          <Field label="Arc" hint="Transformation across the story.">
            <textarea
              value={form.arc}
              onChange={(e) => set('arc', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </Field>
        </div>
      )}

      {tab === 'voice' && (
        <div className="space-y-4">
          <Field label="Voice notes" hint="Speech patterns, vocabulary, cadence.">
            <textarea
              value={form.voiceNotes}
              onChange={(e) => set('voiceNotes', e.target.value)}
              rows={8}
              className={inputCls + ' resize-none'}
              placeholder="Clipped sentences. Avoids contractions when stressed. Says 'right then' as a verbal tic."
            />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {error && <span className="text-sm text-red-300 mr-auto">{error}</span>}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/60 text-white px-4 py-2 text-sm transition"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !form.name.trim()}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
