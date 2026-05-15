'use client';

/**
 * Flat edit form for CBT logs. Mirrors the same fields as the new-log
 * wizards but in a single-step layout — multi-step wizards are great
 * for guided submission and ill-suited for edits where the user just
 * wants to fix one field.
 *
 * Validation lives server-side (the PATCH route re-runs the per-kind
 * Zod schema and the crisis-language guard). The client only enforces
 * field shapes loose enough that a mid-edit state isn't rejected.
 */

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { MoodScale, TextInput } from './wizards/_shared';
import type { CbtLog } from '@/lib/agentic-os/health/repo';

interface Props {
  log: CbtLog;
}

interface EditorState {
  moodBefore: number | null;
  moodAfter: number | null;
  notes: string;
  /** The per-kind data payload, kept loose-typed; rendered by per-kind branches. */
  data: Record<string, unknown>;
}

function initialState(log: CbtLog): EditorState {
  return {
    moodBefore: log.moodBefore,
    moodAfter: log.moodAfter,
    notes: log.notes ?? '',
    data: { ...(log.data ?? {}) },
  };
}

export function CbtLogEditor({ log }: Props) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(initialState(log));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchData(patch: Record<string, unknown>) {
    setState((s) => ({ ...s, data: { ...s.data, ...patch } }));
  }

  async function onSave() {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        kind: log.kind,
        data: state.data,
        moodBefore: state.moodBefore,
        moodAfter: state.moodAfter,
        notes: state.notes.trim().length > 0 ? state.notes : null,
      };
      const r = await fetch(
        `/api/tiresias/agentic-os/health/cbt/${log.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Save failed');
      router.push(`/dashboard/os/health/cbt/logs/${log.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this CBT log? This cannot be undone.')) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/health/cbt/${log.id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? 'Delete failed');
      }
      router.push('/dashboard/os/health/cbt/logs');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <KindFields kind={log.kind} data={state.data} onPatch={patchData} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MoodScale
          label="Mood before"
          value={state.moodBefore}
          onChange={(v) => setState((s) => ({ ...s, moodBefore: v }))}
        />
        <MoodScale
          label="Mood after"
          value={state.moodAfter}
          onChange={(v) => setState((s) => ({ ...s, moodAfter: v }))}
        />
      </div>

      <TextInput
        label="Notes"
        value={state.notes}
        onChange={(v) => setState((s) => ({ ...s, notes: v }))}
        multiline
        rows={3}
        placeholder="Optional additional notes."
      />

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
        >
          <Save className="w-4 h-4" />
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={submitting}
          className="rounded-lg border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 disabled:opacity-60 text-red-200 text-xs px-3 py-2 transition"
        >
          Delete
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </div>
  );
}

// ─── Per-kind editable field sets ─────────────────────────────────────────

interface KindFieldsProps {
  kind: CbtLog['kind'];
  data: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

function strField(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}
function strArr(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : ''));
}

