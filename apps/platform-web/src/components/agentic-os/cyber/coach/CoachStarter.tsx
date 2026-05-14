'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Send } from 'lucide-react';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  COACH_MODE_STARTERS,
  type CoachMode,
} from '@/lib/agentic-os/cyber/coach/modes';
import { CoachModePicker } from './CoachModePicker';
import { CaseScopePicker, type CaseScopeOption } from './CaseScopePicker';

interface Props {
  initialMode?: CoachMode;
  initialCase?: CaseScopeOption | null;
}

export function CoachStarter({
  initialMode = 'general',
  initialCase = null,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<CoachMode>(initialMode);
  const [caseScope, setCaseScope] = useState<CaseScopeOption | null>(initialCase);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(message: string) {
    if (submitting || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch(
        `/api/tiresias/agentic-os/cyber/coach/conversations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            caseId: caseScope?.id ?? null,
          }),
        },
      );
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${createRes.status}`);
      }
      const { conversation } = await createRes.json();

      const chatRes = await fetch(
        `/api/tiresias/agentic-os/cyber/coach/conversations/${conversation.id}/chat`,
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
      router.push(`/dashboard/os/cyber/coach/${conversation.id}`);
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
        <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">
          Mode
        </p>
        <CoachModePicker value={mode} onChange={setMode} disabled={submitting} />
        <p className="text-xs text-[#94a3b8] mt-2 leading-relaxed">
          <span className="font-medium text-[#cbd5e1]">{COACH_MODE_LABELS[mode]}.</span>{' '}
          {COACH_MODE_DESCRIPTIONS[mode]}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">
          Case scope
        </p>
        <CaseScopePicker
          value={caseScope}
          onChange={setCaseScope}
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            disabled={submitting}
            onClick={() => start(s)}
            className="text-left text-sm text-[#cbd5e1] rounded-lg border border-[#2a2d3e] bg-[#0f1117] hover:border-[#3b4252] hover:bg-[#161823] transition px-3 py-2 disabled:opacity-50"
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
          className="flex-1 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-white placeholder:text-[#64748b] px-3 py-2 focus:outline-none focus:border-red-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
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
