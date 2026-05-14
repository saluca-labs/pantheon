/**
 * Creator coach hub — mode picker + quick prompts + start-session flow +
 * recent sessions sidebar with archive/delete.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Send, Sparkles, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  COACH_MODE_STARTERS,
  type CoachMode,
} from '@/lib/agentic-os/creator/coach/modes';
import { CoachModePicker } from './coach-mode-picker';

export interface HubSession {
  id: string;
  title: string;
  mode: CoachMode;
  model: string;
  archivedAt: string | null;
  updatedAt: string;
}

interface Props {
  initialMode?: CoachMode;
  sessions: HubSession[];
}

export function CoachHub({ initialMode, sessions }: Props) {
  const router = useRouter();
  const defaultMode: CoachMode = initialMode ?? 'general';
  const [mode, setMode] = useState<CoachMode>(defaultMode);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSessions = sessions.filter((s) => s.archivedAt == null);
  const archivedSessions = sessions.filter((s) => s.archivedAt != null);

  async function start(message: string) {
    if (submitting) return;
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch(
        `/api/tiresias/agentic-os/creator/coach/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
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
      const streamRes = await fetch(
        `/api/tiresias/agentic-os/creator/coach/sessions/${session.id}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        },
      );
      if (!streamRes.ok) {
        const body = await streamRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${streamRes.status}`);
      }
      // Wave-0: JSON response now; drain to complete persistence.
      await streamRes.json().catch(() => null);
      router.push(`/dashboard/os/creator/coach/${session.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleArchiveSession(sessionId: string) {
    const r = await fetch(
      `/api/tiresias/agentic-os/creator/coach/sessions/${sessionId}/archive`,
      { method: 'POST' },
    );
    if (r.ok) {
      router.refresh();
    }
  }

  async function deleteSessionById(sessionId: string) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/creator/coach/sessions/${sessionId}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      router.refresh();
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside className="rounded-xl border border-border-subtle bg-surface-2 p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
        <h2 className="text-sm font-semibold text-white mb-3">Sessions</h2>
        {activeSessions.length === 0 ? (
          <p className="text-xs text-text-secondary">
            No sessions yet. Pick a mode and start one.
          </p>
        ) : (
          <ul className="space-y-1">
            {activeSessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/dashboard/os/creator/coach/${s.id}`}
                  className="block rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-surface-0 hover:text-white transition"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 shrink-0 text-[#64748b]" />
                    <span className="truncate">{s.title || 'Untitled'}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] uppercase tracking-wide text-fuchsia-300">
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

        {archivedSessions.length > 0 && (
          <>
            <h3 className="text-xs font-semibold text-[#64748b] mt-4 mb-2 uppercase tracking-wide">
              Archived
            </h3>
            <ul className="space-y-1">
              {archivedSessions.map((s) => (
                <li key={s.id} className="group flex items-center gap-1">
                  <Link
                    href={`/dashboard/os/creator/coach/${s.id}`}
                    className="flex-1 block rounded-lg px-3 py-1.5 text-xs text-[#64748b] hover:bg-surface-0 hover:text-text-primary transition truncate"
                  >
                    {s.title || 'Untitled'}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-fuchsia-400" />
          <h2 className="text-base font-semibold text-white">Start a session</h2>
        </div>

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

        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            Quick prompts
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COACH_MODE_STARTERS[mode].map((s) => (
              <button
                key={s}
                type="button"
                disabled={submitting}
                onClick={() => void start(s)}
                className="text-left text-sm text-text-primary rounded-lg border border-border-subtle bg-surface-0 hover:border-[#3b4252] hover:bg-[#161823] transition px-3 py-2 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
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
            className="flex-1 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-[#64748b] px-3 py-2 focus:outline-none focus:border-fuchsia-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-600 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
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
