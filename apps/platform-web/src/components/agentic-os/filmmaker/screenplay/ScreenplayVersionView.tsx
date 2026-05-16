'use client';

/**
 * Filmmaker OS — ScreenplayVersionView.
 *
 * Read-only render of a historical version with a "Restore as new head"
 * button. Layout matches the editable workspace.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { ScreenplayEditor } from './ScreenplayEditor';
import { ScreenplaySceneList } from './ScreenplaySceneList';
import { ScreenplayCharacterStats } from './ScreenplayCharacterStats';
import type {
  ScreenplayVersion,
  ScreenplayScene,
} from '@/lib/agentic-os/filmmaker/screenplays';

interface Props {
  projectId: string;
  screenplayId: string;
  version: ScreenplayVersion;
  scenes: ScreenplayScene[];
}

export function ScreenplayVersionView({
  projectId,
  screenplayId,
  version,
  scenes,
}: Props) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (!window.confirm('Restore this version as a new head?')) return;
    setRestoring(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/screenplays/${screenplayId}/versions/${version.id}/restore`,
        { method: 'POST' },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Restore failed (${r.status})`);
      }
      router.push(`/dashboard/os/filmmaker/projects/${projectId}/screenplay`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      {!version.isHead && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={restore}
            disabled={restoring}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-accent/60 bg-accent/20 text-white hover:bg-accent/30 disabled:opacity-50 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {restoring ? 'Restoring…' : 'Restore as new head'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ScreenplayEditor initialText={version.fountainText} readOnly />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <ScreenplaySceneList scenes={scenes} />
          <ScreenplayCharacterStats scenes={scenes} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
