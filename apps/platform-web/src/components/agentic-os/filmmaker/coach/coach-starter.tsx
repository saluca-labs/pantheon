'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Send } from 'lucide-react';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  COACH_MODE_STARTERS,
  type CoachMode,
} from '@/lib/agentic-os/filmmaker/coach/modes';
import { CoachModePicker } from './coach-mode-picker';

interface Props {
  projectId: string;
  initialMode?: CoachMode;
}

export function CoachStarter({ projectId, initialMode = 'general' }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<CoachMode>(initialMode);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(message: string) {
    if (submitting || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/coach/conversations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        },
      );
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${createRes.status}`);
      }
      const { conversation } = await createRes.json();

      const chatRes = await fetch(
        `/api/tiresias/agentic-os/filmmaker/coach/conversations/${conversation.id}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        },
      );
      if (!chatRes.ok) {
        const body = await chatRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${chatRes.status}`);
      }
      // Wave-0: JSON response now; drain to complete persistence.
      await chatRes.json().catch(() => null);
      router.push(
        `/dashboard/os/filmmaker/projects/${projectId}/coach/${conversation.id}`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const starters = COACH_MODE_STARTERS[mode];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Mode
        </p>
        <CoachModePicker value={mode} onChange={setMode} disabled={submitting} />
        <p className="text-xs text-text-secondary mt-2 leading-relaxed">
          <span className="font-medium text-text-primary">{COACH_MODE_LABELS[mode]}.</span>{' '}
          {COACH_MODE_DESCRIPTIONS[mode]}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            disabled={submitting}
            onClick={() => start(s)}
            className="text-left text-sm text-text-primary rounded-lg border border-border-subtle bg-surface-0 hover:border-border-strong hover:bg-surface-1 transition px-3 py-2 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void start(text.trim());
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
          placeholder="Or type your own…"
          rows={2}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-tertiary px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}
    </div>
  );
}
