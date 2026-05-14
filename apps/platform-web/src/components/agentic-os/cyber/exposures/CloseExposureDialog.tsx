'use client';

/**
 * CyberSec OS — Inline "close exposure" widget.
 *
 * Renders three buttons (Mitigated / Resolved / False positive) plus a notes
 * input; posts to the /close route to stamp remediated_at.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ShieldCheck } from 'lucide-react';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

type CloseStatus = 'mitigated' | 'resolved' | 'false_positive';

export function CloseExposureDialog({ exposureId }: { exposureId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function close(status: CloseStatus) {
    setBusy(true);
    setErr(null);
    const res = await fetch(
      `/api/tiresias/agentic-os/cyber/exposures/${exposureId}/close`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes: notes.trim() || null }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? 'Close failed');
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">Close exposure</p>
      <label className="block">
        <span className="block text-xs text-text-secondary mb-1">Notes (optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} />
      </label>
      <div className="flex gap-2 flex-wrap">
        <button type="button" disabled={busy} onClick={() => close('mitigated')}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 px-3 py-2 text-sm hover:bg-blue-500/20 disabled:opacity-50">
          <ShieldCheck className="w-4 h-4" /> Mitigated
        </button>
        <button type="button" disabled={busy} onClick={() => close('resolved')}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm hover:bg-emerald-500/20 disabled:opacity-50">
          <Check className="w-4 h-4" /> Resolved
        </button>
        <button type="button" disabled={busy} onClick={() => close('false_positive')}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-500/30 bg-slate-500/10 text-slate-300 px-3 py-2 text-sm hover:bg-slate-500/20 disabled:opacity-50">
          <X className="w-4 h-4" /> False positive
        </button>
      </div>
      {err && <p className="text-xs text-red-300">{err}</p>}
    </div>
  );
}
