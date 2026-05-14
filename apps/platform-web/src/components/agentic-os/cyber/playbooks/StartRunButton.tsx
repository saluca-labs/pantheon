'use client';

/**
 * CyberSec OS — Start-run button.
 *
 * POSTs to /api/.../playbooks/[id]/runs then routes to the new run's wizard.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import type { PlaybookRunDetail } from '@/lib/agentic-os/cyber/playbooks';

export interface StartRunButtonProps {
  playbookId: string;
  disabled?: boolean;
}

export function StartRunButton({ playbookId, disabled }: StartRunButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/cyber/playbooks/${playbookId}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { run } = (await r.json()) as { run: PlaybookRunDetail };
      router.push(`/dashboard/os/cyber/playbooks/${playbookId}/run/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Start failed');
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
      >
        <Play className="w-4 h-4" />
        {busy ? 'Starting…' : 'Start run'}
      </button>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  );
}
