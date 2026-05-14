'use client';

/**
 * Research OS Phase 3 — Polymorphic evidence link picker.
 *
 * Switches the body of the form based on `source_kind`:
 *
 *   - notebook_entry  -> picker that lists the user's recent notebook
 *                        entries (loaded via the user's experiments hub).
 *                        For Phase 3 we ship a minimal "paste the
 *                        notebook entry id" textbox; Phase 4+ may
 *                        upgrade this to a typeahead.
 *   - paper           -> "coming in Phase 4" placeholder; disabled.
 *   - dataset         -> "coming in Phase 5" placeholder; disabled.
 *   - external_url    -> URL input (required, non-empty).
 *   - free_text       -> notes textarea (required, non-empty).
 *
 * Submits to `POST /hypotheses/:id/evidence` with the matched body.
 * Honors the route-layer validation contract.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import {
  EVIDENCE_POLARITIES,
  EVIDENCE_POLARITY_LABELS,
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_SOURCE_KIND_LABELS,
  type Evidence,
  type EvidencePolarity,
  type EvidenceSourceKind,
} from '@/lib/agentic-os/research/evidence';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

interface Props {
  hypothesisId: string;
  onLinked: (e: Evidence) => void;
  onCancel?: () => void;
}

export function EvidenceLinkPicker({ hypothesisId, onLinked, onCancel }: Props) {
  const [polarity, setPolarity] = useState<EvidencePolarity>('supports');
  const [sourceKind, setSourceKind] = useState<EvidenceSourceKind>('notebook_entry');

  // Per-kind fields. We always render the matching body so paper/dataset
  // can show a graceful "coming in Phase X" placeholder.
  const [sourceId, setSourceId] = useState(''); // notebook_entry / paper / dataset
  const [sourceUrl, setSourceUrl] = useState(''); // external_url
  const [notes, setNotes] = useState(''); // free_text (required) or any kind (optional context)

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSourceId('');
    setSourceUrl('');
    setNotes('');
    setError(null);
  }

  // Per-spec: paper + dataset don't have backing tables yet (Phase 4 /
  // Phase 5). The picker shows the option but the submit button is
  // disabled because the user can't enter a valid source_id. This
  // matches the "graceful degrade" expected behaviour.
  const isComingSoon = sourceKind === 'paper' || sourceKind === 'dataset';

  // Submit-readiness — UI-side gate. The route still re-validates.
  function canSubmit(): boolean {
    if (isComingSoon) return false;
    if (sourceKind === 'external_url') return sourceUrl.trim().length > 0;
    if (sourceKind === 'free_text') return notes.trim().length > 0;
    if (sourceKind === 'notebook_entry') return sourceId.trim().length > 0;
    return false;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit()) return;
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      polarity,
      sourceKind,
    };
    if (sourceKind === 'external_url') body.sourceUrl = sourceUrl.trim();
    else if (sourceKind === 'free_text') body.notes = notes.trim();
    else if (
      sourceKind === 'notebook_entry' ||
      sourceKind === 'paper' ||
      sourceKind === 'dataset'
    ) {
      body.sourceId = sourceId.trim();
      if (notes.trim()) body.notes = notes.trim();
    }

    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/hypotheses/${hypothesisId}/evidence`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const detail = d?.detail?.fieldErrors;
        setError(
          Array.isArray(detail) && detail.length > 0
            ? detail.join(' ')
            : d.error ?? `Failed (${res.status})`,
        );
        return;
      }
      const { evidence } = await res.json();
      onLinked(evidence);
      reset();
      setSourceKind('notebook_entry');
      setPolarity('supports');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border-subtle bg-surface-0/60 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">Polarity</span>
          <select
            value={polarity}
            onChange={(e) => setPolarity(e.target.value as EvidencePolarity)}
            className={inputCls}
          >
            {EVIDENCE_POLARITIES.map((p) => (
              <option key={p} value={p}>
                {EVIDENCE_POLARITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">Source kind</span>
          <select
            value={sourceKind}
            onChange={(e) => {
              setSourceKind(e.target.value as EvidenceSourceKind);
              reset();
            }}
            className={inputCls}
          >
            {EVIDENCE_SOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVIDENCE_SOURCE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Polymorphic body */}
      {sourceKind === 'notebook_entry' && (
        <>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
              Notebook entry ID
            </span>
            <input
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              placeholder="UUID of an agos_research_notebook_entries row"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
        </>
      )}

      {sourceKind === 'paper' && (
        <div className="rounded-md border border-dashed border-border-subtle bg-surface-0 p-3 text-xs text-text-secondary">
          The literature library ships in <span className="text-white font-medium">Phase 4</span>.
          For now, use{' '}
          <button
            type="button"
            onClick={() => setSourceKind('external_url')}
            className="text-accent hover:underline"
          >
            External URL
          </button>{' '}
          to link a paper by its DOI or arXiv URL, or{' '}
          <button
            type="button"
            onClick={() => setSourceKind('free_text')}
            className="text-accent hover:underline"
          >
            Free text
          </button>{' '}
          to capture a citation as prose.
        </div>
      )}

      {sourceKind === 'dataset' && (
        <div className="rounded-md border border-dashed border-border-subtle bg-surface-0 p-3 text-xs text-text-secondary">
          The dataset library ships in <span className="text-white font-medium">Phase 5</span>.
          For now, use{' '}
          <button
            type="button"
            onClick={() => setSourceKind('external_url')}
            className="text-accent hover:underline"
          >
            External URL
          </button>{' '}
          to link the dataset where it lives.
        </div>
      )}

      {sourceKind === 'external_url' && (
        <>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">URL</span>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
        </>
      )}

      {sourceKind === 'free_text' && (
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="The evidence in prose — e.g. a citation, an observation log entry, a reasoning chain."
            rows={3}
            className={inputCls}
          />
        </label>
      )}

      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !canSubmit()}
          className="rounded-md bg-accent hover:bg-[#3a56d4] disabled:opacity-50 px-3 py-1.5 text-sm text-white transition"
        >
          {saving ? 'Linking…' : 'Link evidence'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-sm text-text-secondary hover:text-white transition"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
