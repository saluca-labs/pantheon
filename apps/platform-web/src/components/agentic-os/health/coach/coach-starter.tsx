'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Send } from 'lucide-react';

const STARTERS = [
  'How am I doing this week?',
  'What should I eat today?',
  'I had a tough day.',
  'Plan a workout for tomorrow.',
];

export function CoachStarter() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(message: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/tiresias/agentic-os/health/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${r.status}`);
      }
      const id = r.headers.get('x-coach-conversation-id');
      // Wave-0: route returns JSON; drain so persistence completes.
      await r.json().catch(() => null);
      if (id) {
        router.push(`/dashboard/os/health/coach/${id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={submitting}
            onClick={() => send(s)}
            className="text-left text-sm text-text-primary rounded-lg border border-border-subtle bg-surface-0 hover:border-[#3b4252] hover:bg-[#161823] transition px-3 py-2 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send(text.trim());
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
          placeholder="Or type your own…"
          rows={2}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-[#64748b] px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a55d6] text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
