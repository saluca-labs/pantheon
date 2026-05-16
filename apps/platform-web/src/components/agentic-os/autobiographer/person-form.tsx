'use client';

/**
 * Autobiographer OS — PersonForm.
 *
 * Create-and-edit modal for a person. Phase 2 surfaces every column the
 * migration plants: canonical name, aliases (one per line), relation,
 * birth/death years, consent state + attribution, notes, and image URL.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  CONSENT_STATES,
  CONSENT_LABELS,
  type ConsentState,
} from '@/lib/agentic-os/autobiographer/people';

export interface PersonFormInitial {
  id?: string;
  canonicalName?: string;
  aliases?: string[];
  relation?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  consentToPublish?: ConsentState;
  consentRecordedBy?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
}

export interface PersonFormProps {
  open: boolean;
  onClose: () => void;
  initial?: PersonFormInitial;
}

export function PersonForm({ open, onClose, initial }: PersonFormProps) {
  const router = useRouter();
  const [canonicalName, setCanonicalName] = useState(
    initial?.canonicalName ?? '',
  );
  const [aliasesInput, setAliasesInput] = useState(
    (initial?.aliases ?? []).join('\n'),
  );
  const [relation, setRelation] = useState(initial?.relation ?? '');
  const [birthYear, setBirthYear] = useState(
    initial?.birthYear != null ? String(initial.birthYear) : '',
  );
  const [deathYear, setDeathYear] = useState(
    initial?.deathYear != null ? String(initial.deathYear) : '',
  );
  const [consentToPublish, setConsentToPublish] = useState<ConsentState>(
    initial?.consentToPublish ?? 'pending',
  );
  const [consentRecordedBy, setConsentRecordedBy] = useState(
    initial?.consentRecordedBy ?? '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isEdit = Boolean(initial?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const aliases = aliasesInput
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        canonicalName: canonicalName.trim(),
        aliases,
        relation: relation.trim() || null,
        birthYear: birthYear.trim() ? Number(birthYear) : null,
        deathYear: deathYear.trim() ? Number(deathYear) : null,
        consentToPublish,
        consentRecordedBy: consentRecordedBy.trim() || null,
        notes: notes.trim() || null,
        imageUrl: imageUrl.trim() || null,
      };
      const url = isEdit
        ? `/api/tiresias/agentic-os/autobiographer/people/${initial!.id}`
        : '/api/tiresias/agentic-os/autobiographer/people';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status} ${res.statusText}`);
      }
      onClose();
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save person');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit person' : 'New person'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
    >
      {/* Backdrop — rendered as a button so keyboard users can dismiss
          via Enter / Space without an inline a11y disable. */}
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="relative w-full max-w-2xl bg-surface-2 rounded-xl border border-border-subtle p-5 space-y-4 my-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit person' : 'New person'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Canonical name<span className="text-red-400">*</span>
          </span>
          <input
            value={canonicalName}
            onChange={(e) => setCanonicalName(e.target.value)}
            required
            maxLength={500}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder='e.g. "Maria del Carmen Ruvalcaba"'
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Aliases{' '}
            <span className="text-[#64748b] normal-case">(one per line)</span>
          </span>
          <textarea
            value={aliasesInput}
            onChange={(e) => setAliasesInput(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder={'Mom\nMother\nMa'}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Relation
            </span>
            <input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              maxLength={200}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder='e.g. "mother", "mentor", "colleague"'
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Image URL
            </span>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              maxLength={2000}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder="https://… (MCP-mediated storage transfer)"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Birth year
            </span>
            <input
              type="number"
              min={1}
              max={9999}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder="e.g. 1942"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Death year
            </span>
            <input
              type="number"
              min={1}
              max={9999}
              value={deathYear}
              onChange={(e) => setDeathYear(e.target.value)}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder="Leave blank if living"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Consent to publish
            </span>
            <select
              value={consentToPublish}
              onChange={(e) =>
                setConsentToPublish(e.target.value as ConsentState)
              }
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              {CONSENT_STATES.map((s) => (
                <option key={s} value={s}>
                  {CONSENT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text-secondary">
              Consent recorded by
            </span>
            <input
              value={consentRecordedBy}
              onChange={(e) => setConsentRecordedBy(e.target.value)}
              maxLength={500}
              className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder='e.g. "verbal, 2026-04-12"'
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={5000}
            className="mt-1 w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="Anything else worth remembering about this person."
          />
        </label>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-border-subtle text-text-primary hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !canonicalName.trim()}
            className="text-sm px-4 py-1.5 rounded bg-accent text-white font-medium disabled:opacity-50 hover:bg-[#3a52d8] transition"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save' : 'Add person'}
          </button>
        </div>
      </form>
    </div>
  );
}
