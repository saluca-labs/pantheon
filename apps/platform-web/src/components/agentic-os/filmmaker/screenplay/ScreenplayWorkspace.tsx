'use client';

/**
 * Filmmaker OS — ScreenplayWorkspace.
 *
 * Centrepiece client component. Wires the CodeMirror editor, scene
 * sidebar, character stats, version history, and save flow.
 *
 * Save semantics:
 *   - "Save draft" POSTs to /versions → server parses fountain, replaces
 *     scenes, flips head. This is the ONLY way new versions are created.
 *   - LocalStorage holds the in-progress text under a per-screenplay
 *     key and shows an "unsaved changes" badge until the user saves.
 *   - On mount, if localStorage has fresher text than the head version,
 *     the user is asked whether to restore it.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, FileText, Maximize2, Minimize2 } from 'lucide-react';
import {
  ScreenplayEditor,
  type ScreenplayEditorHandle,
} from './ScreenplayEditor';
import { ScreenplaySceneList } from './ScreenplaySceneList';
import { ScreenplayCharacterStats } from './ScreenplayCharacterStats';
import { ScreenplayVersionHistory } from './ScreenplayVersionHistory';
import type {
  Screenplay,
  ScreenplayVersion,
  ScreenplayScene,
  ScreenplayFormat,
  ScreenplayStatus,
} from '@/lib/agentic-os/filmmaker/screenplays';
import {
  SCREENPLAY_FORMATS,
  SCREENPLAY_STATUSES,
} from '@/lib/agentic-os/filmmaker/screenplays';

interface Props {
  projectId: string;
  screenplay: Screenplay;
  headVersion: ScreenplayVersion | null;
  scenes: ScreenplayScene[];
  versions: ScreenplayVersion[];
}

interface DraftCache {
  text: string;
  savedAt: number;
}

function draftKey(screenplayId: string): string {
  return `filmmaker.screenplay.draft.${screenplayId}`;
}

function readDraft(screenplayId: string): DraftCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey(screenplayId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftCache;
    if (typeof parsed.text !== 'string' || typeof parsed.savedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(screenplayId: string, text: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      draftKey(screenplayId),
      JSON.stringify({ text, savedAt: Date.now() }),
    );
  } catch {
    // localStorage full / disabled — non-fatal.
  }
}

function clearDraft(screenplayId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftKey(screenplayId));
  } catch {
    // ignore
  }
}

export function ScreenplayWorkspace({
  projectId,
  screenplay,
  headVersion,
  scenes: initialScenes,
  versions: initialVersions,
}: Props) {
  const router = useRouter();
  const editorRef = useRef<ScreenplayEditorHandle | null>(null);

  const headText = headVersion?.fountainText ?? '';

  const [text, setText] = useState<string>(headText);
  const [initialEditorText, setInitialEditorText] = useState<string>(headText);
  const [meta, setMeta] = useState<Screenplay>(screenplay);
  const [scenes, setScenes] = useState<ScreenplayScene[]>(initialScenes);
  const [versions, setVersions] = useState<ScreenplayVersion[]>(initialVersions);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Focused mode — distraction-free writing: header chrome + scene/character
  // rail collapse, the editor column centers and widens. Pure presentation;
  // all save / draft / version semantics are unchanged.
  const [focused, setFocused] = useState(false);

  // Esc leaves focused mode (keyboard parity with the toggle button).
  useEffect(() => {
    if (!focused) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocused(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused]);

  // On mount, restore from localStorage if present and different from head.
  useEffect(() => {
    const cached = readDraft(screenplay.id);
    if (!cached) return;
    if (cached.text === headText) {
      clearDraft(screenplay.id);
      return;
    }
    const when = new Date(cached.savedAt).toLocaleString();
    const yes = window.confirm(
      `Unsaved draft from ${when} found. Restore it?\n\n(Cancel to discard and load the saved head version.)`,
    );
    if (yes) {
      setText(cached.text);
      setInitialEditorText(cached.text);
      setDirty(true);
    } else {
      clearDraft(screenplay.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror text changes into localStorage with a small debounce.
  useEffect(() => {
    if (!dirty) return;
    const id = window.setTimeout(() => {
      writeDraft(screenplay.id, text);
    }, 400);
    return () => window.clearTimeout(id);
  }, [text, dirty, screenplay.id]);

  const handleEditorChange = useCallback(
    (value: string) => {
      setText(value);
      setDirty(value !== headText);
    },
    [headText],
  );

  const headWordCount = useMemo(() => headVersion?.wordCount ?? 0, [headVersion]);
  const headPages = useMemo(
    () => headVersion?.pageCountEstimate ?? 0,
    [headVersion],
  );

  async function saveDraft() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/screenplays/${screenplay.id}/versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fountainText: text }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Save failed (${r.status})`);
      }
      const data = (await r.json()) as {
        version: ScreenplayVersion;
        scenes: ScreenplayScene[];
      };
      setScenes(data.scenes);
      setVersions((prev) => [data.version, ...prev.map((v) => ({ ...v, isHead: false }))]);
      setDirty(false);
      clearDraft(screenplay.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function updateMeta(patch: { title?: string; format?: ScreenplayFormat; status?: ScreenplayStatus }) {
    setSavingMeta(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/screenplay`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Update failed (${r.status})`);
      }
      const data = (await r.json()) as { screenplay: Screenplay };
      setMeta(data.screenplay);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSavingMeta(false);
    }
  }

  async function restoreVersion(versionId: string) {
    if (!window.confirm('Restore this version as a new head?')) return;
    setRestoring(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/screenplays/${screenplay.id}/versions/${versionId}/restore`,
        { method: 'POST' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Restore failed (${r.status})`);
      }
      // Easiest: ask Next to re-render the server page.
      clearDraft(screenplay.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  function jumpToScene(scene: ScreenplayScene) {
    const sceneNumber = scene.sceneNumber;
    const lines = text.split('\n');
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (
        /^\s*(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\/EXT|EXT\/INT|I\/E\.?|INT\.?|EXT\.?|EST\.?)\b/i.test(
          lines[i],
        )
      ) {
        count += 1;
        if (count === sceneNumber) {
          editorRef.current?.scrollToLine(i + 1);
          return;
        }
      }
    }
  }

  if (focused) {
    return (
      <div data-testid="screenplay-focused" className="space-y-3">
        {/* Minimal focused-mode bar — exit + save only, everything else hidden. */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setFocused(false)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-2 text-text-secondary hover:text-text-primary hover:border-accent/60 transition"
            title="Exit focused mode (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Exit focus
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-text-tertiary tabular-nums">
              {scenes.length} scenes
              {dirty && <span className="ml-2 text-warning">· unsaved</span>}
            </span>
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-accent/60 bg-accent/20 text-text-primary hover:bg-accent/30 disabled:opacity-50 transition"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save draft'}
            </button>
          </div>
        </div>

        {/* Centered, widened editor column — no rail, no header chrome. */}
        <div className="mx-auto max-w-3xl">
          <ScreenplayEditor
            ref={editorRef}
            initialText={initialEditorText}
            onChange={handleEditorChange}
            height="calc(100vh - 12rem)"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mx-auto max-w-3xl rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger"
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <FileText className="w-4 h-4 text-text-secondary" />
          <input
            type="text"
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            onBlur={() => {
              if (meta.title !== screenplay.title && meta.title.trim().length > 0) {
                void updateMeta({ title: meta.title.trim() });
              }
            }}
            disabled={savingMeta}
            className="flex-1 min-w-[200px] bg-transparent text-lg font-semibold text-text-primary border-b border-transparent hover:border-border-subtle focus:border-accent outline-none"
          />
          <select
            value={meta.format}
            onChange={(e) => {
              const next = e.target.value as ScreenplayFormat;
              setMeta({ ...meta, format: next });
              void updateMeta({ format: next });
            }}
            disabled={savingMeta}
            className="text-xs px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary"
          >
            {SCREENPLAY_FORMATS.map((f) => (
              <option key={f.format} value={f.format}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={meta.status}
            onChange={(e) => {
              const next = e.target.value as ScreenplayStatus;
              setMeta({ ...meta, status: next });
              void updateMeta({ status: next });
            }}
            disabled={savingMeta}
            className="text-xs px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary"
          >
            {SCREENPLAY_STATUSES.map((s) => (
              <option key={s.status} value={s.status}>
                {s.label}
              </option>
            ))}
          </select>
          <ScreenplayVersionHistory
            projectId={projectId}
            screenplayId={screenplay.id}
            versions={versions}
            onRestore={restoreVersion}
            restoring={restoring}
          />
          <button
            type="button"
            onClick={() => setFocused(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border-subtle bg-surface-0 text-text-secondary hover:text-text-primary hover:border-accent/60 transition"
            title="Focused mode — distraction-free writing"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Focus
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-accent/60 bg-accent/20 text-text-primary hover:bg-accent/30 disabled:opacity-50 transition"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-text-secondary">
          <span>
            v{headVersion?.versionNumber ?? 1}
            {dirty && (
              <span className="ml-2 text-warning">· unsaved changes</span>
            )}
          </span>
          <span>{headWordCount.toLocaleString()} words</span>
          <span>~{headPages.toFixed(1)} pages</span>
          <span>{scenes.length} scenes</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ScreenplayEditor
            ref={editorRef}
            initialText={initialEditorText}
            onChange={handleEditorChange}
          />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <ScreenplaySceneList scenes={scenes} onJumpToScene={jumpToScene} />
          <ScreenplayCharacterStats scenes={scenes} />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger"
        >
          {error}
        </div>
      )}
    </div>
  );
}
