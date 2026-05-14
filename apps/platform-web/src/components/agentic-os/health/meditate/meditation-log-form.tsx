'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { MoodScale, TextInput } from '../cbt/wizards/_shared';

export function MeditationLogForm() {
  const router = useRouter();
  const [source, setSource] = useState<'manual' | 'medito' | 'plan'>('manual');
  const [sourceRef, setSourceRef] = useState('');
  const [durationMin, setDurationMin] = useState(10);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        source,
        sourceRef: source === 'manual' ? null : sourceRef || null,
        durationMin,
        moodBefore,
        moodAfter,
        notes: notes || null,
      };
      const r = await fetch(
        '/api/tiresias/agentic-os/health/meditation/sessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Save failed');
      router.push('/dashboard/os/health/meditate');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Session source
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(['manual', 'medito', 'plan'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`text-xs rounded-full border px-3 py-1 transition ${
                source === s
                  ? 'border-accent bg-accent/15 text-white'
                  : 'border-border-subtle bg-surface-0 text-text-primary hover:border-accent/50'
              }`}
            >
              {s === 'manual'
                ? 'Free-form'
                : s === 'medito'
                  ? 'From catalog'
                  : 'Followed plan'}
            </button>
          ))}
        </div>
      </div>
      {source !== 'manual' && (
        <TextInput
          label="Session reference"
          value={sourceRef}
          onChange={setSourceRef}
          placeholder="Catalog slug (e.g. breath-awareness-10)"
        />
      )}
      <div>
        <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Duration (minutes)
        </label>
        <input
          type="number"
          min={1}
          max={240}
          value={durationMin}
          onChange={(e) =>
            setDurationMin(
              Math.max(
                1,
                Math.min(240, parseInt(e.target.value || '0', 10) || 1),
              ),
            )
          }
          className="w-32 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white px-3 py-2"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MoodScale label="Mood before" value={moodBefore} onChange={setMoodBefore} />
        <MoodScale label="Mood after" value={moodAfter} onChange={setMoodAfter} />
      </div>
      <TextInput
        label="Notes (optional)"
        value={notes}
        onChange={setNotes}
        multiline
        rows={3}
        placeholder="How did the session go?"
      />
      <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition"
        >
          <Save className="w-4 h-4" />
          {submitting ? 'Saving…' : 'Save session'}
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </div>
  );
}
