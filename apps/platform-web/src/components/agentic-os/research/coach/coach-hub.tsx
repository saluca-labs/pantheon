/**
 * Research coach hub — mode picker + quick prompts + start flow + recent
 * sessions sidebar.
 *
 * Experiment-scoped (when `experimentId` is set) or workshop-scoped. The
 * mode picker defaults to `methods_advisor` when scoped to an experiment,
 * otherwise to `general`. `methods_advisor` REQUIRES an experiment — the
 * start button is disabled with an explanation when that mode is selected
 * but no experiment is bound.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import {
  COACH_MODE_DESCRIPTIONS,
  COACH_MODE_LABELS,
  modeRequiresExperiment,
  type CoachMode,
} from '@/lib/agentic-os/research/coach/modes';
import { CoachModePicker } from './coach-mode-picker';
import { CoachQuickPrompts } from './coach-quick-prompts';
import { CoachSessionList } from './coach-session-list';
import type { CoachSessionCardProps } from './coach-session-card';

interface Props {
  experimentId?: string | null;
  initialMode?: CoachMode;
  sessions: CoachSessionCardProps[];
}

export function CoachHub({ experimentId, initialMode, sessions }: Props) {
  const router = useRouter();
  const defaultMode: CoachMode =
    initialMode ?? (experimentId ? 'methods_advisor' : 'general');
  const [mode, setMode] = useState<CoachMode>(defaultMode);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresExperiment = modeRequiresExperiment(mode);
  const canStart = !requiresExperiment || !!experimentId;

  async function start(message: string) {
    if (submitting) return;
    if (!message.trim()) return;
    if (!canStart) {
      setError(
        `${COACH_MODE_LABELS[mode]} mode requires an experiment scope. Open an experiment first, then pick this mode.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch(
        `/api/tiresias/agentic-os/research/coach/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            experiment_id: experimentId ?? null,
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
        `/api/tiresias/agentic-os/research/coach/sessions/${session.id}/messages`,
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
      // Wave-0: route returns JSON now; drain to complete persistence.
      await chatRes.json().catch(() => null);
      router.push(`/dashboard/os/research/coach/${session.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside className="rounded-xl border border-border-subtle bg-surface-2 p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Recent sessions</h2>
        <CoachSessionList sessions={sessions} />
      </aside>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <h2 className="text-base font-semibold text-white">
            Start a session
          </h2>
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

        {!canStart && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <strong>{COACH_MODE_LABELS[mode]}</strong> mode reads a specific
            experiment. Open an experiment and click its Coach CTA to scope
            the session.
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            Quick prompts
          </p>
          <CoachQuickPrompts
            mode={mode}
            onPick={(p) => void start(p)}
            disabled={submitting || !canStart}
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
            disabled={submitting || !canStart}
            placeholder="Or type your own…"
            rows={2}
            className="flex-1 rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-tertiary px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting || !text.trim() || !canStart}
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
      </section>
    </div>
  );
}
