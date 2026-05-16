'use client';

import { useState } from 'react';
import type { HealthProfile } from '@/lib/agentic-os/health/repo';

interface Props {
  initial: HealthProfile | null;
}

const ACTIVITY_LEVELS = [
  { v: 'sedentary', label: 'Sedentary (little or no exercise)' },
  { v: 'light', label: 'Light (1–3 days/week)' },
  { v: 'moderate', label: 'Moderate (3–5 days/week)' },
  { v: 'active', label: 'Active (6–7 days/week)' },
  { v: 'very_active', label: 'Very active (twice daily / physical job)' },
];

function joinList(xs: string[] | undefined): string {
  return (xs ?? []).join(', ');
}

function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function IntakeForm({ initial }: Props) {
  const [sex, setSex] = useState(initial?.sex ?? '');
  const [dob, setDob] = useState(initial?.dateOfBirth ?? '');
  const [heightCm, setHeightCm] = useState(initial?.heightCm?.toString() ?? '');
  const [weightKg, setWeightKg] = useState(initial?.weightKg?.toString() ?? '');
  const [activity, setActivity] = useState(initial?.activityLevel ?? '');
  const [goals, setGoals] = useState(joinList(initial?.goals));
  const [conditions, setConditions] = useState(joinList(initial?.conditions));
  const [medications, setMedications] = useState(joinList(initial?.medications));
  const [allergies, setAllergies] = useState(joinList(initial?.allergies));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body = {
        sex: sex || null,
        dateOfBirth: dob || null,
        heightCm: heightCm ? Number(heightCm) : null,
        weightKg: weightKg ? Number(weightKg) : null,
        activityLevel: activity || null,
        goals: splitList(goals),
        conditions: splitList(conditions),
        medications: splitList(medications),
        allergies: splitList(allergies),
      };
      const r = await fetch('/api/tiresias/agentic-os/health/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${r.status})`);
      }
      setMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Sex">
          <input
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            placeholder="e.g. male, female, other"
            className={inputCls}
          />
        </Field>
        <Field label="Date of birth (YYYY-MM-DD)">
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Height (cm)">
          <input
            type="number"
            min={30}
            max={300}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Weight (kg)">
          <input
            type="number"
            min={10}
            max={500}
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Activity level">
        <select
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          className={inputCls}
        >
          <option value="">Select…</option>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.v} value={a.v}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Goals (comma-separated)">
        <input
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          placeholder="e.g. better sleep, run a 5K, manage stress"
          className={inputCls}
        />
      </Field>
      <Field label="Conditions (comma-separated)">
        <input
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          placeholder="e.g. asthma, hypertension"
          className={inputCls}
        />
      </Field>
      <Field label="Medications & supplements (comma-separated)">
        <input
          value={medications}
          onChange={(e) => setMedications(e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Allergies (comma-separated)">
        <input
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 transition"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {message && <span className="text-sm text-positive">{message}</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
