'use client';

/**
 * Filmmaker OS — Shot List Builder component.
 *
 * Client component that lets users add shots (scene + shot CRUD) to a film
 * project. Shot types follow the ASC (American Society of Cinematographers)
 * taxonomy: EWS → ECU.
 *
 * @license MIT — original work for Tiresias platform
 * @see https://www.ascmag.com/articles/shot-types-and-camera-angles
 *   ASC shot-type taxonomy reference
 * @see https://www.studiobinder.com/blog/ultimate-guide-to-shot-list/
 *   StudioBinder shot-list industry workflow reference
 */

import { useState } from 'react';
import { Film } from 'lucide-react';
import { SHOT_TYPES, CAMERA_MOVES, validateShot, formatShotLabel } from '@/lib/agentic-os/filmmaker/shots';
import type { ShotListEntry, ShotType, CameraMove } from '@/lib/agentic-os/filmmaker/shots';
import { EmptyState } from '@/components/agentic-os/_shared/views';

interface Props {
  projectId: string;
  initial: ShotListEntry[];
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const selectCls = inputCls;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const BLANK_FORM = {
  sceneNumber: '',
  shotNumber: '',
  shotType: 'MS' as ShotType,
  cameraMove: 'STATIC' as CameraMove,
  subject: '',
  description: '',
  estimatedSeconds: '',
};

export function ShotListBuilder({ projectId, initial }: Props) {
  const [shots, setShots] = useState<ShotListEntry[]>(initial);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: keyof typeof BLANK_FORM, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validateShot({
      sceneNumber: form.sceneNumber,
      shotNumber: form.shotNumber,
      shotType: form.shotType,
      cameraMove: form.cameraMove,
      estimatedSeconds: form.estimatedSeconds ? Number(form.estimatedSeconds) : null,
    });
    if (validationErrors.length > 0) {
      setError(validationErrors[0] ?? 'Validation error');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        sceneNumber: form.sceneNumber.trim(),
        shotNumber: form.shotNumber.trim(),
        shotType: form.shotType,
        cameraMove: form.cameraMove,
        subject: form.subject.trim(),
        description: form.description.trim(),
        estimatedSeconds: form.estimatedSeconds ? Number(form.estimatedSeconds) : null,
      };
      const r = await fetch(`/api/tiresias/agentic-os/filmmaker/shots?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Request failed (${r.status})`);
      }
      const data = await r.json();
      setShots((prev) => [...prev, data.shot]);
      setForm({ ...BLANK_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(shotId: string) {
    const r = await fetch(`/api/tiresias/agentic-os/filmmaker/shots?id=${shotId}`, {
      method: 'PATCH',
    });
    if (r.ok) {
      setShots((prev) =>
        prev.map((s) => (s.id === shotId ? { ...s, completed: !s.completed } : s)),
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Add shot form */}
      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-white">Add shot</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Scene #">
            <input
              value={form.sceneNumber}
              onChange={(e) => updateField('sceneNumber', e.target.value)}
              placeholder="e.g. 3"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Shot #">
            <input
              value={form.shotNumber}
              onChange={(e) => updateField('shotNumber', e.target.value)}
              placeholder="e.g. A"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Estimated (sec)">
            <input
              type="number"
              min={0}
              max={3600}
              value={form.estimatedSeconds}
              onChange={(e) => updateField('estimatedSeconds', e.target.value)}
              placeholder="e.g. 8"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Shot type (ASC taxonomy)">
            <select
              value={form.shotType}
              onChange={(e) => updateField('shotType', e.target.value)}
              className={selectCls}
            >
              {SHOT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Camera move">
            <select
              value={form.cameraMove}
              onChange={(e) => updateField('cameraMove', e.target.value)}
              className={selectCls}
            >
              {CAMERA_MOVES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Subject / action">
          <input
            value={form.subject}
            onChange={(e) => updateField('subject', e.target.value)}
            placeholder="e.g. Maria walks toward the door"
            className={inputCls}
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={2}
            placeholder="Lens, framing notes, special equipment…"
            className={inputCls + ' resize-none'}
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Adding…' : 'Add shot'}
          </button>
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      </form>

      {/* Shot list table */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-white">
            Shot list{' '}
            <span className="text-text-secondary font-normal">({shots.length} shots)</span>
          </h2>
        </div>

        {shots.length === 0 ? (
          <EmptyState
            variant="bare"
            icon={<Film className="h-6 w-6" />}
            title="No shots yet"
            description="Add your first shot above — scene, framing, coverage, and camera move for each setup of the shoot."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-xs text-text-secondary uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Label</th>
                <th className="px-4 py-2 text-left">Subject</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Dur.</th>
                <th className="px-4 py-2 text-center">Done</th>
              </tr>
            </thead>
            <tbody>
              {shots.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-0/60 transition"
                >
                  <td className="px-4 py-2 font-mono text-xs text-text-primary">
                    {formatShotLabel(s)}
                  </td>
                  <td className="px-4 py-2 text-white max-w-[200px] truncate">{s.subject}</td>
                  <td className="px-4 py-2 text-text-secondary hidden sm:table-cell">
                    {s.estimatedSeconds != null ? `${s.estimatedSeconds}s` : '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleToggle(s.id)}
                      className={`w-5 h-5 rounded border text-xs font-bold transition ${
                        s.completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-border-subtle text-transparent hover:border-accent'
                      }`}
                      aria-label={s.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      ✓
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
