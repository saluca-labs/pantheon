'use client';

/**
 * Autobiographer OS — RevisionEditor.
 *
 * Center column of the chapter detail page. Shows the active revision's
 * prose in a textarea with a live word count, and a Save button that
 * PATCHes the revision.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import { useState, useMemo } from 'react';
import { Save } from 'lucide-react';
import {
  REVISION_BODY_MAX,
  countRevisionWords,
} from '@/lib/agentic-os/autobiographer/chapter-revisions';

interface Props {
  chapterId: string;
  revisionId: string;
  /** Initial body text from the loaded revision. */
  initialBody: string;
  /** Initial summary from the loaded revision. */
  initialSummary: string | null;
  /** Whether the active revision was authored by the coach (read-only). */
  readOnly?: boolean;
}

export function RevisionEditor({
  chapterId,
  revisionId,
  initialBody,
  initialSummary,
  readOnly = false,
}: Props) {
  const [body, setBody] = useState(initialBody);
  const [summary, setSummary] = useState(initialSummary ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const wc = useMemo(() => countRevisionWords(body), [body]);
  const paraCount = useMemo(
    () => (body.trim() ? body.split(/\n\s*\n/).filter((p) => p.trim()).length : 0),
    [body],
  );
  const dirty =
    body !== initialBody || (summary || '') !== (initialSummary ?? '');

  async function onSave() {
    if (!dirty || readOnly) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/chapters/${chapterId}/revisions/${revisionId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            bodyText: body,
            summary: summary.trim() === '' ? null : summary.trim(),
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Save failed (${res.status}): ${text}`);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3 min-h-[400px]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wide text-text-secondary">
          {readOnly ? 'Revision (read-only)' : 'Active revision'}
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-text-secondary">
          <span>{wc.toLocaleString()} words</span>
          <span>{paraCount} paragraphs</span>
        </div>
      </div>

      <input
        type="text"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        disabled={readOnly}
        placeholder="Optional summary for this revision…"
        className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none disabled:opacity-60"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={readOnly}
        maxLength={REVISION_BODY_MAX}
        placeholder="Write the chapter prose here. Separate paragraphs with a blank line."
        className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none min-h-[400px] font-serif leading-relaxed disabled:opacity-60"
      />

      <div className="flex items-center justify-between">
        <div
          role="status"
          aria-live="polite"
          className="text-[11px] text-text-secondary"
        >
          {error ? (
            <span className="text-danger">{error}</span>
          ) : saved ? (
            <span className="text-positive">Saved.</span>
          ) : dirty ? (
            <span>Unsaved changes.</span>
          ) : (
            <span>No changes.</span>
          )}
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save revision'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
