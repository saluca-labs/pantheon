'use client';

/**
 * Research OS Phase 2 — Pinned-top entry composer.
 *
 * Collapsed by default to a single "+ New entry" button. Expands into
 * the full editor on click. POSTs to
 * `/api/tiresias/agentic-os/research/experiments/:id/notebook` and
 * refreshes the parent's data (passed `onCreated` callback).
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  NotebookEntryEditor,
  type NotebookEntryEditorValue,
} from './notebook-entry-editor';
import type { NotebookEntry } from '@/lib/agentic-os/research/notebook-entries';

interface Props {
  experimentId: string;
  /** Called with the newly created entry. */
  onCreated?: (entry: NotebookEntry) => void;
}

export function NotebookEntryComposer({ experimentId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  async function handleSubmit(value: NotebookEntryEditorValue) {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        entry_kind: value.entryKind,
        title: value.title,
        body_md: value.bodyMd,
        attached_urls: value.attachedUrls,
        tags: value.tags,
      };
      if (value.entryAt) body.entry_at = value.entryAt;

      const res = await fetch(
        `/api/tiresias/agentic-os/research/experiments/${experimentId}/notebook`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        const msg =
          detail && typeof detail.error === 'string'
            ? detail.error
            : `Failed to create entry (${res.status})`;
        setError(msg);
        return;
      }
      const data = await res.json();
      onCreated?.(data.entry);
      setOpen(false);
      setResetKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-[#4361EE]/15 border border-[#4361EE]/40 text-[#cbd5e1] hover:bg-[#4361EE]/25 hover:text-white"
          data-testid="composer-open"
        >
          <Plus className="w-4 h-4" />
          New notebook entry
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 mb-4"
      data-testid="notebook-entry-composer"
    >
      <h3 className="text-sm font-semibold text-white mb-3">New notebook entry</h3>
      <NotebookEntryEditor
        key={resetKey}
        submitLabel="Add entry"
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
      />
    </div>
  );
}
