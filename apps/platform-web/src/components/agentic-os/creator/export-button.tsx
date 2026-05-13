'use client';

/**
 * Creator OS Phase 3 — Export button component.
 *
 * Dropdown with 3 export options: DOCX, PDF, ePub.
 * On select: POST to export API, trigger file download from blob response.
 *
 * @license MIT — Tiresias Creator OS Phase 3 (internal).
 */

import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileType, Book } from 'lucide-react';

interface ExportButtonProps {
  bookId: string;
  bookTitle: string;
}

type ExportFormat = 'docx' | 'pdf' | 'epub';

const FORMAT_LABELS: Record<ExportFormat, { label: string; icon: typeof FileText }> = {
  docx: { label: 'DOCX', icon: FileText },
  pdf: { label: 'PDF', icon: FileType },
  epub: { label: 'ePub', icon: Book },
};

export function ExportButton({ bookId, bookTitle }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleExport(format: ExportFormat) {
    setOpen(false);
    setExporting(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/creator/books/${bookId}/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format }),
        },
      );

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Export failed' }));
        alert(err.error ?? 'Export failed');
        return;
      }

      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookTitle}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Check that Pandoc is installed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={exporting}
        className="inline-flex items-center justify-center gap-2 w-full px-3 py-1.5 rounded-md bg-[#1a1d27] border border-[#2a2d3e] text-xs text-[#94a3b8] hover:text-white hover:border-[#4361EE]/50 disabled:opacity-50 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        {exporting ? 'Exporting…' : 'Export'}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-36 rounded-md border border-[#2a2d3e] bg-[#1a1d27] shadow-lg shadow-black/50 py-1 z-50">
          {(Object.entries(FORMAT_LABELS) as [ExportFormat, typeof FORMAT_LABELS['docx']][]).map(
            ([format, { label, icon: Icon }]) => (
              <button
                key={format}
                type="button"
                onClick={() => handleExport(format)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#94a3b8] hover:bg-[#0f1117] hover:text-white transition-colors"
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
