'use client';

/**
 * Maker OS — PdfExportButton.
 *
 * Renders the per-project "Export PDF" header button. On click, opens
 * the export route in a new tab; the route handler streams
 * application/pdf with a Content-Disposition attachment.
 *
 * `hasData` is server-computed: when no BOM lines / steps / milestones /
 * tools / references exist, the route returns 400 — we disable the
 * button up-front to avoid a confusing error.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { FileDown } from 'lucide-react';
import { useState } from 'react';

interface Props {
  projectId: string;
  hasData: boolean;
}

export function PdfExportButton({ projectId, hasData }: Props) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (!hasData || loading) return;
    setLoading(true);
    const url = `/api/tiresias/agentic-os/maker/projects/${projectId}/export.pdf`;
    // Open in a new tab so the browser handles the application/pdf
    // attachment naturally (download or open in viewer).
    window.open(url, '_blank', 'noopener,noreferrer');
    // Reset loading state shortly after — there's no client-side signal
    // for when the new tab finishes downloading.
    setTimeout(() => setLoading(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!hasData || loading}
      title={
        hasData
          ? 'Generate a build-packet PDF (BOM + steps + milestones + tools + references)'
          : 'Add some BOM lines / steps / milestones / tools / references first.'
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-primary hover:text-white hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      <FileDown className="w-3.5 h-3.5" />
      {loading ? 'Generating…' : 'Export PDF'}
    </button>
  );
}
