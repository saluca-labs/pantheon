'use client';

/**
 * Research OS Phase 4 — full paper create / edit form.
 *
 * Fields: title, kind, doi, arxiv_id, url, authors_text fallback,
 * structured authors via `AuthorPicker`, venue, year, abstract_md,
 * tags. On submit:
 *   1. POST /papers — create the paper row.
 *   2. For each pending author, POST /papers/[id]/authors — link or
 *      auto-create the row. Sequential to preserve position ordering.
 *
 * No drag reorder (no @dnd-kit in repo); the picker exposes up/down
 * arrows.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, X } from 'lucide-react';
import {
  PAPER_KINDS,
  PAPER_KIND_LABELS,
  type PaperKind,
} from '@/lib/agentic-os/research/paper-kinds';
import {
  validatePaperTitle,
  validateDoi,
  validateArxivId,
  validatePaperUrl,
  validatePaperYear,
} from '@/lib/agentic-os/research/papers';
import type { Paper } from '@/lib/agentic-os/research/papers';
import { AuthorPicker, type PendingAuthor } from './author-picker';

interface Props {
  /** When present, the form is in edit mode and PATCHes the existing row. */
  initial?: Paper;
  /** Optional list of pre-existing structured authors (edit mode). */
  initialAuthors?: PendingAuthor[];
  onCancel?: () => void;
}

export function PaperForm({ initial, initialAuthors = [], onCancel }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<PaperKind>(initial?.kind ?? 'paper');
  const [doi, setDoi] = useState(initial?.doi ?? '');
  const [arxivId, setArxivId] = useState(initial?.arxivId ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [authorsText, setAuthorsText] = useState(initial?.authorsText ?? '');
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [year, setYear] = useState<string>(
    initial?.year != null ? String(initial.year) : '',
  );
  const [abstractMd, setAbstractMd] = useState(initial?.abstractMd ?? '');
  const [tagsRaw, setTagsRaw] = useState(initial?.tags.join(', ') ?? '');
  const [authors, setAuthors] = useState<PendingAuthor[]>(initialAuthors);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const titleErr = validatePaperTitle(title);
    if (titleErr) {
      setError(`Title ${titleErr}`);
      return;
    }
    const doiErr = validateDoi(doi || null);
    if (doiErr) {
      setError(`DOI ${doiErr}`);
      return;
    }
    const arxivErr = validateArxivId(arxivId || null);
    if (arxivErr) {
      setError(`arXiv ID ${arxivErr}`);
      return;
    }
    const urlErr = validatePaperUrl(url || null);
    if (urlErr) {
      setError(`URL ${urlErr}`);
      return;
    }
    let yearNum: number | null = null;
    if (year.trim()) {
      const y = Number(year);
      const yErr = validatePaperYear(y);
      if (yErr) {
        setError(`Year ${yErr}`);
        return;
      }
      yearNum = y;
    }

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        kind,
        doi: doi.trim() || null,
        arxiv_id: arxivId.trim() || null,
        url: url.trim() || null,
        authors_text: authorsText.trim() || null,
        venue: venue.trim() || null,
        year: yearNum,
        abstract_md: abstractMd || null,
        tags,
      };

      const url1 = initial
        ? `/api/tiresias/agentic-os/research/papers/${initial.id}`
        : `/api/tiresias/agentic-os/research/papers`;
      const method = initial ? 'PATCH' : 'POST';
      const res = await fetch(url1, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed (${res.status})`,
        );
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      const paperId: string = data.paper.id;

      // Link structured authors. Sequential to preserve position order
      // — failing one mid-flight surfaces the error and stops.
      if (!initial) {
        for (const p of authors) {
          const linkBody: {
            position: number;
            authorId?: string;
            displayName?: string;
            givenName?: string;
            familyName?: string;
            orcid?: string;
            affiliation?: string;
          } = { position: p.position };
          if (p.authorId) {
            linkBody.authorId = p.authorId;
          } else {
            linkBody.displayName = p.displayName;
            if (p.givenName) linkBody.givenName = p.givenName;
            if (p.familyName) linkBody.familyName = p.familyName;
            if (p.orcid) linkBody.orcid = p.orcid;
            if (p.affiliation) linkBody.affiliation = p.affiliation;
          }
          const linkRes = await fetch(
            `/api/tiresias/agentic-os/research/papers/${paperId}/authors`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(linkBody),
            },
          );
          if (!linkRes.ok) {
            const detail = await linkRes.json().catch(() => null);
            setError(
              `Linked author #${p.position} failed: ${detail?.error ?? linkRes.status}`,
            );
            setSubmitting(false);
            router.refresh();
            return;
          }
        }
      }

      router.push(`/dashboard/os/research/library/${paperId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="paper-form"
    >
      <Field label="Title *" testId="paper-form-title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
          maxLength={500}
          data-testid="paper-form-title-input"
        />
      </Field>

      <Field label="Kind" testId="paper-form-kind">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as PaperKind)}
          className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
          data-testid="paper-form-kind-select"
        >
          {PAPER_KINDS.map((k) => (
            <option key={k} value={k}>
              {PAPER_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="DOI" testId="paper-form-doi">
          <input
            type="text"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            placeholder="10.1234/abcd.5678"
            className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
            data-testid="paper-form-doi-input"
          />
        </Field>
        <Field label="arXiv ID" testId="paper-form-arxiv">
          <input
            type="text"
            value={arxivId}
            onChange={(e) => setArxivId(e.target.value)}
            placeholder="2401.12345"
            className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
            data-testid="paper-form-arxiv-input"
          />
        </Field>
      </div>

      <Field label="URL" testId="paper-form-url">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
          data-testid="paper-form-url-input"
        />
      </Field>

      <Field
        label="Authors (free-form fallback)"
        testId="paper-form-authors-text"
        hint="Used as a fallback when structured authors are empty."
      >
        <input
          type="text"
          value={authorsText}
          onChange={(e) => setAuthorsText(e.target.value)}
          placeholder="Smith, J. & Doe, A."
          className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
          data-testid="paper-form-authors-text-input"
        />
      </Field>

      {!initial && (
        <Field
          label="Structured authors"
          testId="paper-form-authors-picker"
          hint="Optional. Adds order + ORCID per author."
        >
          <AuthorPicker value={authors} onChange={setAuthors} />
        </Field>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Venue" testId="paper-form-venue">
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Journal name, conference, …"
            className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
            data-testid="paper-form-venue-input"
          />
        </Field>
        <Field label="Year" testId="paper-form-year">
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={1500}
            max={2200}
            className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
            data-testid="paper-form-year-input"
          />
        </Field>
      </div>

      <Field
        label="Abstract (markdown)"
        testId="paper-form-abstract"
        hint="Rendered server-side without rehype-raw (no HTML)."
      >
        <textarea
          value={abstractMd}
          onChange={(e) => setAbstractMd(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none font-mono"
          data-testid="paper-form-abstract-input"
        />
      </Field>

      <Field
        label="Tags (comma-separated)"
        testId="paper-form-tags"
        hint="Lower-cased, deduped on submit."
      >
        <input
          type="text"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="topology, robotics, benchmark"
          className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
          data-testid="paper-form-tags-input"
        />
      </Field>

      {error && (
        <p className="text-sm text-danger" data-testid="paper-form-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/85 disabled:opacity-60"
          data-testid="paper-form-submit"
        >
          <Save className="w-3.5 h-3.5" />
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create paper'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  hint,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  testId?: string;
}) {
  return (
    <label className="block" data-testid={testId}>
      <span className="block text-xs text-text-secondary mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-text-secondary mt-1">{hint}</span>}
    </label>
  );
}
