'use client';

/**
 * CyberSec OS — Playbook steps editor.
 *
 * Each step has kind + label + instructions + optional fields[]. Reorder via
 * up/down arrow buttons (no @dnd-kit). Save via PUT to
 * /playbooks/[id]/steps.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import type {
  Playbook,
  PlaybookStep,
  PlaybookStepField,
  PlaybookStepKind,
} from '@/lib/agentic-os/cyber/playbooks';
import {
  PLAYBOOK_STEP_KINDS,
  defaultStepFor,
} from '@/lib/agentic-os/cyber/playbooks';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const FIELD_TYPES: PlaybookStepField['type'][] = ['text', 'textarea', 'select', 'checkbox'];

export interface PlaybookStepsEditorProps {
  playbook: Playbook;
  onSaved?: (p: Playbook) => void;
}

export function PlaybookStepsEditor({ playbook, onSaved }: PlaybookStepsEditorProps) {
  const router = useRouter();
  const [steps, setSteps] = useState<PlaybookStep[]>(playbook.steps);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function update(idx: number, patch: Partial<PlaybookStep>) {
    setSteps((curr) => {
      const next = curr.slice();
      next[idx] = { ...next[idx]!, ...patch } as PlaybookStep;
      return next;
    });
    setDirty(true);
  }

  function move(idx: number, direction: -1 | 1) {
    setSteps((curr) => {
      const target = idx + direction;
      if (target < 0 || target >= curr.length) return curr;
      const next = curr.slice();
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved!);
      return next;
    });
    setDirty(true);
  }

  function remove(idx: number) {
    setSteps((curr) => curr.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function add(kind: PlaybookStepKind) {
    setSteps((curr) => [...curr, defaultStepFor(kind)]);
    setDirty(true);
  }

  function addField(idx: number) {
    update(idx, {
      fields: [
        ...(steps[idx]!.fields ?? []),
        { name: 'field_' + ((steps[idx]!.fields?.length ?? 0) + 1), label: 'New field', type: 'text' },
      ],
    });
  }

  function updateField(stepIdx: number, fieldIdx: number, patch: Partial<PlaybookStepField>) {
    const step = steps[stepIdx]!;
    const fields = (step.fields ?? []).slice();
    fields[fieldIdx] = { ...fields[fieldIdx]!, ...patch };
    update(stepIdx, { fields });
  }

  function removeField(stepIdx: number, fieldIdx: number) {
    const step = steps[stepIdx]!;
    const fields = (step.fields ?? []).filter((_, i) => i !== fieldIdx);
    update(stepIdx, { fields });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/cyber/playbooks/${playbook.id}/steps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { playbook: saved } = await r.json();
      setDirty(false);
      onSaved?.(saved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Steps</h2>
        <div className="flex items-center gap-2">
          {PLAYBOOK_STEP_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => add(k.value)}
              className="inline-flex items-center gap-1 rounded-lg border border-border-subtle hover:border-accent/60 text-text-primary hover:text-white px-2 py-1 text-xs transition"
            >
              <Plus className="w-3 h-3" />
              {k.label}
            </button>
          ))}
        </div>
      </header>

      {steps.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No steps yet. Add one above to start.
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, idx) => (
            <li
              key={idx}
              className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-border-subtle text-text-secondary">
                  step {idx + 1}
                </span>
                <select
                  value={step.kind}
                  onChange={(e) => update(idx, { kind: e.target.value as PlaybookStepKind })}
                  className="rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none"
                >
                  {PLAYBOOK_STEP_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                <div className="ml-auto flex items-center gap-1">
                  <IconBtn onClick={() => move(idx, -1)} disabled={idx === 0} label="Move up">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn onClick={() => move(idx, 1)} disabled={idx === steps.length - 1} label="Move down">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn onClick={() => remove(idx)} label="Remove step">
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                  </IconBtn>
                </div>
              </div>

              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Label</span>
                <input
                  value={step.label}
                  onChange={(e) => update(idx, { label: e.target.value })}
                  className={inputCls}
                  placeholder="Triage the alert"
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
                  Instructions (markdown)
                </span>
                <textarea
                  value={step.instructions ?? ''}
                  onChange={(e) => update(idx, { instructions: e.target.value })}
                  rows={3}
                  className={inputCls + ' resize-y leading-relaxed font-mono text-[12px]'}
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-text-secondary">Fields</span>
                  <button
                    type="button"
                    onClick={() => addField(idx)}
                    className="text-[11px] text-accent hover:text-accent/80 transition"
                  >
                    + Add field
                  </button>
                </div>
                {(step.fields ?? []).map((field, fidx) => (
                  <div
                    key={fidx}
                    className="grid grid-cols-12 gap-2 items-center rounded border border-border-subtle bg-surface-0 p-2"
                  >
                    <input
                      value={field.name}
                      onChange={(e) => updateField(idx, fidx, { name: e.target.value })}
                      placeholder="name"
                      className="col-span-3 rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none"
                    />
                    <input
                      value={field.label}
                      onChange={(e) => updateField(idx, fidx, { label: e.target.value })}
                      placeholder="Label"
                      className="col-span-4 rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none"
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        updateField(idx, fidx, { type: e.target.value as PlaybookStepField['type'] })
                      }
                      className="col-span-2 rounded-md border border-border-subtle bg-surface-0 px-2 py-1 text-xs text-white focus:border-accent focus:outline-none"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <label className="col-span-2 inline-flex items-center gap-1 text-[11px] text-text-primary">
                      <input
                        type="checkbox"
                        checked={field.required ?? false}
                        onChange={(e) => updateField(idx, fidx, { required: e.target.checked })}
                        className="accent-accent"
                      />
                      required
                    </label>
                    <button
                      type="button"
                      onClick={() => removeField(idx, fidx)}
                      className="col-span-1 text-danger hover:text-danger/80 text-[11px]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : dirty ? 'Save steps' : 'Saved'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-md border border-border-subtle hover:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed text-text-primary px-1.5 py-1 transition"
    >
      {children}
    </button>
  );
}
