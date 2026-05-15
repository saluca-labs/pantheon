'use client';

/**
 * Research OS Phase 5 — version-bump form (inline).
 *
 * POSTs to /protocols/[id]/versions and navigates to the new row.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Protocol } from '@/lib/agentic-os/research/protocols';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface Props {
  source: Protocol;
  onClose: () => void;
}

export function ProtocolVersionBumpForm({ source, onClose }: Props) {
  const [version, setVersion] = useState('');
  const [bodyMd, setBodyMd] = useState(source.bodyMd);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/research/protocols/${source.id}/versions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version, bodyMd, notes: notes || undefined }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      const data = await r.json();
      router.push(`/dashboard/os/research/protocols/${data.protocol.id}`);
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
      data-testid="protocol-version-bump-form"
    >
      <h3 className="text-sm font-semibold text-white">Bump version</h3>
      <p className="text-xs text-text-secondary">
        Creates a new revision chained off this protocol's root. Existing
        pins to the old version remain untouched.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-text-secondary space-y-1">
          From version
          <input
            type="text"
            value={source.version}
            disabled
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-text-tertiary"
          />
        </label>
        <label className="text-xs text-text-secondary space-y-1">
          New version
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            required
            maxLength={60}
            placeholder="e.g. 2.0"
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
            data-testid="protocol-version-bump-form-version"
          />
        </label>
      </div>
      <label className="block text-xs text-text-secondary space-y-1">
        Body (markdown)
        <textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={10}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white font-mono outline-none focus:border-accent/60"
          data-testid="protocol-version-bump-form-body"
        />
      </label>
      <label className="block text-xs text-text-secondary space-y-1">
        Notes (what changed)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
        />
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded border border-border-subtle text-text-secondary hover:text-white transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition"
          data-testid="protocol-version-bump-form-submit"
        >
          {busy && <Spinner label="Saving" size="xs" />}
          Save new version
        </button>
      </div>
    </form>
  );
}
