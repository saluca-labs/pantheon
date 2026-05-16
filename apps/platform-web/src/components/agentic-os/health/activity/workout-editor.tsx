'use client';

/**
 * Workout template builder/editor — shared by create + edit flows.
 *
 * Same pattern as recipe-editor (5b): save the header first to mint an
 * id, then add blocks against the saved template. Reorder is via up/down
 * arrows (no dnd lib in deps).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';

type Intensity = 'light' | 'moderate' | 'vigorous';
type BlockKind = 'exercise' | 'rest' | 'note';

export interface WorkoutEditorBlock {
  id?: string;
  kind: BlockKind;
  name: string;
  sets: number | null;
  reps: string | null;
  durationSec: number | null;
  restSec: number | null;
  weightHint: string | null;
  notes: string | null;
}

export interface WorkoutEditorTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  targetIntensity: Intensity;
  estDurationMin: number;
  tags: string[];
  blocks: WorkoutEditorBlock[];
}

export interface WorkoutEditorProps {
  initialTemplate: WorkoutEditorTemplate | null;
}

const CATEGORIES = ['cardio', 'strength', 'mobility', 'mixed'];
const INTENSITIES: Intensity[] = ['light', 'moderate', 'vigorous'];
const KINDS: BlockKind[] = ['exercise', 'rest', 'note'];

export function WorkoutEditor({ initialTemplate }: WorkoutEditorProps) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string | null>(
    initialTemplate?.id ?? null,
  );
  const [name, setName] = useState(initialTemplate?.name ?? '');
  const [description, setDescription] = useState(
    initialTemplate?.description ?? '',
  );
  const [category, setCategory] = useState(initialTemplate?.category ?? 'cardio');
  const [targetIntensity, setTargetIntensity] = useState<Intensity>(
    initialTemplate?.targetIntensity ?? 'moderate',
  );
  const [estDurationMin, setEstDurationMin] = useState<number>(
    initialTemplate?.estDurationMin ?? 30,
  );
  const [tagsText, setTagsText] = useState(
    (initialTemplate?.tags ?? []).join(', '),
  );
  const [blocks, setBlocks] = useState<WorkoutEditorBlock[]>(
    initialTemplate?.blocks ?? [],
  );
  const [savingHeader, setSavingHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveHeader = async () => {
    setSavingHeader(true);
    setError(null);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        category,
        targetIntensity,
        estDurationMin: Number(estDurationMin) || 30,
        tags,
      };
      const url = templateId
        ? `/api/tiresias/agentic-os/health/workouts/${templateId}`
        : `/api/tiresias/agentic-os/health/workouts`;
      const r = await fetch(url, {
        method: templateId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'Save failed');
        return;
      }
      const newId = j.template.id as string;
      if (!templateId) {
        setTemplateId(newId);
        router.replace(`/dashboard/os/health/workouts/${newId}`);
      }
    } finally {
      setSavingHeader(false);
    }
  };

  const addBlock = async (kind: BlockKind) => {
    if (!templateId) {
      setError('Save the workout header first to add blocks.');
      return;
    }
    const r = await fetch(
      `/api/tiresias/agentic-os/health/workouts/${templateId}/blocks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          name: kind === 'rest' ? 'Rest' : kind === 'note' ? 'Note' : 'New exercise',
        }),
      },
    );
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? 'Add block failed');
      return;
    }
    setBlocks((prev) => [...prev, j.block]);
  };

  const updateBlock = async (
    block: WorkoutEditorBlock,
    patch: Partial<WorkoutEditorBlock>,
  ) => {
    if (!templateId || !block.id) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/health/workouts/${templateId}/blocks/${block.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    const j = await r.json();
    if (r.ok) {
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? j.block : b)),
      );
    }
  };

  const deleteBlock = async (block: WorkoutEditorBlock) => {
    if (!templateId || !block.id) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/health/workouts/${templateId}/blocks/${block.id}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    }
  };

  const reorder = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBlocks(next);
    if (!templateId) return;
    const orderedIds = next.map((b) => b.id).filter((id): id is string => !!id);
    await fetch(
      `/api/tiresias/agentic-os/health/workouts/${templateId}/blocks`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      },
    );
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="we-input"
              placeholder="e.g. Tuesday push"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="we-input"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target intensity">
            <select
              value={targetIntensity}
              onChange={(e) =>
                setTargetIntensity(e.target.value as Intensity)
              }
              className="we-input"
            >
              {INTENSITIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Est. duration (min)">
            <input
              type="number"
              min="1"
              value={String(estDurationMin)}
              onChange={(e) =>
                setEstDurationMin(Number(e.target.value) || 30)
              }
              className="we-input"
            />
          </Field>
          <Field label="Tags (comma-separated)" wide>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="we-input"
              placeholder="e.g. push, upper-body"
            />
          </Field>
          <Field label="Description (markdown)" wide>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="we-input"
              placeholder="Optional summary, cues, references"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={saveHeader}
            disabled={savingHeader || name.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {savingHeader
              ? 'Saving…'
              : templateId
                ? 'Save workout'
                : 'Create workout'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Blocks</h2>
          {!templateId && (
            <span className="text-[11px] text-text-secondary">
              Save the header first to add blocks.
            </span>
          )}
        </div>
        <ul className="space-y-2">
          {blocks.map((b, i) => (
            <BlockRow
              key={b.id ?? `new-${i}`}
              block={b}
              onUpdate={(patch) => updateBlock(b, patch)}
              onDelete={() => deleteBlock(b)}
              onMoveUp={i > 0 ? () => reorder(i, -1) : undefined}
              onMoveDown={
                i < blocks.length - 1 ? () => reorder(i, 1) : undefined
              }
            />
          ))}
        </ul>
        {templateId && (
          <div className="mt-3 flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => addBlock(k)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-subtle bg-surface-0 px-3 py-2 text-xs text-text-primary hover:border-accent/50 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Add {k}
              </button>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        :global(.we-input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border-subtle);
          background: var(--surface-0);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        :global(.we-input:focus) {
          outline: none;
          border-color: var(--accent-base);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function BlockRow({
  block,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  block: WorkoutEditorBlock;
  onUpdate: (patch: Partial<WorkoutEditorBlock>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <li className="rounded-lg border border-border-subtle bg-surface-0 p-3">
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="rounded p-0.5 text-text-secondary hover:bg-surface-2 hover:text-white disabled:opacity-30"
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="rounded p-0.5 text-text-secondary hover:bg-surface-2 hover:text-white disabled:opacity-30"
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10px] text-text-secondary">Kind</span>
              <select
                defaultValue={block.kind}
                onChange={(e) =>
                  onUpdate({ kind: e.target.value as BlockKind })
                }
                className="we-input w-24"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1 min-w-[180px]">
              <span className="text-[10px] text-text-secondary">Name</span>
              <input
                defaultValue={block.name}
                onBlur={(e) =>
                  onUpdate({ name: e.target.value.trim() || block.name })
                }
                className="we-input"
              />
            </label>
          </div>
          {block.kind === 'exercise' && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-[10px] text-text-secondary">Sets</span>
                <input
                  type="number"
                  min="0"
                  defaultValue={block.sets ?? ''}
                  onBlur={(e) =>
                    onUpdate({
                      sets:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="we-input w-20"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-text-secondary">Reps</span>
                <input
                  defaultValue={block.reps ?? ''}
                  onBlur={(e) =>
                    onUpdate({ reps: e.target.value.trim() || null })
                  }
                  className="we-input w-28"
                  placeholder="10 / 8-10 / AMRAP"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-text-secondary">Dur (s)</span>
                <input
                  type="number"
                  min="0"
                  defaultValue={block.durationSec ?? ''}
                  onBlur={(e) =>
                    onUpdate({
                      durationSec:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="we-input w-24"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-text-secondary">Rest (s)</span>
                <input
                  type="number"
                  min="0"
                  defaultValue={block.restSec ?? ''}
                  onBlur={(e) =>
                    onUpdate({
                      restSec:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="we-input w-24"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-text-secondary">Weight</span>
                <input
                  defaultValue={block.weightHint ?? ''}
                  onBlur={(e) =>
                    onUpdate({ weightHint: e.target.value.trim() || null })
                  }
                  className="we-input w-28"
                  placeholder="BW / 70%"
                />
              </label>
            </div>
          )}
          {block.kind === 'rest' && (
            <label className="block">
              <span className="text-[10px] text-text-secondary">Duration (s)</span>
              <input
                type="number"
                min="0"
                defaultValue={block.durationSec ?? ''}
                onBlur={(e) =>
                  onUpdate({
                    durationSec:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="we-input w-24"
              />
            </label>
          )}
          <label className="block">
            <span className="text-[10px] text-text-secondary">Notes</span>
            <input
              defaultValue={block.notes ?? ''}
              onBlur={(e) =>
                onUpdate({ notes: e.target.value.trim() || null })
              }
              className="we-input"
              placeholder="optional cues"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-text-secondary hover:bg-danger/15 hover:text-danger"
          aria-label="Delete block"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
