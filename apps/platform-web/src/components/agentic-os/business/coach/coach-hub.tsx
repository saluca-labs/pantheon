/**
 * Business coach hub — mode picker + quick prompts + start-conversation flow +
 * recent sessions sidebar.
 *
 * Scoped by project_id, deal_id, or neither (workshop-scoped). The mode
 * picker defaults to `sales_coach` when scoped to a deal, `business_strategist`
 * when scoped to a project, otherwise `general`.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Send, Sparkles } from 'lucide-react';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  type CoachMode,
} from '@/lib/agentic-os/business/coach/modes';
import { CoachModePicker } from './coach-mode-picker';
import { CoachQuickPrompts } from './coach-quick-prompts';

export interface HubSession {
  id: string;
  title: string;
  mode: CoachMode;
  projectId: string | null;
  dealId: string | null;
  updatedAt: string;
}

interface Props {
  projectId?: string | null;
  dealId?: string | null;
  initialMode?: CoachMode;
  sessions: HubSession[];
}

export function CoachHub({ projectId, dealId, initialMode, sessions }: Props) {
  const router = useRouter();
  const defaultMode: CoachMode =
    initialMode ??
    (dealId ? 'sales_coach' : projectId ? 'business_strategist' : 'general');
  const [mode, setMode] = useState<CoachMode>(defaultMode);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStart = true; // All modes work without a project/deal

  async function start(message: string) {
    if (submitting) return;
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch(
        `/api/tiresias/agentic-os/business/coach/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            project_id: projectId ?? null,
            deal_id: dealId ?? null,
            initial_message: message,
          }),
        },
      );
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${createRes.status}`);
      }
      const { session } = await createRes.json();

      // Send the first user message + drain the assistant stream so it
      // persists before we navigate.
      const chatRes = await fetch(
        `/api/tiresias/agentic-os/business/coach/sessions/${session.id}/messages`,
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
      if (chatRes.body) {
        const reader = chatRes.body.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      router.push(`/dashboard/os/business/coach/${session.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Recent sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">
            No sessions yet. Pick a mode and start one.
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/dashboard/os/business/coach/${s.id}`}
                  className="block rounded-lg px-3 py-2 text-sm text-[#cbd5e1] hover:bg-[#0f1117] hover:text-white transition"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 shrink-0 text-[#64748b]" />
                    <span className="truncate">
                      {s.title || 'Untitled session'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] uppercase tracking-wide text-amber-300">
                      {COACH_MODE_LABELS[s.mode]}
                    </span>
                    <span className="text-[10px] text-[#64748b]">
                      {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <h2 className="text-base font-semibold text-white">
            Start a session
          </h2>
        </div>

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
            Quick prompts
          </p>
          <CoachQuickPrompts
            mode={mode}
            onPick={(p) => void start(p)}
            disabled={submitting}
          />
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
            className="flex-1 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-white placeholder:text-[#64748b] px-3 py-2 focus:outline-none focus:border-amber-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium px-3 py-2 disabled:opacity-50"
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
      </section>
    </div>
  );
}
