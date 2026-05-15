'use client';

/**
 * Research OS Phase 5 — workshop protocol picker + pin form.
 *
 * Hydrates workshop-global protocols on mount (the experiment page
 * doesn't pre-load them); on pin, POSTs and refreshes the page.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { Protocol } from '@/lib/agentic-os/research/protocols';
import { PROTOCOL_KIND_LABELS } from '@/lib/agentic-os/research/protocol-kinds';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface Props {
  experimentId: string;
}

export function ExperimentProtocolLinker({ experimentId }: Props) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Protocol[]>([]);
  const [hydrating, setHydrating] = useState(false);
  const [protocolId, setProtocolId] = useState<string>('');
  const [pinnedVersion, setPinnedVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHydrating(true);
    fetch('/api/tiresias/agentic-os/research/protocols?roots=false')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows: Protocol[] = Array.isArray(data.protocols) ? data.protocols : [];
        setCandidates(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selected = candidates.find((p) => p.id === protocolId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!protocolId) {
      setErr('Pick a protocol first');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/protocols`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            protocolId,
            pinnedVersion: pinnedVersion.trim() || undefined,
            notes: notes || undefined,
          }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setProtocolId('');
      setPinnedVersion('');
      setNotes('');
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/80 transition"
        data-testid="experiment-protocol-linker-toggle"
      >
        <Plus className="w-3 h-3" />
        Pin protocol
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-3"
      data-testid="experiment-protocol-linker"
    >
      <h3 className="text-sm font-semibold text-white">Pin a protocol</h3>
      <label className="block text-xs text-text-secondary space-y-1">
        Protocol
        <select
          value={protocolId}
          onChange={(e) => {
            setProtocolId(e.target.value);
            const p = candidates.find((c) => c.id === e.target.value);
            if (p) setPinnedVersion(p.version);
          }}
          required
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
          data-testid="experiment-protocol-linker-protocol"
        >
          <option value="">{hydrating ? 'Loading…' : 'Select a protocol'}</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} — {PROTOCOL_KIND_LABELS[p.kind]} (v{p.version})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-text-secondary space-y-1">
        Pinned version
        <input
          type="text"
          value={pinnedVersion}
          onChange={(e) => setPinnedVersion(e.target.value)}
          placeholder={selected ? selected.version : 'e.g. 1.0'}
          maxLength={60}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
          data-testid="experiment-protocol-linker-version"
        />
        <span className="text-[10px] text-text-tertiary">
          Leave blank to pin the protocol's current version.
        </span>
      </label>
      <label className="block text-xs text-text-secondary space-y-1">
        Notes
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
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 rounded border border-border-subtle text-text-secondary hover:text-white transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition"
          data-testid="experiment-protocol-linker-submit"
        >
          {busy && <Spinner label="Pinning" size="xs" />}
          Pin
        </button>
      </div>
    </form>
  );
}
