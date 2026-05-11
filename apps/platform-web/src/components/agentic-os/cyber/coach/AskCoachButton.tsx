'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

interface Props {
  caseId: string;
  children: ReactNode;
}

/**
 * Spawns a new responder-mode conversation scoped to the given case and
 * routes the user to it. Used from the case detail page so an analyst
 * can pivot to the coach with one click.
 */
export function AskCoachButton({ caseId, children }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function start() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/tiresias/agentic-os/cyber/coach/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'responder', caseId }),
      });
      if (!r.ok) {
        setSubmitting(false);
        return;
      }
      const { conversation } = await r.json();
      router.push(`/dashboard/os/cyber/coach/${conversation.id}`);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={submitting}
      className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
