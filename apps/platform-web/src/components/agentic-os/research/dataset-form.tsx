'use client';

/**
 * Research OS Phase 5 — dataset create form.
 *
 * Inline form on the Datasets tab; POSTs to
 * /api/tiresias/.../experiments/:id/datasets and refreshes on success.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DATASET_KINDS,
  DATASET_KIND_LABELS,
  type DatasetKind,
} from '@/lib/agentic-os/research/dataset-kinds';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface Props {
  experimentId: string;
  onClose?: () => void;
}

export function DatasetForm({ experimentId, onClose }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DatasetKind>('tabular');
  const [url, setUrl] = useState('');
  const [version, setVersion] = useState('');
  const [checksum, setChecksum] = useState('');
  const [publishedDoi, setPublishedDoi] = useState('');
  const [notesMd, setNotesMd] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const tags = tagsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/datasets`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            kind,
            url,
            version: version || null,
            checksum: checksum || null,
            publishedDoi: publishedDoi || null,
            notesMd: notesMd || null,
            tags,
            archived,
          }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setName('');
      setUrl('');
      setVersion('');
      setChecksum('');
      setPublishedDoi('');
      setNotesMd('');
      setTagsStr('');
      setArchived(false);
      router.refresh();
      onClose?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-3"
      data-testid="dataset-form"
    >
      <h3 className="text-sm font-semibold text-white">Add dataset</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-text-secondary space-y-1">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
            data-testid="dataset-form-name"
          />
        </label>
        <label className="text-xs text-text-secondary space-y-1">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DatasetKind)}
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
            data-testid="dataset-form-kind"
          >
            {DATASET_KINDS.map((k) => (
              <option key={k} value={k}>
                {DATASET_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-text-secondary space-y-1">
        URL
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://…"
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
          data-testid="dataset-form-url"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs text-text-secondary space-y-1">
          Version
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="v1.0"
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
          />
        </label>
        <label className="text-xs text-text-secondary space-y-1">
          Checksum
          <input
            type="text"
            value={checksum}
            onChange={(e) => setChecksum(e.target.value)}
            placeholder="sha256:…"
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white font-mono outline-none focus:border-accent/60"
          />
        </label>
        <label className="text-xs text-text-secondary space-y-1">
          Published DOI
          <input
            type="text"
            value={publishedDoi}
            onChange={(e) => setPublishedDoi(e.target.value)}
            placeholder="10.…"
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
          />
        </label>
      </div>

      <label className="block text-xs text-text-secondary space-y-1">
        Tags (comma-separated)
        <input
          type="text"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
        />
      </label>

      <label className="block text-xs text-text-secondary space-y-1">
        Notes
        <textarea
          value={notesMd}
          onChange={(e) => setNotesMd(e.target.value)}
          rows={3}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
        />
      </label>

      <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
          className="accent-accent"
        />
        Raw data archived externally (Zenodo, institutional repo, etc.)
      </label>

      {err && <p className="text-xs text-rose-400">{err}</p>}

      <div className="flex justify-end gap-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border-subtle text-text-secondary hover:text-white transition"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition"
          data-testid="dataset-form-submit"
        >
          {busy && <Spinner size="xs" />}
          Save dataset
        </button>
      </div>
    </form>
  );
}
