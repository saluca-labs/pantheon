'use client';

/**
 * Filmmaker OS — Storyboard editor.
 *
 * Header (name + status + scene link + description) plus panel grid with
 * reorder arrows. Surfaces "Add panel" + "Export PDF".
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FilePlus, Printer, Trash2 } from 'lucide-react';
import type {
  StoryboardWithPanels,
  StoryboardStatus,
  StoryboardPanel,
} from '@/lib/agentic-os/filmmaker/storyboards';
import { STORYBOARD_STATUS_VALUES } from '@/lib/agentic-os/filmmaker/storyboards';
import type { ScreenplayScene } from '@/lib/agentic-os/filmmaker/screenplays';
import { StoryboardPanelCard } from './StoryboardPanelCard';
import { StoryboardPanelForm, type PanelFormData } from './StoryboardPanelForm';

interface Props {
  projectId: string;
  storyboard: StoryboardWithPanels;
  scenes: ScreenplayScene[];
}

export function StoryboardWorkspace({ projectId, storyboard, scenes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(storyboard.name);
  const [description, setDescription] = useState(storyboard.description ?? '');
  const [status, setStatus] = useState<StoryboardStatus>(storyboard.status);
  const [sceneId, setSceneId] = useState<string | null>(storyboard.sceneId);
  const [savingHeader, setSavingHeader] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPanel, setEditingPanel] = useState<StoryboardPanel | null>(null);
  const [busyPanel, setBusyPanel] = useState<string | null>(null);

  const panels = storyboard.panels;

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function saveHeader() {
    setSavingHeader(true);
    try {
      await fetch(
        `/api/tiresias/agentic-os/filmmaker/storyboards/${storyboard.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: name.trim() || 'Storyboard',
            description: description.trim() === '' ? null : description,
            sceneId,
            status,
          }),
        },
      );
      refresh();
    } finally {
      setSavingHeader(false);
    }
  }

  async function deleteStoryboard() {
    if (!confirm('Delete this storyboard and all its panels?')) return;
    const res = await fetch(
      `/api/tiresias/agentic-os/filmmaker/storyboards/${storyboard.id}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      router.push(
        `/dashboard/os/filmmaker/projects/${projectId}/storyboards`,
      );
    }
  }

  async function addPanel(data: PanelFormData) {
    const res = await fetch(
      `/api/tiresias/agentic-os/filmmaker/storyboards/${storyboard.id}/panels`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageUrl: data.imageUrl,
          cameraAngle: data.cameraAngle,
          cameraMove: data.cameraMove,
          shotSize: data.shotSize,
          description: data.description,
          dialogueExcerpt: data.dialogueExcerpt,
          durationSeconds: data.durationSeconds,
          notes: data.notes,
        }),
      },
    );
    if (res.ok) {
      setShowAdd(false);
      refresh();
    } else {
      const body = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(body?.error ?? 'Failed to add panel');
    }
  }

  async function savePanel(panelId: string, data: PanelFormData) {
    const res = await fetch(
      `/api/tiresias/agentic-os/filmmaker/storyboards/${storyboard.id}/panels/${panelId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    if (res.ok) {
      setEditingPanel(null);
      refresh();
    } else {
      const body = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(body?.error ?? 'Failed to save panel');
    }
  }

  async function deletePanel(panelId: string) {
    if (!confirm('Delete this panel?')) return;
    setBusyPanel(panelId);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/storyboards/${storyboard.id}/panels/${panelId}`,
        { method: 'DELETE' },
      );
      if (res.ok) refresh();
    } finally {
      setBusyPanel(null);
    }
  }

  async function movePanel(panelId: string, toPosition: number) {
    if (toPosition < 1 || toPosition > panels.length) return;
    setBusyPanel(panelId);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/storyboards/${storyboard.id}/panels/${panelId}/move`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toPosition }),
        },
      );
      if (res.ok) refresh();
    } finally {
      setBusyPanel(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="md:col-span-2 block">
            <span className="block text-xs font-medium text-[#94a3b8] uppercase tracking-wide mb-1">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md bg-[#0f1117] border border-[#2a2d3e] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-[#94a3b8] uppercase tracking-wide mb-1">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StoryboardStatus)}
              className="w-full rounded-md bg-[#0f1117] border border-[#2a2d3e] px-3 py-2 text-sm text-white"
            >
              {STORYBOARD_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-[#94a3b8] uppercase tracking-wide mb-1">
            Scene reference (optional)
          </span>
          <select
            value={sceneId ?? ''}
            onChange={(e) => setSceneId(e.target.value === '' ? null : e.target.value)}
            className="w-full rounded-md bg-[#0f1117] border border-[#2a2d3e] px-3 py-2 text-sm text-white"
          >
            <option value="">— No scene linked —</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sceneNumber}. {s.heading}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#94a3b8] uppercase tracking-wide mb-1">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-[#0f1117] border border-[#2a2d3e] px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="flex justify-between items-center pt-1">
          <button
            type="button"
            onClick={deleteStoryboard}
            className="inline-flex items-center gap-1.5 text-xs text-red-400/80 hover:text-red-300 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete storyboard
          </button>
          <div className="flex gap-2">
            <a
              href={`/api/tiresias/agentic-os/filmmaker/storyboards/${storyboard.id}/exports/storyboard.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2d3e] hover:bg-[#0f1117] text-sm text-white/90 px-3 py-2 transition"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </a>
            <button
              type="button"
              onClick={saveHeader}
              disabled={savingHeader}
              className="rounded-md bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium text-sm px-4 py-2 transition"
            >
              {savingHeader ? 'Saving…' : 'Save header'}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[#64748b]">
          Tip — print the PDF for a paper review or share the URL with collaborators.
        </p>
      </div>

      {/* Panels grid */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
          Panels ({panels.length})
        </h2>
        <button
          type="button"
          onClick={() => {
            setShowAdd(true);
            setEditingPanel(null);
          }}
          className="inline-flex items-center gap-2 rounded-md bg-[#4361EE] hover:bg-[#3a56d4] text-white font-medium text-sm px-3 py-2 transition"
        >
          <FilePlus className="w-4 h-4" />
          Add panel
        </button>
      </div>

      {panels.length === 0 && !showAdd ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27] p-8 text-center">
          <Printer className="w-8 h-8 text-[#4361EE]/60 mx-auto mb-3" />
          <p className="text-sm text-[#94a3b8]">
            Add the first beat to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {panels.map((panel, i) => (
            <div
              key={panel.id}
              className={busyPanel === panel.id ? 'opacity-60' : ''}
            >
              {editingPanel?.id === panel.id ? (
                <StoryboardPanelForm
                  initial={panel}
                  onCancel={() => setEditingPanel(null)}
                  onSubmit={(d) => savePanel(panel.id, d)}
                />
              ) : (
                <StoryboardPanelCard
                  panel={panel}
                  isFirst={i === 0}
                  isLast={i === panels.length - 1}
                  onMoveUp={() => movePanel(panel.id, panel.position - 1)}
                  onMoveDown={() => movePanel(panel.id, panel.position + 1)}
                  onEdit={() => {
                    setEditingPanel(panel);
                    setShowAdd(false);
                  }}
                  onDelete={() => deletePanel(panel.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <StoryboardPanelForm
          onCancel={() => setShowAdd(false)}
          onSubmit={addPanel}
        />
      ) : null}
    </div>
  );
}
