'use client';

/**
 * Research OS Phase 6 — reproducibility checklist tab.
 *
 * Groups items by state, renders the score badge in the header, and
 * exposes an inline "Add custom item" form.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { ReproducibilityItemRow } from './reproducibility-item-row';
import { ReproducibilityItemForm } from './reproducibility-item-form';
import { ReproducibilityScoreBadge } from './reproducibility-score-badge';
import {
  REPRO_STATE_VALUES,
  REPRO_STATE_LABELS,
  computeReproRollup,
  type ReproCheck,
  type ReproState,
} from '@/lib/agentic-os/research/reproducibility';

interface Props {
  experimentId: string;
  initialItems: ReproCheck[];
}

export function ReproducibilityChecklist({ experimentId, initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [showAdd, setShowAdd] = useState(false);

  const rollup = computeReproRollup(items);

  const refresh = useCallback(async () => {
    const r = await fetch(
      `/api/tiresias/agentic-os/research/experiments/${experimentId}/reproducibility`,
    );
    if (r.ok) {
      const { items: latest } = await r.json();
      setItems(latest ?? []);
    }
  }, [experimentId]);

  function handleItemChanged(updated: ReproCheck) {
    setItems((prev) => prev.map((i) => (i.itemKey === updated.itemKey ? updated : i)));
  }

  function handleItemRemoved(itemKey: string) {
    setItems((prev) => prev.filter((i) => i.itemKey !== itemKey));
  }

  // Group items by state.
  const grouped = new Map<ReproState, ReproCheck[]>();
  for (const s of REPRO_STATE_VALUES) grouped.set(s, []);
  for (const i of items) {
    const list = grouped.get(i.state) ?? [];
    list.push(i);
    grouped.set(i.state, list);
  }

  return (
    <div className="space-y-4" data-testid="reproducibility-checklist">
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
              Reproducibility
            </h3>
            <ReproducibilityScoreBadge score={rollup.score} size="md" />
          </div>
          <p className="text-xs text-text-secondary">
            {rollup.done} done · {rollup.inProgress} in progress · {rollup.pending} pending
            {(rollup.notApplicable > 0 || rollup.waived > 0) && (
              <span>
                {' '}· {rollup.notApplicable + rollup.waived} excluded
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          Score = done / (pending + in_progress + done). Not applicable + waived
          are excluded from the denominator.
        </p>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded border border-border-subtle text-sm text-white px-2 py-1 hover:bg-surface-2"
            data-testid="repro-add-button"
          >
            <Plus className="w-4 h-4" />
            Add custom item
          </button>
        )}
      </div>

      {showAdd && (
        <ReproducibilityItemForm
          experimentId={experimentId}
          onCreated={async () => {
            await refresh();
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {REPRO_STATE_VALUES.map((s) => {
        const group = grouped.get(s) ?? [];
        if (group.length === 0) return null;
        return (
          <section key={s} data-testid={`repro-group-${s}`}>
            <h4 className="text-[10px] uppercase tracking-wide text-text-secondary mb-2">
              {REPRO_STATE_LABELS[s]} ({group.length})
            </h4>
            <ul className="space-y-2">
              {group.map((i) => (
                <li key={i.itemKey}>
                  <ReproducibilityItemRow
                    experimentId={experimentId}
                    item={i}
                    onChanged={handleItemChanged}
                    onRemoved={handleItemRemoved}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {items.length === 0 && !showAdd && (
        <p
          className="text-sm text-text-secondary italic py-6 text-center"
          data-testid="repro-checklist-empty"
        >
          No reproducibility items yet.
        </p>
      )}
    </div>
  );
}
