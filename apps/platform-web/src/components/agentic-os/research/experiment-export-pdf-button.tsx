'use client';

/**
 * Research OS Phase 5 — experiment PDF export button.
 *
 * Fetches /experiments/:id/export.pdf as a Blob, triggers a download,
 * and surfaces empty-experiment errors (400) inline.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';

interface Props {
  experimentId: string;
}

export function ExperimentExportPdfButton({ experimentId }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/export.pdf`,
      );
      if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try {
          const body = await r.json();
          if (body?.error) detail = body.error;
        } catch {
          /* not JSON */
        }
        throw new Error(detail);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const filename =
        r.headers
          .get('content-disposition')
          ?.match(/filename="([^"]+)"/)?.[1] ?? 'experiment.pdf';
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[#4361EE]/40 text-[#4361EE] hover:bg-[#4361EE]/10 disabled:opacity-50 transition"
        data-testid="experiment-export-pdf-button"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileDown className="w-3.5 h-3.5" />
        )}
        Export PDF
      </button>
      {err && (
        <span className="text-xs text-rose-400" data-testid="experiment-export-pdf-error">
          {err}
        </span>
      )}
    </div>
  );
}
