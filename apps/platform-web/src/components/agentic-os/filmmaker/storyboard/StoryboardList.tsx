'use client';

/**
 * Filmmaker OS — Storyboard list panel.
 *
 * Lists storyboards for a project and creates new ones inline.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FilePlus, Layers } from 'lucide-react';
import type {
  StoryboardSummary,
  StoryboardStatus,
} from '@/lib/agentic-os/filmmaker/storyboards';
import { STORYBOARD_STATUSES } from '@/lib/agentic-os/filmmaker/storyboards';

interface Props {
  projectId: string;
  initial: StoryboardSummary[];
}

const STATUS_COLOR: Record<StoryboardStatus, string> = Object.fromEntries(
  STORYBOARD_STATUSES.map((s) => [s.status, s.color]),
) as Record<StoryboardStatus, string>;

const STATUS_LABEL: Record<StoryboardStatus, string> = Object.fromEntries(
  STORYBOARD_STATUSES.map((s) => [s.status, s.label]),
) as Record<StoryboardStatus, string>;

export function StoryboardList({ projectId, initial }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createStoryboard() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/storyboards`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: `Storyboard ${initial.length + 1}` }),
        },
      );
      if (res.ok) {
        const { storyboard } = (await res.json()) as { storyboard: { id: string } };
        router.push(
          `/dashboard/os/filmmaker/projects/${projectId}/storyboards/${storyboard.id}`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={createStoryboard}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
        >
          <FilePlus className="w-4 h-4" />
          New storyboard
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27] p-8 text-center">
          <Layers className="w-8 h-8 text-[#4361EE]/60 mx-auto mb-3" />
          <p className="text-sm text-[#94a3b8] mb-4">
            No storyboards yet. Start with the first beat.
          </p>
          <button
            type="button"
            onClick={createStoryboard}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            <FilePlus className="w-4 h-4" />
            Create first storyboard
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {initial.map((sb) => (
            <li key={sb.id}>
              <Link
                href={`/dashboard/os/filmmaker/projects/${projectId}/storyboards/${sb.id}`}
                className="flex items-center justify-between rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4 hover:border-[#4361EE]/60 transition group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-medium text-white group-hover:text-[#4361EE] transition truncate">
                      {sb.name}
                    </p>
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLOR[sb.status]}`}
                    >
                      {STATUS_LABEL[sb.status]}
                    </span>
                  </div>
                  <p className="text-xs text-[#94a3b8]">
                    {sb.panelCount} panel{sb.panelCount === 1 ? '' : 's'}
                    {sb.sceneId ? ' · scene linked' : ''}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#4361EE] transition" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
