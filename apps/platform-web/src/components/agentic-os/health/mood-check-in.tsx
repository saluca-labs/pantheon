'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeartPulse, Sparkles } from 'lucide-react';
import type { MoodTag } from '@/lib/agentic-os/health/repo';

interface Props {
  /** Tags pre-fetched on the server. The client component manages
   *  selection state and lazy-creates new tags via POST /tags. */
  initialTags: MoodTag[];
  /** When set, the form is in "edit" mode for this entry id. */
  editingId?: string;
  /** Pre-fill values when editing. */
  initial?: {
    moodScore?: number | null;
    energyScore?: number | null;
    anxietyScore?: number | null;
    sleepQuality?: string | null;
    notes?: string | null;
    tagIds?: string[];
  };
}

const SLEEP_OPTIONS: { value: string; label: string }[] = [
  { value: 'poor', label: 'Poor' },
  { value: 'fair', label: 'Fair' },
  { value: 'good', label: 'Good' },
  { value: 'excellent', label: 'Excellent' },
];

export function MoodCheckIn({ initialTags, editingId, initial }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<MoodTag[]>(initialTags);
  const [moodScore, setMoodScore] = useState<number>(initial?.moodScore ?? 5);
  const [energyScore, setEnergyScore] = useState<number>(
    initial?.energyScore ?? 5,
  );
  const [anxietyScore, setAnxietyScore] = useState<number>(
    initial?.anxietyScore ?? 5,
  );
  const [sleepQuality, setSleepQuality] = useState<string>(
    initial?.sleepQuality ?? 'fair',
  );
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    new Set(initial?.tagIds ?? []),
  );
  const [newTagName, setNewTagName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notesId = useId();
  const [savedId, setSavedId] = useState<string | null>(null);

  // Keep tags fresh after a create.
  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addTag() {
    const name = newTagName.trim();
    if (!name) return;
    setError(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/mood/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Tag create failed');
      setTags((prev) =>
        prev.some((t) => t.id === data.tag.id) ? prev : [...prev, data.tag],
      );
      setSelectedTagIds((prev) => new Set([...prev, data.tag.id]));
      setNewTagName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tag create failed');
    }
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        moodScore,
        energyScore,
        anxietyScore,
        sleepQuality,
        notes: notes || null,
        tagIds: Array.from(selectedTagIds),
      };
      const url = editingId
        ? `/api/tiresias/agentic-os/health/mood/${editingId}`
        : '/api/tiresias/agentic-os/health/mood';
      const method = editingId ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Save failed');
      setSavedId(data.entry?.id ?? editingId ?? null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (savedId) {
    return (
      <div className="space-y-3">
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-2"
        >
          <Sparkles className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
          <div className="text-sm text-emerald-100">
            Saved. You can revisit or edit this on the journal trail below.
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/os/health/journal/new`)}
          className="w-full rounded-lg border border-border-subtle bg-surface-0 hover:bg-surface-2 text-sm text-white px-3 py-2 transition"
        >
          Add a journal entry →
        </button>
        <button
          type="button"
          onClick={() => {
            setSavedId(null);
            setNotes('');
          }}
          className="w-full rounded-lg border border-border-subtle bg-surface-0 hover:bg-surface-2 text-xs text-text-secondary hover:text-white px-3 py-2 transition"
        >
          Log another check-in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Slider
        icon={<HeartPulse className="w-4 h-4 text-rose-300" />}
        label="Mood"
        value={moodScore}
        onChange={setMoodScore}
        leftLabel="Low"
        rightLabel="High"
      />
      <Slider
        label="Energy"
        value={energyScore}
        onChange={setEnergyScore}
        leftLabel="Drained"
        rightLabel="Energized"
      />
      <Slider
        label="Anxiety"
        value={anxietyScore}
        onChange={setAnxietyScore}
        leftLabel="Calm"
        rightLabel="Anxious"
      />

      <div>
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Sleep quality
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {SLEEP_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setSleepQuality(opt.value)}
              className={`text-xs rounded border px-2 py-1.5 transition text-center ${
                sleepQuality === opt.value
                  ? 'border-accent bg-accent/15 text-white'
                  : 'border-border-subtle bg-surface-0 text-text-primary hover:border-accent/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Tags
        </span>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => {
            const selected = selectedTagIds.has(tag.id);
            return (
              <button
                type="button"
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`text-xs rounded-full border px-3 py-1 transition ${
                  selected
                    ? 'border-accent bg-accent/15 text-white'
                    : 'border-border-subtle bg-surface-0 text-text-primary hover:border-accent/50'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addTag();
              }
            }}
            placeholder="Add a tag…"
            className="flex-1 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-1.5"
          />
          <button
            type="button"
            onClick={() => void addTag()}
            disabled={!newTagName.trim()}
            className="rounded-lg border border-border-subtle bg-surface-0 hover:bg-surface-2 disabled:opacity-50 text-xs text-white px-3 py-1.5 transition"
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={notesId} className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
          Notes (optional)
        </label>
        <textarea
          id={notesId}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="What's behind these scores today?"
          className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-2 resize-y"
        />
        <p className="text-[10px] text-text-secondary/70 mt-1">
          Free-text notes are scanned for crisis language and routed to safety
          resources — they are never blocked or deleted.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
        >
          {submitting
            ? 'Saving…'
            : editingId
              ? 'Save changes'
              : 'Save check-in'}
        </button>
        <span role="alert" className="text-xs text-red-300">
          {error ?? ''}
        </span>
      </div>
    </div>
  );
}

interface SliderProps {
  icon?: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}

function Slider({ icon, label, value, onChange, leftLabel, rightLabel }: SliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-text-secondary">
          {icon}
          {label}
        </label>
        <span className="text-sm font-semibold text-white">{value}/10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
      <div className="flex justify-between text-[10px] text-text-secondary/70 mt-0.5">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
