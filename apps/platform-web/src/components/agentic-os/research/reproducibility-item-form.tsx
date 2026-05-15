'use client';

/**
 * Research OS Phase 6 — add custom reproducibility item.
 *
 * POSTs a new item_key (regex-validated client-side; route re-validates).
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { useId, useState } from 'react';
import type { ReproCheck } from '@/lib/agentic-os/research/reproducibility';

interface Props {
  experimentId: string;
  onCreated?: (item: ReproCheck) => void;
  onCancel?: () => void;
}

const ITEM_KEY_PATTERN = /^[a-z0-9_]+$/;

export function ReproducibilityItemForm({
  experimentId,
  onCreated,
  onCancel,
}: Props) {
  const [itemKey, setItemKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const itemKeyId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ITEM_KEY_PATTERN.test(itemKey)) {
      setError('item_key must match ^[a-z0-9_]+$ (lowercase, digits, underscores).');
      return;
    }
    if (itemKey.length > 60) {
      setError('item_key must be at most 60 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/reproducibility`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemKey }),
        },
      );
      if (r.status === 409) {
        setError('Item already exists.');
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? `Failed (${r.status})`);
        return;
      }
      const { item } = await r.json();
      onCreated?.(item);
      setItemKey('');
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle bg-surface-2 p-3"
      data-testid="repro-item-form"
    >
      <div className="space-y-1 flex-1 min-w-0">
        <label htmlFor={itemKeyId} className="text-xs uppercase tracking-wide text-text-secondary">
          New item_key
        </label>
        <input
          id={itemKeyId}
          type="text"
          value={itemKey}
          onChange={(e) => setItemKey(e.target.value)}
          maxLength={60}
          placeholder="e.g. compute_environment_pinned"
          className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1.5 text-sm text-white font-mono"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || itemKey.length === 0}
        className="rounded bg-accent text-white text-sm font-medium px-3 py-1.5 disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add'}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border-subtle text-text-secondary hover:text-white text-sm px-3 py-1.5"
        >
          Cancel
        </button>
      )}
      {error && (
        <p className="basis-full text-xs text-danger" data-testid="repro-item-form-error">
          {error}
        </p>
      )}
    </form>
  );
}
