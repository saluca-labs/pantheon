'use client';

/**
 * Research OS Phase 6 + Wave D — reproducibility checklist UI.
 *
 * Wave D specialization: the Phase 6 surface grouped items by raw state;
 * this is a proper *checklist UI*:
 *
 *  - A progress header — the score badge plus a done / scored progress
 *    bar, so "how reproducible is this experiment" reads at a glance.
 *  - Three intent-ordered sections (`buildReproChecklistSections`):
 *    **Outstanding** (pending + in-progress — what moves the score) first,
 *    then **Done**, then a collapsed **Excluded** (not-applicable / waived).
 *  - Each row is the existing `ReproducibilityItemRow` — inline state
 *    select, evidence URL, notes, delete — unchanged, so no edit
 *    capability is lost.
 *  - The "Add custom item" form is preserved.
 *
 * Data + the PATCH/POST/DELETE API surface are unchanged.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { ReproducibilityItemRow } from './reproducibility-item-row';
import { ReproducibilityItemForm } from './reproducibility-item-form';
import { ReproducibilityScoreBadge } from './reproducibility-score-badge';
import {
  computeReproRollup,
  type ReproCheck,
} from '@/lib/agentic-os/research/reproducibility';
import {
  buildReproChecklistSections,
  reproChecklistProgress,
} from '@/lib/agentic-os/research/reproducibility-checklist-view';

interface Props {
  experimentId: string;
  initialItems: ReproCheck[];
}

export function ReproducibilityChecklist({ experimentId, initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [showAdd, setShowAdd] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const rollup = computeReproRollup(items);
  const progress = reproChecklistProgress(items);
  const sections = buildReproChecklistSections(items);

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

  return (
    <div className="space-y-4" data-testid="reproducibility-checklist">
      {/* Progress header — score badge + done/scored progress bar. */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
              Reproducibility
            </h3>
            <ReproducibilityScoreBadge score={rollup.score} size="md" />
          </div>
          <p className="text-xs text-text-secondary" data-testid="repro-checklist-counts">
            {rollup.done} done · {rollup.inProgress} in progress · {rollup.pending} pending
            {(rollup.notApplicable > 0 || rollup.waived > 0) && (
              <span> · {rollup.notApplicable + rollup.waived} excluded</span>
            )}
          </p>
        </div>
        <div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-surface-0"
            role="progressbar"
            aria-valuenow={Math.round(progress.fraction * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="repro-checklist-progress"
          >
            <div
              className="h-full rounded-full bg-os-research transition-all"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-text-tertiary">
            {progress.done} of {progress.scoredTotal} scored items done. Score =
            done / (pending + in_progress + done); not applicable + waived are
            excluded from the denominator.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end">
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

      {items.length === 0 && !showAdd ? (
        <p
          className="text-sm text-text-secondary italic py-6 text-center"
          data-testid="repro-checklist-empty"
        >
          No reproducibility items yet.
        </p>
      ) : (
        sections.map((section) => {
          // The Excluded section is collapsed behind a toggle to keep the
          // checklist focused on actionable work.
          if (section.key === 'excluded') {
            if (section.items.length === 0) return null;
            return (
              <section key={section.key} data-testid={`repro-section-${section.key}`}>
                <button
                  type="button"
                  onClick={() => setShowExcluded((v) => !v)}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-secondary hover:text-white mb-2"
                  data-testid="repro-section-excluded-toggle"
                >
                  {section.label} ({section.items.length})
                  <span className="text-text-tertiary">
                    {showExcluded ? 'Hide' : 'Show'}
                  </span>
                </button>
                {showExcluded && (
                  <ul className="space-y-2">
                    {section.items.map((i) => (
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
                )}
              </section>
            );
          }

          return (
            <section key={section.key} data-testid={`repro-section-${section.key}`}>
              <div className="mb-2">
                <h4 className="text-[10px] uppercase tracking-wide text-text-secondary">
                  {section.label} ({section.items.length})
                </h4>
                <p className="text-[10px] text-text-tertiary">{section.hint}</p>
              </div>
              {section.items.length === 0 ? (
                <p
                  className="text-xs text-text-tertiary italic py-2"
                  data-testid={`repro-section-${section.key}-empty`}
                >
                  {section.key === 'outstanding'
                    ? 'Nothing outstanding — every scored item is done.'
                    : 'Nothing here yet.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {section.items.map((i) => (
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
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
