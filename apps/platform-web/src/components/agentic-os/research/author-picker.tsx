'use client';

/**
 * Research OS Phase 4 — author picker.
 *
 * Multi-step affordance used inside the paper-form:
 *
 *   1. Type-ahead search across workshop-global authors (GET /authors?q=).
 *   2. Existing rows surface as clickable rows; click to add to the
 *      pending list.
 *   3. If no match, a "Create new author" affordance opens an inline
 *      mini-form (display name + given/family/orcid/affiliation).
 *
 * The component maintains an ordered list of selected authors. The
 * parent reads `value` (list of { authorId? | inline new-author fields,
 * position }) at submit time and POSTs each in order. The picker itself
 * does NOT issue links — the parent paper-form does after the paper is
 * created.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { useEffect, useRef, useState } from 'react';
import { Search, Plus, X, GripVertical } from 'lucide-react';
import type { Author } from '@/lib/agentic-os/research/authors';
import { validateOrcid, validateDisplayName } from '@/lib/agentic-os/research/authors';

export interface PendingAuthor {
  /** Either an existing author id… */
  authorId?: string;
  /** …or the fields needed to auto-create one. */
  displayName?: string;
  givenName?: string;
  familyName?: string;
  orcid?: string;
  affiliation?: string;
  /** Optional pre-existing author object for chip display. */
  resolved?: Author;
  /** 1-indexed position computed by the picker. */
  position: number;
}

interface Props {
  value: PendingAuthor[];
  onChange: (next: PendingAuthor[]) => void;
}

export function AuthorPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Author[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<PendingAuthor>>({});
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/tiresias/agentic-os/research/authors?q=${encodeURIComponent(search.trim())}&limit=20`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
        .then((data) => setResults(Array.isArray(data.authors) ? data.authors : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  function addExisting(author: Author) {
    if (value.some((p) => p.authorId === author.id)) return;
    const next = [
      ...value,
      { authorId: author.id, resolved: author, position: value.length + 1 } as PendingAuthor,
    ];
    onChange(next);
    setSearch('');
    setResults([]);
  }

  function addNew() {
    const nameErr = validateDisplayName(draft.displayName);
    if (nameErr) {
      setError(`Display name ${nameErr}`);
      return;
    }
    const orcidErr = validateOrcid(draft.orcid ?? null);
    if (orcidErr) {
      setError(`ORCID ${orcidErr}`);
      return;
    }
    setError(null);
    const next = [
      ...value,
      {
        displayName: draft.displayName!.trim(),
        givenName: draft.givenName?.trim() || undefined,
        familyName: draft.familyName?.trim() || undefined,
        orcid: draft.orcid?.trim() || undefined,
        affiliation: draft.affiliation?.trim() || undefined,
        position: value.length + 1,
      } as PendingAuthor,
    ];
    onChange(next);
    setDraft({});
    setCreating(false);
  }

  function removeAt(index: number) {
    const next = value
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, position: i + 1 }));
    onChange(next);
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next.map((p, i) => ({ ...p, position: i + 1 })));
  }

  function moveDown(index: number) {
    if (index >= value.length - 1) return;
    const next = [...value];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    onChange(next.map((p, i) => ({ ...p, position: i + 1 })));
  }

  return (
    <div className="space-y-3" data-testid="author-picker">
      {/* Selected list */}
      {value.length > 0 && (
        <ol className="space-y-1" data-testid="author-picker-selected">
          {value.map((p, i) => (
            <li
              key={p.authorId ?? `new-${i}`}
              className="flex items-center gap-2 px-2 py-1 rounded bg-surface-0 border border-border-subtle"
              data-testid={`author-picker-row-${i}`}
            >
              <span className="text-[10px] text-text-secondary w-5">{p.position}</span>
              <GripVertical className="w-3 h-3 text-text-secondary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {p.resolved?.displayName ?? p.displayName}
                </p>
                {(p.resolved?.affiliation || p.affiliation) && (
                  <p className="text-[10px] text-text-secondary truncate">
                    {p.resolved?.affiliation ?? p.affiliation}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="text-xs text-text-secondary hover:text-white disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === value.length - 1}
                className="text-xs text-text-secondary hover:text-white disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="text-text-secondary hover:text-rose-300"
                aria-label="Remove"
                data-testid={`author-picker-remove-${i}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search authors by name…"
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-0 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
          data-testid="author-picker-search"
        />
      </div>

      {loading && (
        <p className="text-xs text-text-secondary" data-testid="author-picker-loading">
          Searching…
        </p>
      )}

      {results.length > 0 && (
        <ul className="rounded-lg border border-border-subtle bg-surface-0 overflow-hidden divide-y divide-border-subtle max-h-60 overflow-y-auto" data-testid="author-picker-results">
          {results.map((a) => (
            <li
              key={a.id}
              className="px-3 py-2 hover:bg-surface-2 cursor-pointer flex items-center justify-between"
              onClick={() => addExisting(a)}
              data-testid={`author-picker-result-${a.id}`}
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{a.displayName}</p>
                {(a.affiliation || a.orcid) && (
                  <p className="text-[10px] text-text-secondary truncate">
                    {a.affiliation || a.orcid}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-accent">Add</span>
            </li>
          ))}
        </ul>
      )}

      {/* Create-new affordance */}
      {!creating && (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setDraft({ displayName: search.trim() || '' });
          }}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          data-testid="author-picker-create-toggle"
        >
          <Plus className="w-3 h-3" />
          Create new author
        </button>
      )}

      {creating && (
        <div
          className="rounded-lg border border-accent/40 bg-surface-0 p-3 space-y-2"
          data-testid="author-picker-create-form"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <LabeledInput
              label="Display name *"
              value={draft.displayName ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, displayName: v }))}
              testId="author-picker-create-display-name"
            />
            <LabeledInput
              label="ORCID"
              value={draft.orcid ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, orcid: v }))}
              placeholder="0000-0000-0000-0000"
              testId="author-picker-create-orcid"
            />
            <LabeledInput
              label="Given name"
              value={draft.givenName ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, givenName: v }))}
              testId="author-picker-create-given-name"
            />
            <LabeledInput
              label="Family name"
              value={draft.familyName ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, familyName: v }))}
              testId="author-picker-create-family-name"
            />
            <LabeledInput
              label="Affiliation"
              value={draft.affiliation ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, affiliation: v }))}
              testId="author-picker-create-affiliation"
            />
          </div>
          {error && (
            <p className="text-xs text-rose-300" data-testid="author-picker-create-error">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setDraft({});
                setError(null);
              }}
              className="text-xs text-text-secondary hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addNew}
              className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent/85"
              data-testid="author-picker-create-confirm"
            >
              Add author
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] text-text-secondary uppercase tracking-wide mb-0.5">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-sm text-white focus:border-accent/60 outline-none"
        data-testid={testId}
      />
    </label>
  );
}
