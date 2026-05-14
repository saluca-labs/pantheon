'use client';

import { useState } from 'react';
import type { MentalProfile } from '@/lib/agentic-os/health/repo';
import {
  SLEEP_QUALITY_VALUES,
  SUPPORT_SYSTEM_VALUES,
} from '@/lib/agentic-os/health/schemas';

interface Props {
  initial: MentalProfile | null;
  /** Optional callback after a successful save. */
  onSaved?: () => void;
}

const SLEEP_LABELS: Record<string, string> = {
  poor: 'Poor — frequent disruption, unrefreshing',
  fair: 'Fair — some disruption, mostly OK',
  good: 'Good — generally restful',
  excellent: 'Excellent — consistently restful',
};

const SUPPORT_LABELS: Record<string, string> = {
  none: 'None — I rarely have someone to talk to',
  limited: 'Limited — one or two people occasionally',
  moderate: 'Moderate — a few people I can lean on',
  strong: 'Strong — a robust support network',
};

function joinList(xs: string[] | undefined): string {
  return (xs ?? []).join(', ');
}

function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function MentalIntakeForm({ initial, onSaved }: Props) {
  const [stress, setStress] = useState(
    initial?.stressBaseline?.toString() ?? '',
  );
  const [sleep, setSleep] = useState(initial?.sleepQuality ?? '');
  const [support, setSupport] = useState(initial?.supportSystem ?? '');
  const [therapy, setTherapy] = useState(initial?.currentTherapy ?? false);
  const [meds, setMeds] = useState(initial?.currentMeds ?? false);
  const [medNotes, setMedNotes] = useState(initial?.medNotes ?? '');
  const [goals, setGoals] = useState(joinList(initial?.goals));
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
        stressBaseline: stress ? Number(stress) : null,
        sleepQuality: sleep || null,
        supportSystem: support || null,
        currentTherapy: therapy,
        currentMeds: meds,
        medNotes: medNotes || null,
        goals: splitList(goals),
      };
      const r = await fetch('/api/tiresias/agentic-os/health/mh-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (r.status === 403) {
          throw new Error(
            'Mental-health consent required. Grant it on the Health OS hub before completing this form.',
          );
        }
        throw new Error(data.error ?? `Save failed (${r.status})`);
      }
      const data = await r.json().catch(() => ({}));
      const flags = typeof data.flagsCreated === 'number' ? data.flagsCreated : 0;
      setMessage(
        flags > 0
          ? `Saved. ${flags} risk flag${flags === 1 ? '' : 's'} created — review on the hub.`
          : 'Saved.',
      );
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field
        label="Stress baseline (0 = calm, 10 = overwhelmed)"
        hint="Your typical stress level over the last two weeks."
      >
        <input
          type="number"
          min={0}
          max={10}
          value={stress}
          onChange={(e) => setStress(e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Sleep quality">
        <select
          value={sleep}
          onChange={(e) => setSleep(e.target.value)}
          className={inputCls}
        >
          <option value="">Select…</option>
          {SLEEP_QUALITY_VALUES.map((v) => (
            <option key={v} value={v}>
              {SLEEP_LABELS[v]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Support system">
        <select
          value={support}
          onChange={(e) => setSupport(e.target.value)}
          className={inputCls}
        >
          <option value="">Select…</option>
          {SUPPORT_SYSTEM_VALUES.map((v) => (
            <option key={v} value={v}>
              {SUPPORT_LABELS[v]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CheckboxField
          label="Currently in therapy"
          checked={therapy}
          onChange={setTherapy}
        />
        <CheckboxField
          label="Currently on prescribed mental-health medication"
          checked={meds}
          onChange={setMeds}
        />
      </div>

      <Field
        label="Medication notes (optional)"
        hint="Names, dosages, or anything you want surfaced to your plan. Free text — checked for crisis language but never blocked."
      >
        <textarea
          value={medNotes}
          onChange={(e) => setMedNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          className={`${inputCls} font-sans`}
        />
      </Field>

      <Field
        label="Mental-health goals (comma-separated)"
        hint="e.g. reduce anxiety, build a sleep routine, journal weekly"
      >
        <input
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 transition"
        >
          {saving ? 'Saving…' : 'Save mental-health profile'}
        </button>
        {message && <span className="text-sm text-emerald-300">{message}</span>}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-text-secondary/80 mt-1.5 leading-relaxed">
          {hint}
        </span>
      )}
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border-subtle bg-surface-0 text-accent focus:ring-accent"
      />
      <span className="text-sm text-text-primary">{label}</span>
    </label>
  );
}
