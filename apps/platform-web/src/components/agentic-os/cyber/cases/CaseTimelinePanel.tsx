'use client';

/**
 * CyberSec OS — Case timeline (chronological events) + Add note form.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  GitBranch,
  Link2,
  FileText,
  CheckSquare,
  UserCheck,
  TrendingUp,
  Flag,
  Send,
} from 'lucide-react';
import type { CaseEvent, CaseEventKind } from '@/lib/agentic-os/cyber/cases';

const EVENT_ICONS: Record<CaseEventKind, typeof MessageSquare> = {
  note: MessageSquare,
  status_change: GitBranch,
  alert_attached: Link2,
  alert_detached: Link2,
  evidence_added: FileText,
  evidence_removed: FileText,
  task_added: CheckSquare,
  task_completed: CheckSquare,
  task_reopened: CheckSquare,
  assignment_change: UserCheck,
  severity_change: TrendingUp,
  priority_change: Flag,
};

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

export interface CaseTimelinePanelProps {
  caseId: string;
  events: CaseEvent[];
}

export function CaseTimelinePanel({ caseId, events }: CaseTimelinePanelProps) {
  const router = useRouter();
  const [noteBody, setNoteBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!noteBody.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/cyber/cases/${caseId}/events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: noteBody.trim() }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setNoteBody('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-2"
      >
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Add note</span>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={2}
            placeholder="Observation, hypothesis, hand-off note…"
            className={inputCls + ' resize-y leading-relaxed'}
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || !noteBody.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 text-white font-medium px-3 py-1.5 text-sm transition"
          >
            <Send className="w-4 h-4" />
            {saving ? 'Posting…' : 'Post'}
          </button>
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      </form>

      {events.length === 0 ? (
        <p className="text-sm text-text-secondary p-6 rounded-xl border border-dashed border-border-subtle">
          No events recorded yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {events.map((ev) => {
            const Icon = EVENT_ICONS[ev.kind] ?? MessageSquare;
            return (
              <li
                key={ev.id}
                className="rounded-xl border border-border-subtle bg-surface-2 p-3"
              >
                <div className="flex items-start gap-2">
                  <Icon className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-primary">
                        {ev.kind.replace(/_/g, ' ')}
                      </span>
                      {ev.author && (
                        <span className="text-[11px] text-text-secondary">
                          · {ev.author}
                        </span>
                      )}
                      <span className="text-[11px] text-text-secondary ml-auto">
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {ev.body && (
                      <p className="text-sm text-white mt-1 whitespace-pre-wrap break-words">
                        {ev.body}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
