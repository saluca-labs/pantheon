'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw } from 'lucide-react';

export function RegeneratePlanButton({ hasPlan }: { hasPlan: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/meditation/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? 'Generate failed');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={submitting}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 text-white text-sm font-medium px-3 py-2 transition"
      >
        <RefreshCcw className="w-4 h-4" />
        {submitting ? 'Generating…' : hasPlan ? 'Regenerate' : 'Generate plan'}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