function KindFields({ kind, data, onPatch }: KindFieldsProps) {
  const durationMinId = useId();
  switch (kind) {
    case 'thought-record':
      return (
        <div className="space-y-3">
          <TextInput
            label="Situation"
            value={strField(data, 'situation')}
            onChange={(v) => onPatch({ situation: v })}
            multiline
            rows={3}
          />
          <TextInput
            label="Automatic thought"
            value={strField(data, 'automatic_thought')}
            onChange={(v) => onPatch({ automatic_thought: v })}
            multiline
            rows={3}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput
              label="Evidence for"
              value={strField(data, 'evidence_for')}
              onChange={(v) => onPatch({ evidence_for: v })}
              multiline
              rows={3}
            />
            <TextInput
              label="Evidence against"
              value={strField(data, 'evidence_against')}
              onChange={(v) => onPatch({ evidence_against: v })}
              multiline
              rows={3}
            />
          </div>
          <TextInput
            label="Balanced thought"
            value={strField(data, 'balanced_thought')}
            onChange={(v) => onPatch({ balanced_thought: v })}
            multiline
            rows={3}
          />
        </div>
      );
    case 'behavioral-activation':
      return (
        <div className="space-y-3">
          <TextInput
            label="Activity"
            value={strField(data, 'activity')}
            onChange={(v) => onPatch({ activity: v })}
            multiline
            rows={2}
          />
          <TextInput
            label="Scheduled for"
            value={strField(data, 'scheduled_for')}
            onChange={(v) => onPatch({ scheduled_for: v })}
          />
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={!!data.completed}
              onChange={(e) => onPatch({ completed: e.target.checked })}
              className="accent-accent"
            />
            Completed
          </label>
          <TextInput
            label="Reflection"
            value={strField(data, 'reflection')}
            onChange={(v) => onPatch({ reflection: v })}
            multiline
            rows={3}
          />
        </div>
      );
    case 'worry-time':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput
              label="Scheduled at"
              value={strField(data, 'scheduled_at')}
              onChange={(v) => onPatch({ scheduled_at: v })}
            />
            <div>
              <label htmlFor={durationMinId} className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                Duration (min)
              </label>
              <input
                id={durationMinId}
                type="number"
                min={1}
                max={120}
                value={typeof data.duration_min === 'number' ? data.duration_min : ''}
                onChange={(e) =>
                  onPatch({ duration_min: Number(e.target.value) || 0 })
                }
                className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white px-3 py-2"
              />
            </div>
          </div>
          <StringListEditor
            label="Worries"
            value={strArr(data, 'worries')}
            onChange={(arr) => onPatch({ worries: arr })}
          />
          <TextInput
            label="Reflection"
            value={strField(data, 'reflection')}
            onChange={(v) => onPatch({ reflection: v })}
            multiline
            rows={3}
          />
        </div>
      );
    case 'grounding-54321':
      return (
        <div className="space-y-3">
          <FixedListEditor
            label="5 you can see"
            length={5}
            value={strArr(data, 'five_see')}
            onChange={(arr) => onPatch({ five_see: arr })}
          />
          <FixedListEditor
            label="4 you can feel"
            length={4}
            value={strArr(data, 'four_feel')}
            onChange={(arr) => onPatch({ four_feel: arr })}
          />
          <FixedListEditor
            label="3 you can hear"
            length={3}
            value={strArr(data, 'three_hear')}
            onChange={(arr) => onPatch({ three_hear: arr })}
          />
          <FixedListEditor
            label="2 you can smell"
            length={2}
            value={strArr(data, 'two_smell')}
            onChange={(arr) => onPatch({ two_smell: arr })}
          />
          <FixedListEditor
            label="1 you can taste"
            length={1}
            value={strArr(data, 'one_taste')}
            onChange={(arr) => onPatch({ one_taste: arr })}
          />
        </div>
      );
    case 'gratitude':
      return (
        <FixedListEditor
          label="Three good things"
          length={3}
          value={strArr(data, 'entries')}
          onChange={(arr) => onPatch({ entries: arr })}
        />
      );
    case 'values-clarification':
      return (
        <ValuesEditor
          value={Array.isArray(data.values) ? (data.values as unknown[]) : []}
          onChange={(arr) => onPatch({ values: arr })}
        />
      );
    case 'sleep-hygiene':
      return (
        <div className="space-y-3">
          <ChecklistEditor
            value={Array.isArray(data.checklist) ? (data.checklist as unknown[]) : []}
            onChange={(arr) => onPatch({ checklist: arr })}
          />
          <TextInput
            label="Notes"
            value={strField(data, 'notes')}
            onChange={(v) => onPatch({ notes: v })}
            multiline
            rows={3}
          />
        </div>
      );
    default:
      return (
        <p className="text-sm text-text-secondary">
          No editor for kind <code>{kind}</code>.
        </p>
      );
  }
}

function StringListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (arr: string[]) => void;
}) {
  const items = value.length > 0 ? value : [''];
  function update(i: number, v: string) {
    const next = items.slice();
    next[i] = v;
    onChange(next);
  }
  function add() {
    onChange([...items, '']);
  }
  function remove(i: number) {
    if (items.length <= 1) return;
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </label>
      <ul className="space-y-2">
        {items.map((v, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => update(i, e.target.value)}
              className="flex-1 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white px-3 py-2"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-text-secondary hover:text-red-300 px-2"
              >
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-2 text-xs text-accent hover:text-[#5d7aff] transition"
      >
        + Add
      </button>
    </div>
  );
}

function FixedListEditor({
  label,
  length,
  value,
  onChange,
}: {
  label: string;
  length: number;
  value: string[];
  onChange: (arr: string[]) => void;
}) {
  const items = Array.from({ length }, (_, i) => value[i] ?? '');
  function update(i: number, v: string) {
    const next = items.slice();
    next[i] = v;
    onChange(next);
  }
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </label>
      <ul className="space-y-2">
        {items.map((v, i) => (
          <li key={i}>
            <input
              type="text"
              value={v}
              onChange={(e) => update(i, e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white px-3 py-2"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ValueRow {
  domain: string;
  importance: number;
  current_alignment: number;
  action: string;
}

function ValuesEditor({
  value,
  onChange,
}: {
  value: unknown[];
  onChange: (arr: ValueRow[]) => void;
}) {
  const rows: ValueRow[] = value.length > 0
    ? value.map((v) => {
        const r = (v ?? {}) as Record<string, unknown>;
        return {
          domain: typeof r.domain === 'string' ? r.domain : '',
          importance: typeof r.importance === 'number' ? r.importance : 5,
          current_alignment:
            typeof r.current_alignment === 'number' ? r.current_alignment : 5,
          action: typeof r.action === 'string' ? r.action : '',
        };
      })
    : [{ domain: '', importance: 5, current_alignment: 5, action: '' }];

  function update(i: number, patch: Partial<ValueRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([
      ...rows,
      { domain: '', importance: 5, current_alignment: 5, action: '' },
    ]);
  }
  function remove(i: number) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs uppercase tracking-wide text-text-secondary">
        Values
      </span>
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li
            key={i}
            className="rounded-xl border border-border-subtle bg-surface-0 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={r.domain}
                onChange={(e) => update(i, { domain: e.target.value })}
                placeholder="Domain"
                className="flex-1 rounded-lg border border-border-subtle bg-surface-2 text-sm text-white px-3 py-2"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-xs text-text-secondary hover:text-red-300 px-2"
                >
                  remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-text-secondary mb-1">
                  Importance ({r.importance})
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={r.importance}
                  onChange={(e) =>
                    update(i, { importance: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-text-secondary mb-1">
                  Current alignment ({r.current_alignment})
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={r.current_alignment}
                  onChange={(e) =>
                    update(i, {
                      current_alignment: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-accent"
                />
              </div>
            </div>
            <textarea
              value={r.action}
              onChange={(e) => update(i, { action: e.target.value })}
              rows={2}
              placeholder="One concrete action"
              className="w-full rounded-lg border border-border-subtle bg-surface-2 text-sm text-white px-3 py-2 leading-relaxed resize-y"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="text-xs text-accent hover:text-[#5d7aff] transition"
      >
        + Add domain
      </button>
    </div>
  );
}

interface ChecklistRow {
  item: string;
  met: boolean;
}

function ChecklistEditor({
  value,
  onChange,
}: {
  value: unknown[];
  onChange: (arr: ChecklistRow[]) => void;
}) {
  const rows: ChecklistRow[] = value.length > 0
    ? value.map((v) => {
        const r = (v ?? {}) as Record<string, unknown>;
        return {
          item: typeof r.item === 'string' ? r.item : '',
          met: !!r.met,
        };
      })
    : [{ item: '', met: false }];

  function update(i: number, patch: Partial<ChecklistRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([...rows, { item: '', met: false }]);
  }
  function remove(i: number) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs uppercase tracking-wide text-text-secondary">
        Checklist
      </span>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-0 p-2"
          >
            <input
              type="checkbox"
              checked={r.met}
              onChange={(e) => update(i, { met: e.target.checked })}
              className="accent-accent"
            />
            <input
              type="text"
              value={r.item}
              onChange={(e) => update(i, { item: e.target.value })}
              placeholder="Item"
              className="flex-1 rounded-lg border border-border-subtle bg-surface-2 text-sm text-white px-3 py-2"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-text-secondary hover:text-red-300 px-2"
              >
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="text-xs text-accent hover:text-[#5d7aff] transition"
      >
        + Add item
      </button>
    </div>
  );
}
