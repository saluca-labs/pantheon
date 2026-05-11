'use client';

/**
 * Research OS — ExperimentForm.
 *
 * Drawer-style create form for a new experiment. Mirrors Maker's
 * NewProjectDrawer. Captures the project-shaped fields (name, description,
 * status, cover image URL, target completion date, team size, tags). The
 * legacy bench-side fields (independent / dependent / controls / protocol /
 * success criteria) are not exposed in the create drawer — those are edited
 * on the experiment detail page when needed.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { useState } from 'react';
import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_STATUS_LABELS,
  type ExperimentStatus,
} from '@/lib/agentic-os/research/experiments';
import type { ResearchExperiment } from '@/lib/agentic-os/research/repo';

const API = '/api/tiresias/agentic-os/research/experiments';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ExperimentForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (e: ResearchExperiment) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ExperimentStatus>('planning');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [targetCompletionDate, setTargetCompletionDate] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        status,
        coverImageUrl: coverImageUrl.trim() || null,
        targetCompletionDate: targetCompletionDate || null,
        teamSize: teamSize ? Number(teamSize) : null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { experiment } = await r.json();
      onCreated(experiment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60">
      <form
        onSubmit={submit}
        className="h-full w-full max-w-md overflow-y-auto border-l border-[#2a2d3e] bg-[#0f1117] p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">New experiment</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[#94a3b8] hover:text-white transition"
          >
            Close
          </button>
        </div>

        <Field label="Experiment name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Enzyme activity vs temperature sweep"
            required
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputCls + ' resize-none'}
            placeholder="What is this experiment exploring?"
          />
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ExperimentStatus)}
            className={inputCls}
          >
            {EXPERIMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EXPERIMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cover image URL">
          <input
            type="url"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Target completion">
            <input
              type="date"
              value={targetCompletionDate}
              onChange={(e) => setTargetCompletionDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Team size">
            <input
              type="number"
              min={0}
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              className={inputCls}
              placeholder="e.g. 1"
            />
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className={inputCls}
            placeholder="biochemistry, enzymes, sweep"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          {error && <span className="text-sm text-red-300 mr-auto">{error}</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#4361EE]/60 text-white px-4 py-2 text-sm transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {saving ? 'Creating…' : 'Create experiment'}
          </button>
        </div>
      </form>
    </div>
  );
}
