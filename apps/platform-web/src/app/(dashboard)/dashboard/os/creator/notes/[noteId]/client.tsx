'use client';

/**
 * Creator OS Phase 1 — Note editor client component.
 *
 * Handles the interactive title input and TipTap editor with debounced
 * auto-save via PATCH to the notes API.
 *
 * @license MIT — Tiresias Creator OS Phase 1 (internal).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TipTapEditor } from '@/components/agentic-os/_shared/tiptap-editor';
import type { CreatorNote } from '@/lib/agentic-os/creator/notes';

interface NoteEditorClientProps {
  note: CreatorNote;
}

export function NoteEditorClient({ note: initialNote }: NoteEditorClientProps) {
  const [note, setNote] = useState<CreatorNote>(initialNote);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(initialNote.id);

  // Reset state when navigating to a different note
  if (initialNote.id !== noteIdRef.current) {
    noteIdRef.current = initialNote.id;
    if (note.id !== initialNote.id) {
      // This resets on the next render
    }
  }

  useEffect(() => {
    setNote(initialNote);
    noteIdRef.current = initialNote.id;
  }, [initialNote.id]);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/tiresias/agentic-os/creator/notes/${note.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
        if (res.ok) {
          const updated = await res.json();
          setNote(updated);
        }
      } finally {
        setSaving(false);
      }
    },
    [note.id],
  );

  const debouncedSave = useCallback(
    (patch: Record<string, unknown>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        save(patch);
      }, 800);
    },
    [save],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-6">
        <input
          type="text"
          value={note.title}
          onChange={(e) => {
            const newTitle = e.target.value;
            setNote((prev) => ({ ...prev, title: newTitle }));
            debouncedSave({ title: newTitle });
          }}
          placeholder="Untitled"
          className="text-2xl font-semibold text-white bg-transparent border-none outline-none placeholder:text-text-secondary/40 w-full"
        />
        <span className="text-xs text-text-secondary/60 flex-shrink-0 ml-4">
          {saving ? 'Saving…' : 'Saved'}
        </span>
      </div>

      {/* Icon and tags row */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={note.icon ?? ''}
          onChange={(e) => {
            const icon = e.target.value.slice(0, 2) || null;
            setNote((prev) => ({ ...prev, icon }));
            debouncedSave({ icon });
          }}
          placeholder="No icon"
          maxLength={2}
          className="w-12 h-10 text-center text-lg bg-surface-2 border border-border-subtle rounded-lg text-white focus:border-[#d946ef] outline-none"
          title="Emoji icon"
        />
        <input
          type="text"
          value={note.tags.join(', ')}
          onChange={(e) => {
            const tags = e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            setNote((prev) => ({ ...prev, tags }));
            debouncedSave({ tags });
          }}
          placeholder="Add tags (comma-separated)"
          className="flex-1 bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-secondary/40 focus:border-[#d946ef] outline-none"
        />
      </div>

      {/* TipTap editor */}
      <TipTapEditor
        content={note.content}
        onChange={(json) => {
          setNote((prev) => ({ ...prev, content: json }));
          debouncedSave({ content: json });
        }}
        placeholder="Start writing…"
      />
    </div>
  );
}
