'use client';

/**
 * Filmmaker OS — SceneBreakdownEditor.
 *
 * Per-scene editor surfaced inside the breakdown page. Shows
 * category-grouped element rows + a per-scene meta editor (eighths,
 * complexity, status, est minutes, notes).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil } from 'lucide-react';
import {
  BREAKDOWN_CATEGORIES,
  SCENE_COMPLEXITIES,
  SCENE_STATUSES,
  type BreakdownCategory,
  type BreakdownElement,
  type SceneBreakdownMeta,
  type SceneComplexity,
  type SceneStatus,
  pagesLabel,
} from '@/lib/agentic-os/filmmaker/breakdown';
import type { ScreenplayScene } from '@/lib/agentic-os/filmmaker/screenplays';
import { BreakdownElementForm } from './BreakdownElementForm';

interface Props {
  scene: ScreenplayScene;
  initialElements: BreakdownElement[];
  initialMeta: SceneBreakdownMeta | null;
}

export function SceneBreakdownEditor({
  scene,
  initialElements,
  initialMeta,
}: Props) {
  const router = useRouter();
  const [elements, setElements] = useState(initialElements);
  const [meta, setMeta] = useState(initialMeta);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => setElements(initialElements), [initialElements]);
  useEffect(() => setMeta(initialMeta), [initialMeta]);

  async function deleteElement(id: string) {
    if (!confirm('Delete this element?')) return;
    const res = await fetch(`/api/tiresias/agentic-os/filmmaker/breakdown-elements/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setElements((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
    }
  }

  async function patchMeta(patch: Partial<SceneBreakdownMeta>) {
    const res = await fetch(
      `/api/tiresias/agentic-os/filmmaker/scenes/${scene.id}/breakdown-meta`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    if (res.ok) {
      const j = await res.json();
      setMeta(j.meta);
      router.refresh();
    }
  }

  const byCategory = new Map<BreakdownCategory, BreakdownElement[]>();
  for (const e of elements) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category)!.push(e);
  }

  return (
    <div className="space-y-4 p-4 border-t border-border-subtle bg-surface-0">
      {/* Meta editor */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary">Eighths</span>
          <input
            type="number"
            min={0}
            max={2000}
            value={meta?.eighths ?? 0}
            onChange={(e) =>
              patchMeta({ eighths: Math.max(0, Number(e.target.value) || 0) })
            }
            className="text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary"
          />
          <span className="text-[10px] text-text-tertiary">
            {pagesLabel(meta?.eighths ?? 0)} pages
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary">Est. minutes</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={meta?.estShootMinutes ?? ''}
            onChange={(e) =>
              patchMeta({
                estShootMinutes: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className="text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary"
            placeholder="—"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary">Complexity</span>
          <select
            value={meta?.complexity ?? ''}
            onChange={(e) =>
              patchMeta({
                complexity: (e.target.value || null) as SceneComplexity | null,
              })
            }
            className="text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary"
          >
            <option value="">—</option>
            {SCENE_COMPLEXITIES.map((c) => (
              <option key={c.complexity} value={c.complexity}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-secondary">Status</span>
          <select
            value={meta?.status ?? 'unscheduled'}
            onChange={(e) => patchMeta({ status: e.target.value as SceneStatus })}
            className="text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary"
          >
            {SCENE_STATUSES.map((s) => (
              <option key={s.status} value={s.status}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-text-secondary">Production notes</span>
        <textarea
          value={meta?.notes ?? ''}
          onChange={(e) => patchMeta({ notes: e.target.value || null })}
          rows={2}
          className="text-xs bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-text-primary"
          placeholder="Notes for the AD / line producer..."
        />
      </label>

      {/* Category groups */}
      <div className="space-y-3">
        {BREAKDOWN_CATEGORIES.filter((c) => byCategory.has(c.category)).map((c) => (
          <div key={c.category}>
            <h4 className={`text-[11px] uppercase tracking-wide font-semibold mb-1.5 inline-block px-2 py-0.5 rounded border ${c.color}`}>
              {c.label} <span className="text-[10px] opacity-70">({byCategory.get(c.category)!.length})</span>
            </h4>
            <ul className="space-y-1">
              {byCategory.get(c.category)!.map((el) =>
                editingId === el.id ? (
                  <li key={el.id}>
                    <BreakdownElementForm
                      sceneId={scene.id}
                      initial={el}
                      onSaved={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <li
                    key={el.id}
                    className="flex items-start justify-between gap-2 text-xs p-2 rounded bg-surface-2 border border-border-subtle"
                  >
                    <div className="min-w-0">
                      <p className="text-text-primary">
                        {el.name}
                        {el.quantity > 1 && (
                          <span className="text-text-secondary ml-1">× {el.quantity}</span>
                        )}
                        {el.isPrincipal && (
                          <span className="ml-2 text-[10px] px-1 py-0.5 rounded border border-positive/30 text-positive bg-positive/10">
                            principal
                          </span>
                        )}
                      </p>
                      {el.description && (
                        <p className="text-text-secondary mt-0.5">{el.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingId(el.id)}
                        className="text-text-secondary hover:text-white p-1"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteElement(el.id)}
                        className="text-text-secondary hover:text-danger p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
        {elements.length === 0 && !adding && (
          <p className="text-xs text-text-tertiary italic">No elements tagged yet.</p>
        )}
      </div>

      {/* Add element */}
      {adding ? (
        <BreakdownElementForm
          sceneId={scene.id}
          onSaved={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-2 text-text-primary hover:border-accent/60 hover:text-white"
        >
          <Plus className="w-3 h-3" /> Add element
        </button>
      )}
    </div>
  );
}
