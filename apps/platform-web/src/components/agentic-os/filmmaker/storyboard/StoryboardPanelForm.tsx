'use client';

/**
 * Filmmaker OS — Storyboard panel editor form.
 *
 * Used for both adding a new panel and editing an existing one.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import type { StoryboardPanel } from '@/lib/agentic-os/filmmaker/storyboards';

interface Props {
  initial?: StoryboardPanel;
  onCancel: () => void;
  onSubmit: (data: PanelFormData) => Promise<void>;
}

export interface PanelFormData {
  imageUrl: string | null;
  cameraAngle: string | null;
  cameraMove: string | null;
  shotSize: string | null;
  description: string | null;
  dialogueExcerpt: string | null;
  durationSeconds: number | null;
  notes: string | null;
}

function n(v: string): string | null {
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export function StoryboardPanelForm({ initial, onCancel, onSubmit }: Props) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [cameraAngle, setCameraAngle] = useState(initial?.cameraAngle ?? '');
  const [cameraMove, setCameraMove] = useState(initial?.cameraMove ?? '');
  const [shotSize, setShotSize] = useState(initial?.shotSize ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dialogueExcerpt, setDialogueExcerpt] = useState(
    initial?.dialogueExcerpt ?? '',
  );
  const [durationSeconds, setDurationSeconds] = useState(
    initial?.durationSeconds == null ? '' : String(initial.durationSeconds),
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const duration = durationSeconds.trim() === ''
        ? null
        : Number.parseFloat(durationSeconds);
      if (duration != null && !Number.isFinite(duration)) {
        setError('Duration must be a number');
        setBusy(false);
        return;
      }
      await onSubmit({
        imageUrl: n(imageUrl),
        cameraAngle: n(cameraAngle),
        cameraMove: n(cameraMove),
        shotSize: n(shotSize),
        description: n(description),
        dialogueExcerpt: n(dialogueExcerpt),
        durationSeconds: duration,
        notes: n(notes),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3"
    >
      <Field label="Image URL">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
        />
        <p className="text-[10px] text-text-tertiary mt-1">
          URL-only (image hosting lives outside this surface).
        </p>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Shot size">
          <input
            type="text"
            value={shotSize}
            onChange={(e) => setShotSize(e.target.value)}
            placeholder="WS / MS / CU / ECU"
            className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
          />
        </Field>
        <Field label="Camera angle">
          <input
            type="text"
            value={cameraAngle}
            onChange={(e) => setCameraAngle(e.target.value)}
            placeholder="Low angle / Bird's eye"
            className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
          />
        </Field>
        <Field label="Camera move">
          <input
            type="text"
            value={cameraMove}
            onChange={(e) => setCameraMove(e.target.value)}
            placeholder="Dolly in / Static / Handheld"
            className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Dialogue / action overlay">
          <textarea
            value={dialogueExcerpt}
            onChange={(e) => setDialogueExcerpt(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
          />
        </Field>
        <Field label="Duration (seconds)">
          <input
            type="number"
            step="0.1"
            min="0"
            max="999"
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(e.target.value)}
            className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md bg-surface-0 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent outline-none transition"
        />
      </Field>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border-subtle text-sm text-text-secondary hover:bg-surface-0 hover:text-text-primary px-3 py-2 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium text-sm px-4 py-2 transition"
        >
          {busy ? 'Saving…' : initial ? 'Save panel' : 'Add panel'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
