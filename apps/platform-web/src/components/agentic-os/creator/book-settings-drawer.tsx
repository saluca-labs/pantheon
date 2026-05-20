'use client';

/**
 * Creator OS — Book settings drawer.
 *
 * Slide-in panel from the right side with two tabs:
 *   1. "Book details" — shared publishing metadata (subtitle, author
 *      display name, copyright year, language, dedication, series, etc.)
 *   2. "Publishing targets" — per-(platform × format) rows for KDP
 *      paperback / KDP ebook / Lulu / IngramSpark / generic ePub.
 *      Each target carries trim size, ISBN, BISAC codes, list price.
 *
 * Save model: optimistic PATCH on blur for the book-details fields;
 * publishing targets are explicit save buttons (the row is dirty
 * enough that we surface validation before persisting).
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { useState, useCallback } from 'react';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import type { CreatorBook } from '@/lib/agentic-os/creator/books';
import type {
  PublishingTarget,
  PublishingPlatform,
  PublishingFormat,
  PublishingTargetStatus,
} from '@/lib/agentic-os/creator/publishing-targets';
import {
  PUBLISHING_PLATFORMS,
  PUBLISHING_FORMATS,
  PUBLISHING_TARGET_STATUSES,
  isValidIsbn13,
} from '@/lib/agentic-os/creator/publishing-targets';
import { BISAC_CODES } from '@/lib/agentic-os/creator/bisac-codes';

interface BookSettingsDrawerProps {
  book: CreatorBook;
  targets: PublishingTarget[];
  onBookChange: (book: CreatorBook) => void;
  onTargetsChange: (targets: PublishingTarget[]) => void;
  onClose: () => void;
}

const PLATFORM_LABELS: Record<PublishingPlatform, string> = {
  kdp_paperback: 'KDP Paperback',
  kdp_ebook: 'KDP Ebook (Kindle)',
  lulu_paperback: 'Lulu Paperback',
  ingramspark_paperback: 'IngramSpark Paperback',
  generic_epub: 'Generic ePub',
};

const FORMAT_LABELS: Record<PublishingFormat, string> = {
  paperback: 'Paperback',
  hardcover: 'Hardcover',
  ebook: 'Ebook',
};

const STATUS_LABELS: Record<PublishingTargetStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  uploaded: 'Uploaded',
  published: 'Published',
};

const COMMON_TRIM_SIZES = [
  '5x8',
  '5.06x7.81',
  '5.25x8',
  '5.5x8.5',
  '6x9',
  '7x10',
  '8x10',
  '8.5x11',
];

export function BookSettingsDrawer({
  book,
  targets,
  onBookChange,
  onTargetsChange,
  onClose,
}: BookSettingsDrawerProps) {
  const [tab, setTab] = useState<'details' | 'targets'>('details');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Book settings"
      className="fixed inset-0 z-50 flex justify-end"
    >
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative h-full w-full max-w-xl bg-surface-2 border-l border-border-subtle flex flex-col"
      >
        {/* Header + tabs */}
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-semibold text-white">Book settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border-subtle px-5 mt-3">
          <TabButton active={tab === 'details'} onClick={() => setTab('details')}>
            Book details
          </TabButton>
          <TabButton active={tab === 'targets'} onClick={() => setTab('targets')}>
            Publishing targets
            {targets.length > 0 && (
              <span className="ml-1.5 text-[10px] text-text-tertiary">
                ({targets.length})
              </span>
            )}
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'details' ? (
            <BookDetailsTab book={book} onBookChange={onBookChange} />
          ) : (
            <PublishingTargetsTab
              book={book}
              targets={targets}
              onTargetsChange={onTargetsChange}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? 'border-accent text-white'
          : 'border-transparent text-text-secondary hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Tab 1: Book details ────────────────────────────────────────────────────

function BookDetailsTab({
  book,
  onBookChange,
}: {
  book: CreatorBook;
  onBookChange: (book: CreatorBook) => void;
}) {
  const [local, setLocal] = useState(book);

  const patchBook = useCallback(
    async (patch: Partial<CreatorBook>) => {
      const body = serializeBookPatch(patch);
      if (Object.keys(body).length === 0) return;
      const r = await fetch(
        `/api/tiresias/agentic-os/creator/books/${book.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (r.ok) {
        const updated = (await r.json()) as CreatorBook;
        onBookChange(updated);
        setLocal(updated);
      }
    },
    [book.id, onBookChange],
  );

  return (
    <div className="space-y-4">
      <Field label="Subtitle">
        <input
          value={local.subtitle ?? ''}
          onChange={(e) => setLocal({ ...local, subtitle: e.target.value })}
          onBlur={() => patchBook({ subtitle: local.subtitle || null })}
          maxLength={500}
          className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
          placeholder="Optional subtitle"
        />
      </Field>

      <Field label="Author display name">
        <input
          value={local.authorDisplayName ?? ''}
          onChange={(e) =>
            setLocal({ ...local, authorDisplayName: e.target.value })
          }
          onBlur={() =>
            patchBook({ authorDisplayName: local.authorDisplayName || null })
          }
          maxLength={200}
          className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
          placeholder="Name as it appears on the book cover"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Copyright year">
          <input
            type="number"
            min={1000}
            max={9999}
            value={local.copyrightYear ?? ''}
            onChange={(e) =>
              setLocal({
                ...local,
                copyrightYear: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            onBlur={() => patchBook({ copyrightYear: local.copyrightYear })}
            className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="2026"
          />
        </Field>

        <Field label="Language (BCP-47)">
          <input
            value={local.language}
            onChange={(e) => setLocal({ ...local, language: e.target.value })}
            onBlur={() => patchBook({ language: local.language })}
            maxLength={35}
            className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="en-US"
          />
        </Field>
      </div>

      <Field label="Dedication">
        <textarea
          value={local.dedication ?? ''}
          onChange={(e) => setLocal({ ...local, dedication: e.target.value })}
          onBlur={() => patchBook({ dedication: local.dedication || null })}
          rows={3}
          maxLength={5000}
          className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent resize-none"
          placeholder="For…"
        />
      </Field>

      <Field label="About the author">
        <textarea
          value={local.aboutAuthor ?? ''}
          onChange={(e) => setLocal({ ...local, aboutAuthor: e.target.value })}
          onBlur={() => patchBook({ aboutAuthor: local.aboutAuthor || null })}
          rows={5}
          maxLength={10000}
          className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent resize-none"
          placeholder="Back-matter author bio"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Series name">
            <input
              value={local.seriesName ?? ''}
              onChange={(e) => setLocal({ ...local, seriesName: e.target.value })}
              onBlur={() => patchBook({ seriesName: local.seriesName || null })}
              maxLength={200}
              className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder="Optional"
            />
          </Field>
        </div>
        <Field label="Position">
          <input
            type="number"
            min={1}
            value={local.seriesPosition ?? ''}
            onChange={(e) =>
              setLocal({
                ...local,
                seriesPosition:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            onBlur={() => patchBook({ seriesPosition: local.seriesPosition })}
            className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="#"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function serializeBookPatch(
  patch: Partial<CreatorBook>,
): Record<string, unknown> {
  // Strip undefined values; null is meaningful (clear the field).
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ─── Tab 2: Publishing targets ──────────────────────────────────────────────

function PublishingTargetsTab({
  book,
  targets,
  onTargetsChange,
}: {
  book: CreatorBook;
  targets: PublishingTarget[];
  onTargetsChange: (targets: PublishingTarget[]) => void;
}) {
  const [creating, setCreating] = useState(false);

  async function addTarget() {
    setCreating(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/creator/books/${book.id}/publishing-targets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'kdp_paperback',
            format: 'paperback',
            trimSize: '6x9',
          }),
        },
      );
      if (r.ok) {
        const created = (await r.json()) as PublishingTarget;
        onTargetsChange([...targets, created]);
      }
    } finally {
      setCreating(false);
    }
  }

  async function updateOne(
    targetId: string,
    patch: Partial<PublishingTarget>,
  ): Promise<PublishingTarget | null> {
    const r = await fetch(
      `/api/tiresias/agentic-os/creator/books/${book.id}/publishing-targets/${targetId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    if (!r.ok) return null;
    const updated = (await r.json()) as PublishingTarget;
    onTargetsChange(targets.map((t) => (t.id === updated.id ? updated : t)));
    return updated;
  }

  async function deleteOne(targetId: string) {
    const r = await fetch(
      `/api/tiresias/agentic-os/creator/books/${book.id}/publishing-targets/${targetId}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      onTargetsChange(targets.filter((t) => t.id !== targetId));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-tertiary">
        Add a target for each platform + format you intend to publish to. ISBN
        becomes required at publish-ready export — keep it blank for drafts.
      </p>

      {targets.map((target) => (
        <PublishingTargetCard
          key={target.id}
          target={target}
          onPatch={(patch) => updateOne(target.id, patch)}
          onDelete={() => deleteOne(target.id)}
        />
      ))}

      <button
        type="button"
        onClick={addTarget}
        disabled={creating}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-accent border border-dashed border-accent/40 rounded hover:bg-accent/5 disabled:opacity-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {creating ? 'Adding…' : 'Add publishing target'}
      </button>
    </div>
  );
}

function PublishingTargetCard({
  target,
  onPatch,
  onDelete,
}: {
  target: PublishingTarget;
  onPatch: (patch: Partial<PublishingTarget>) => Promise<PublishingTarget | null>;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(target);
  const isbnRaw = local.isbn ?? '';
  const isbnValid = isbnRaw === '' || isValidIsbn13(isbnRaw);

  return (
    <div className="border border-border-subtle rounded-lg p-3 space-y-3 bg-surface-0">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Platform">
          <select
            value={local.platform}
            onChange={(e) => {
              const platform = e.target.value as PublishingPlatform;
              setLocal({ ...local, platform });
              onPatch({ platform });
            }}
            className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
          >
            {PUBLISHING_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Format">
          <select
            value={local.format}
            onChange={(e) => {
              const format = e.target.value as PublishingFormat;
              setLocal({ ...local, format });
              onPatch({ format });
            }}
            className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
          >
            {PUBLISHING_FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Trim size">
          <input
            list={`trim-sizes-${target.id}`}
            value={local.trimSize ?? ''}
            onChange={(e) => setLocal({ ...local, trimSize: e.target.value })}
            onBlur={() => onPatch({ trimSize: local.trimSize || null })}
            disabled={local.format === 'ebook'}
            placeholder={local.format === 'ebook' ? 'n/a for ebooks' : '6x9'}
            className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent disabled:opacity-40"
          />
          <datalist id={`trim-sizes-${target.id}`}>
            {COMMON_TRIM_SIZES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>

        <Field label="Price (USD)">
          <input
            type="number"
            step={0.01}
            min={0}
            max={9999.99}
            value={local.priceUsd ?? ''}
            onChange={(e) =>
              setLocal({
                ...local,
                priceUsd: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            onBlur={() => onPatch({ priceUsd: local.priceUsd })}
            className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
            placeholder="14.99"
          />
        </Field>
      </div>

      <Field label="ISBN-13">
        <input
          value={isbnRaw}
          onChange={(e) => setLocal({ ...local, isbn: e.target.value })}
          onBlur={() => {
            if (isbnValid) onPatch({ isbn: local.isbn || null });
          }}
          maxLength={20}
          className={`w-full bg-surface-2 border rounded px-2 py-1.5 text-sm text-white focus:outline-none ${
            !isbnValid
              ? 'border-danger focus:border-danger'
              : 'border-border-subtle focus:border-accent'
          }`}
          placeholder="978-…  (required only at publish-ready export)"
        />
        {!isbnValid && (
          <p className="mt-1 flex items-center gap-1 text-xs text-danger">
            <AlertCircle className="w-3.5 h-3.5" />
            Invalid ISBN-13 (need 978/979 prefix + checksum)
          </p>
        )}
      </Field>

      <BisacPicker
        codes={local.bisacCodes}
        onChange={(codes) => {
          setLocal({ ...local, bisacCodes: codes });
          onPatch({ bisacCodes: codes });
        }}
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Status">
          <select
            value={local.status}
            onChange={(e) => {
              const status = e.target.value as PublishingTargetStatus;
              setLocal({ ...local, status });
              onPatch({ status });
            }}
            className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
          >
            {PUBLISHING_TARGET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex items-center gap-1 text-xs text-danger hover:text-danger/80 px-2 py-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove target
          </button>
        </div>
      </div>

      <Field label="Notes">
        <textarea
          value={local.notes ?? ''}
          onChange={(e) => setLocal({ ...local, notes: e.target.value })}
          onBlur={() => onPatch({ notes: local.notes || null })}
          rows={2}
          maxLength={5000}
          className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent resize-none"
          placeholder="Internal notes — upload deadlines, KDP account, etc."
        />
      </Field>
    </div>
  );
}

// ─── BISAC picker ───────────────────────────────────────────────────────────

function BisacPicker({
  codes,
  onChange,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered =
    query.trim() === ''
      ? []
      : BISAC_CODES.filter((c) => {
          const q = query.toLowerCase();
          return (
            c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
          );
        }).slice(0, 8);

  function addCode(code: string) {
    if (!codes.includes(code)) onChange([...codes, code]);
    setQuery('');
  }

  function removeCode(code: string) {
    onChange(codes.filter((c) => c !== code));
  }

  return (
    <Field label="BISAC subject codes">
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {codes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/15 text-accent text-xs rounded"
            >
              <span className="font-mono">{code}</span>
              <button
                type="button"
                onClick={() => removeCode(code)}
                className="text-accent/60 hover:text-accent"
                aria-label={`Remove ${code}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Allow direct entry of a code not in the curated list.
          if (e.key === 'Enter' && /^[A-Z]{3}\d{6}$/.test(query)) {
            e.preventDefault();
            addCode(query);
          }
        }}
        className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        placeholder="Search by code or label (e.g. 'python', 'leadership')"
      />
      {filtered.length > 0 && (
        <div className="mt-1 border border-border-subtle rounded bg-surface-0 max-h-48 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => addCode(c.code)}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-surface-2 flex items-center gap-2"
            >
              <span className="font-mono text-accent shrink-0">{c.code}</span>
              <span className="text-text-secondary truncate">{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}
