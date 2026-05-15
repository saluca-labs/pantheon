'use client';

/**
 * Research OS Phase 6 — single reproducibility checklist row.
 *
 * Inline state selector + evidence URL + notes; PATCHes via fetch on
 * change. Delete button removes the row (canonical items will re-seed
 * on next GET).
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useId, useState } from 'react';
import { Trash2, ExternalLink } from 'lucide-react';
import { ReproducibilityStatePill } from './reproducibility-state-pill';
import {
  REPRO_STATE_VALUES,
  REPRO_STATE_LABELS,
  reproItemKeyLabel,
  CANONICAL_REPRO_ITEM_KEYS,
  type ReproCheck,
  type ReproState,
} from '@/lib/agentic-os/research/reproducibility';

interface Props {
  experimentId: string;
  item: ReproCheck;
  onChanged?: (item: ReproCheck) => void;
  onRemoved?: (itemKey: string) => void;
}

export function ReproducibilityItemRow({
  experimentId,
  item,
  onChanged,
  onRemoved,
}: Props) {
  const [state, setState] = useState<ReproState>(item.state);
  const [evidenceUrl, setEvidenceUrl] = useState(item.evidenceUrl ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const evidenceUrlId = useId();
  const notesId = useId();

  const isCanonical = (CANONICAL_REPRO_ITEM_KEYS as readonly string[]).includes(
    item.itemKey,
  );

  async function persist(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/reproducibility/items/${encodeURIComponent(item.itemKey)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      if (r.ok) {
        const { item: updated } = await r.json();
        onChanged?.(updated);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleStateChange(next: ReproState) {
    setState(next);
    await persist({ state: next });
  }

  async function handleSave() {
    await persist({
      evidenceUrl: evidenceUrl || null,
      notes: notes || null,
    });
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this item? Canonical items re-seed on next load.')) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/research/experiments/${experimentId}/reproducibility/items/${encodeURIComponent(item.itemKey)}`,
      { method: 'DELETE' },
    );
    if (r.ok) onRemoved?.(item.itemKey);
  }

  return (
    <div
      className="rounded-lg border border-border-subtle bg-surface-2 p-3 space-y-2"
      data-testid={`repro-item-row-${item.itemKey}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-white truncate">
            {reproItemKeyLabel(item.itemKey)}
          </span>
          {!isCanonical && (
            <span className="text-[10px] uppercase tracking-wide text-text-secondary">
              custom
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ReproducibilityStatePill state={state} />
          <select
            value={state}
            onChange={(e) => handleStateChange(e.target.value as ReproState)}
            disabled={busy}
            className="bg-surface-0 border border-border-subtle rounded text-xs text-white px-2 py-1"
            data-testid={`repro-item-state-${item.itemKey}`}
          >
            {REPRO_STATE_VALUES.map((s) => (
              <option key={s} value={s}>
                {REPRO_STATE_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="text-[10px] uppercase tracking-wide text-text-secondary hover:text-white px-1.5 py-0.5"
            data-testid={`repro-item-edit-${item.itemKey}`}
          >
            {editing ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded border border-danger/40 p-1 text-danger hover:bg-danger/10"
            title="Delete item"
            data-testid={`repro-item-delete-${item.itemKey}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {item.evidenceUrl && !editing && (
        <a
          href={item.evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline truncate"
        >
          <ExternalLink className="w-3 h-3" />
          {item.evidenceUrl}
        </a>
      )}
      {item.notes && !editing && (
        <p className="text-xs text-text-primary whitespace-pre-wrap">{item.notes}</p>
      )}

      {editing && (
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <div className="space-y-1">
            <label htmlFor={evidenceUrlId} className="text-xs uppercase tracking-wide text-text-secondary">
              Evidence URL
            </label>
            <input
              id={evidenceUrlId}
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              maxLength={2000}
              placeholder="https://…"
              className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={notesId} className="text-xs uppercase tracking-wide text-text-secondary">
              Notes
            </label>
            <textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={4000}
              className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="rounded bg-accent text-white text-xs px-2 py-1 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
