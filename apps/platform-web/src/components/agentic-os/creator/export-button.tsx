'use client';

/**
 * Creator OS — Export button.
 *
 * Two modes:
 *   1. No publishing targets defined → legacy dropdown with DOCX / PDF /
 *      ePub options. Hits the export route with `{ format }`.
 *   2. Has publishing targets → "Export for…" dropdown listing each
 *      target with two actions per row: "Draft" (skips pre-flight) and
 *      "Publish-ready" (runs pre-flight, surfaces blockers).
 *
 * Pre-flight blockers come back as a 422 payload with `{ blockers,
 * warnings }`. The component shows them inline and lets the user
 * acknowledge before retrying.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { useState, useRef, useEffect } from 'react';
import {
  Download,
  FileText,
  FileType,
  Book,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { PublishingTarget } from '@/lib/agentic-os/creator/publishing-targets';

interface ExportButtonProps {
  bookId: string;
  bookTitle: string;
  targets?: PublishingTarget[];
}

type LegacyFormat = 'docx' | 'pdf' | 'epub';

const FORMAT_LABELS: Record<LegacyFormat, { label: string; icon: typeof FileText }> = {
  docx: { label: 'DOCX', icon: FileText },
  pdf: { label: 'PDF', icon: FileType },
  epub: { label: 'ePub', icon: Book },
};

const PLATFORM_LABELS: Record<PublishingTarget['platform'], string> = {
  kdp_paperback: 'KDP Paperback',
  kdp_ebook: 'KDP Ebook',
  lulu_paperback: 'Lulu Paperback',
  ingramspark_paperback: 'IngramSpark Paperback',
  generic_epub: 'Generic ePub',
};

interface PreflightIssue {
  code: string;
  message: string;
  field?: string;
}

export function ExportButton({ bookId, bookTitle, targets = [] }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preflightDialog, setPreflightDialog] = useState<{
    target: PublishingTarget;
    warnings: PreflightIssue[];
    blockers: PreflightIssue[];
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function filenameFor(target: PublishingTarget, output: 'pdf' | 'epub'): string {
    const safe = bookTitle.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Book';
    const platformSuffix = target.platform.replace(/_/g, '-');
    return `${safe}-${platformSuffix}.${output}`;
  }

  async function downloadBlob(r: Response, filename: string) {
    const blob = await r.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async function handleLegacy(format: LegacyFormat) {
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
      await downloadBlob(r, `${bookTitle}.${format}`);
    } catch {
      alert('Export failed. Check that Pandoc is installed.');
    } finally {
      setExporting(false);
    }
  }

  async function handleTarget(
    target: PublishingTarget,
    mode: 'draft' | 'publish_ready',
  ) {
    setOpen(false);
    setExporting(true);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/creator/books/${bookId}/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: target.id, mode }),
        },
      );
      if (r.status === 422) {
        const body = (await r.json()) as {
          warnings: PreflightIssue[];
          blockers: PreflightIssue[];
        };
        setPreflightDialog({
          target,
          warnings: body.warnings ?? [],
          blockers: body.blockers ?? [],
        });
        return;
      }
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Export failed' }));
        alert(err.error ?? 'Export failed');
        return;
      }
      const output = target.format === 'ebook' ? 'epub' : 'pdf';
      await downloadBlob(r, filenameFor(target, output));

      // If the server attached non-blocking warnings, surface them
      // after the download starts so the user has the file in hand.
      const warningsHeader = r.headers.get('X-Creator-Export-Warnings');
      if (warningsHeader) {
        try {
          const ws = JSON.parse(warningsHeader) as PreflightIssue[];
          if (ws.length > 0) {
            setPreflightDialog({ target, warnings: ws, blockers: [] });
          }
        } catch {
          // ignore malformed header
        }
      }
    } catch {
      alert('Export failed. Check that Pandoc is installed.');
    } finally {
      setExporting(false);
    }
  }

  // ─── Render: no targets → legacy ──────────────────────────────────────────
  if (targets.length === 0) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={exporting}
          className="inline-flex items-center justify-center gap-2 w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-white hover:border-accent/50 disabled:opacity-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? 'Exporting…' : 'Export'}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-36 rounded-md border border-border-subtle bg-surface-2 shadow-lg shadow-black/50 py-1 z-50">
            {(Object.entries(FORMAT_LABELS) as [LegacyFormat, typeof FORMAT_LABELS['docx']][]).map(
              ([format, { label, icon: Icon }]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => handleLegacy(format)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-secondary hover:bg-surface-0 hover:text-white transition-colors"
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

  // ─── Render: targeted ─────────────────────────────────────────────────────
  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={exporting}
          className="inline-flex items-center justify-center gap-2 w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-white hover:border-accent/50 disabled:opacity-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? 'Exporting…' : 'Export for…'}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-72 rounded-md border border-border-subtle bg-surface-2 shadow-lg shadow-black/50 py-1 z-50">
            {targets.map((target) => (
              <div
                key={target.id}
                className="px-3 py-2 border-b border-border-subtle last:border-b-0"
              >
                <div className="text-xs font-medium text-white mb-0.5">
                  {PLATFORM_LABELS[target.platform]}
                </div>
                <div className="text-[10px] text-text-tertiary mb-2">
                  {target.format}
                  {target.trimSize ? ` · ${target.trimSize}` : ''}
                  {' · '}
                  <span className="capitalize">{target.status}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleTarget(target, 'draft')}
                    className="flex-1 px-2 py-1 text-[11px] rounded bg-surface-0 text-text-secondary hover:text-white hover:bg-surface-1 transition-colors"
                  >
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTarget(target, 'publish_ready')}
                    className="flex-1 px-2 py-1 text-[11px] rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                  >
                    Publish-ready
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preflightDialog && (
        <PreflightDialog
          target={preflightDialog.target}
          warnings={preflightDialog.warnings}
          blockers={preflightDialog.blockers}
          onClose={() => setPreflightDialog(null)}
        />
      )}
    </>
  );
}

// ─── Pre-flight dialog ──────────────────────────────────────────────────────

function PreflightDialog({
  target,
  warnings,
  blockers,
  onClose,
}: {
  target: PublishingTarget;
  warnings: PreflightIssue[];
  blockers: PreflightIssue[];
  onClose: () => void;
}) {
  const hasBlockers = blockers.length > 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pre-flight results"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {hasBlockers ? 'Pre-flight blockers' : 'Pre-flight warnings'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-text-tertiary">
          Target: <span className="text-text-secondary">{PLATFORM_LABELS[target.platform]}</span>
          {target.trimSize ? ` · ${target.trimSize}` : ''} ·{' '}
          {target.format}
        </p>

        {blockers.length > 0 && (
          <ul className="space-y-2">
            {blockers.map((b, i) => (
              <li
                key={`${b.code}-${i}`}
                className="flex gap-2 text-xs text-danger bg-danger/10 rounded px-3 py-2 border border-danger/30"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <span className="font-mono text-[10px] block text-danger/70">
                    {b.code}
                  </span>
                  {b.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        {warnings.length > 0 && (
          <ul className="space-y-2">
            {warnings.map((w, i) => (
              <li
                key={`${w.code}-${i}`}
                className="flex gap-2 text-xs text-warning bg-warning/10 rounded px-3 py-2 border border-warning/30"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <span className="font-mono text-[10px] block text-warning/70">
                    {w.code}
                  </span>
                  {w.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded bg-surface-0 text-text-secondary hover:text-white border border-border-subtle"
          >
            {hasBlockers ? 'Got it' : 'Acknowledged'}
          </button>
        </div>
      </div>
    </div>
  );
}
