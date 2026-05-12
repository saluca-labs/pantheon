'use client';

/**
 * Research OS Phase 3 — Single falsifier card with inline edit + delete.
 *
 * Renders `criterionMd` via react-markdown WITHOUT rehype-raw (XSS
 * guard — raw HTML is escaped as text, matching Phase 2's notebook
 * entry treatment).
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Pencil, Trash2, AlertOctagon } from 'lucide-react';
import { FalsifierEditor } from './falsifier-editor';
import type { Falsifier } from '@/lib/agentic-os/research/falsifiers';

interface Props {
  falsifier: Falsifier;
  onUpdated: (f: Falsifier) => void;
  onDeleted: (id: string) => void;
}

export function FalsifierCard({ falsifier, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/research/falsifiers/${falsifier.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      onDeleted(falsifier.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <FalsifierEditor
        mode="edit"
        falsifier={falsifier}
        onUpdated={(f) => {
          onUpdated(f);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117]/60 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertOctagon className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
        <p className="text-sm text-white leading-relaxed">{falsifier.text}</p>
      </div>
      {falsifier.criterionMd && (
        <div className="ml-6 text-xs text-[#94a3b8] prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{falsifier.criterionMd}</ReactMarkdown>
        </div>
      )}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-white transition"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
        {confirmingDelete ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-[#94a3b8]">Delete?</span>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="text-red-300 hover:text-red-200 disabled:opacity-50"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="text-[#94a3b8] hover:text-white"
            >
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-red-300 transition"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
