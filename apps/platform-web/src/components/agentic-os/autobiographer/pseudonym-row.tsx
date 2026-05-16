'use client';

/**
 * Autobiographer OS — PseudonymRow.
 *
 * One person → one pseudonym editor row. Used inside `PseudonymMapPanel`
 * to render an existing pseudonym (with edit / clear affordances) or
 * an empty slot for a person who has no pseudonym yet (with create).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Save, Trash2, UserCircle2 } from 'lucide-react';
import { ConsentBadge } from './consent-badge';
import type { ConsentState } from '@/lib/agentic-os/autobiographer/people';

export interface PseudonymRowProps {
  bookId: string;
  personId: string;
  personCanonicalName: string;
  personAliases: readonly string[];
  consentState: ConsentState;
  pseudonymId: string | null;
  initialPseudonym: string;
  initialNotes: string | null;
  applied: boolean;
}

export function PseudonymRow({
  bookId,
  personId,
  personCanonicalName,
  personAliases,
  consentState,
  pseudonymId,
  initialPseudonym,
  initialNotes,
  applied,
}: PseudonymRowProps) {
  const router = useRouter();
  const [pseudonym, setPseudonym] = useState(initialPseudonym);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    pseudonym !== initialPseudonym || (notes ?? '') !== (initialNotes ?? '');
  const canSave = pseudonym.trim().length > 0 && isDirty && !busy;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const url = pseudonymId
        ? `/api/tiresias/agentic-os/autobiographer/pseudonyms/${pseudonymId}`
        : `/api/tiresias/agentic-os/autobiographer/books/${bookId}/pseudonyms`;
      const method = pseudonymId ? 'PATCH' : 'POST';
      const body = pseudonymId
        ? { pseudonym: pseudonym.trim(), notes: notes.trim() || null }
        : {
            personId,
            pseudonym: pseudonym.trim(),
            notes: notes.trim() || null,
          };
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save pseudonym');
    } finally {
      setBusy(false);
    }
  }

  async function clearRow() {
    if (!pseudonymId) {
      setPseudonym('');
      setNotes('');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/pseudonyms/${pseudonymId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      setPseudonym('');
      setNotes('');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to clear pseudonym');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 flex-wrap">
            <UserCircle2 className="w-4 h-4 text-text-secondary shrink-0" />
            <span className="font-medium text-white text-sm">
              {personCanonicalName}
            </span>
            <ConsentBadge state={consentState} />
            {applied && (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-positive uppercase tracking-wide"
                title="This pseudonym has been substituted in at least one PDF export."
              >
                <CheckCircle2 className="w-3 h-3" />
                Applied
              </span>
            )}
          </div>
          {personAliases.length > 0 && (
            <p className="text-xs text-text-tertiary mt-0.5 ml-6">
              also: {personAliases.join(', ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={pseudonym}
          onChange={(e) => setPseudonym(e.target.value)}
          placeholder="Pseudonym (replacement name)"
          disabled={busy}
          className="flex-1 min-w-[180px] bg-surface-2 border border-border-subtle rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border-subtle bg-surface-2 text-text-primary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
        {(pseudonymId || pseudonym.length > 0) && (
          <button
            type="button"
            onClick={clearRow}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional — context, source agreement, etc.)"
        rows={2}
        disabled={busy}
        className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
      />

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}
