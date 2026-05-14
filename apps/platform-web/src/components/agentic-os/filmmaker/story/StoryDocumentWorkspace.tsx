'use client';

/**
 * Filmmaker OS — StoryDocumentWorkspace.
 *
 * Client wrapper that combines the TipTap editor, the "Save snapshot"
 * action, the version-history panel, and the delete action onto one
 * page. The server page loads the document + initial versions and hands
 * them in; this component owns interactivity.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, History, Trash2, RotateCcw } from 'lucide-react';
import {
  StoryDocumentEditor,
  type StoryDocumentEditorHandle,
} from './StoryDocumentEditor';
import type {
  StoryDocument,
  StoryDocumentVersion,
  ProseMirrorJson,
} from '@/lib/agentic-os/filmmaker/story-documents';
import { STORY_DOCUMENT_KIND_LABEL } from '@/lib/agentic-os/filmmaker/story-documents';

interface Props {
  document: StoryDocument;
  projectId: string;
  initialVersions: StoryDocumentVersion[];
}

export function StoryDocumentWorkspace({ document, projectId, initialVersions }: Props) {
  const router = useRouter();
  const editorRef = useRef<StoryDocumentEditorHandle | null>(null);

  const [doc, setDoc] = useState<StoryDocument>(document);
  const [versions, setVersions] = useState<StoryDocumentVersion[]>(initialVersions);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Lightweight session-scoped auto-snapshot. Fires at most once per 5
  // minutes of editing activity. Autosave is separate (1.5 s debounce);
  // this only writes to the version table when sustained editing happens.
  const lastAutoSnapshotRef = useRef<number>(Date.now());
  const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60_000;

  const triggerAutoSnapshotIfDue = useCallback(async () => {
    const now = Date.now();
    if (now - lastAutoSnapshotRef.current < AUTO_SNAPSHOT_INTERVAL_MS) return;
    lastAutoSnapshotRef.current = now;
    try {
      await fetch(
        `/api/tiresias/agentic-os/filmmaker/story-documents/${doc.id}/snapshot`,
        { method: 'POST' },
      );
      // Refresh versions panel quietly.
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/story-documents/${doc.id}/versions`,
      );
      if (r.ok) {
        const data = (await r.json()) as { versions: StoryDocumentVersion[] };
        setVersions(data.versions);
      }
    } catch {
      // best-effort
    }
  }, [doc.id]);

  function handleSaved(saved: StoryDocument) {
    setDoc(saved);
    setLastSavedAt(saved.updatedAt);
    void triggerAutoSnapshotIfDue();
  }

  function handleError(err: Error) {
    setError(err.message);
  }

  async function saveSnapshot() {
    setSnapshotting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/story-documents/${doc.id}/snapshot`,
        { method: 'POST' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Snapshot failed (${r.status})`);
      }
      const data = (await r.json()) as { version: StoryDocumentVersion };
      setVersions((prev) => [data.version, ...prev]);
      setHistoryOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Snapshot failed');
    } finally {
      setSnapshotting(false);
    }
  }

  async function restoreVersion(versionId: string) {
    if (!window.confirm('Restore this version? The current state will be snapshotted first.')) {
      return;
    }
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/story-documents/${doc.id}/versions/${versionId}/restore`,
        { method: 'POST' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Restore failed (${r.status})`);
      }
      const data = (await r.json()) as { document: StoryDocument };
      setDoc(data.document);
      // Force a fresh editor mount by refreshing — TipTap state has to
      // be re-seeded from server JSON.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    }
  }

  async function deleteDocument() {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/story-documents/${doc.id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Delete failed (${r.status})`);
      }
      router.push(`/dashboard/os/filmmaker/projects/${projectId}/story`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }

  // Close the history panel on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setHistoryOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary">
            {STORY_DOCUMENT_KIND_LABEL[doc.kind]} · v{doc.version}
          </p>
          {lastSavedAt && (
            <p className="text-[11px] text-[#64748b]">
              Last saved {new Date(lastSavedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveSnapshot}
            disabled={snapshotting}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white hover:border-accent/60 disabled:opacity-50 transition"
          >
            <Camera className="w-3.5 h-3.5" />
            {snapshotting ? 'Saving…' : 'Save snapshot'}
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white hover:border-accent/60 transition"
          >
            <History className="w-3.5 h-3.5" />
            {historyOpen ? 'Hide history' : `History (${versions.length})`}
          </button>
          <button
            type="button"
            onClick={deleteDocument}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      <StoryDocumentEditor
        ref={editorRef}
        documentId={doc.id}
        initialContentJson={doc.contentJson as ProseMirrorJson}
        initialTitle={doc.title}
        placeholder={`Start writing the ${STORY_DOCUMENT_KIND_LABEL[doc.kind].toLowerCase()}…`}
        onSaved={handleSaved}
        onError={handleError}
      />

      {historyOpen && (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Version history</h3>
          {versions.length === 0 ? (
            <p className="text-xs text-text-secondary">
              No snapshots yet. Click <span className="text-white">Save snapshot</span> to take one.
            </p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-0 p-2.5"
                >
                  <div>
                    <p className="text-sm text-white">v{v.version}</p>
                    <p className="text-[11px] text-text-secondary">
                      {new Date(v.createdAt).toLocaleString()} ·{' '}
                      {v.wordCount.toLocaleString()} words
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreVersion(v.id)}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border-subtle text-text-primary hover:text-white hover:border-accent/60 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
