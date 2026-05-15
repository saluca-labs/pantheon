'use client';

/**
 * Research OS Phase 5 — protocol create form (workshop-global).
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PROTOCOL_KINDS,
  PROTOCOL_KIND_LABELS,
  type ProtocolKind,
} from '@/lib/agentic-os/research/protocol-kinds';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface Props {
  onClose?: () => void;
}

export function ProtocolForm({ onClose }: Props) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ProtocolKind>('method');
  const [version, setVersion] = useState('1.0');
  const [bodyMd, setBodyMd] = useState('');
  const [tagsStr, setTagsStr] = useState('');
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
      const r = await fetch('/api/tiresias/agentic-os/research/protocols', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, kind, version, bodyMd, tags }),
      });
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
      data-testid="protocol-form"
    >
      <h3 className="text-sm font-semibold text-white">Add protocol</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-text-secondary space-y-1">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
            data-testid="protocol-form-title"
          />
        </label>
        <label className="text-xs text-text-secondary space-y-1">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProtocolKind)}
            className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
            data-testid="protocol-form-kind"
          >
            {PROTOCOL_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROTOCOL_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-text-secondary space-y-1">
        Version
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          required
          maxLength={60}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
        />
      </label>

      <label className="block text-xs text-text-secondary space-y-1">
        Body (markdown)
        <textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={8}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white font-mono outline-none focus:border-accent/60"
          data-testid="protocol-form-body"
        />
      </label>

      <label className="block text-xs text-text-secondary space-y-1">
        Tags (comma-separated)
        <input
          type="text"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded bg-surface-0 border border-border-subtle text-sm text-white outline-none focus:border-accent/60"
        />
      </label>

      {err && <p className="text-xs text-danger">{err}</p>}

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
          data-testid="protocol-form-submit"
        >
          {busy && <Spinner label="Creating protocol" size="xs" />}
          Create protocol
        </button>
      </div>
    </form>
  );
}
