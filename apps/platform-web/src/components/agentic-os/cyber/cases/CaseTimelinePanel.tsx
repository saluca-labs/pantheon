'use client';

/**
 * CyberSec OS — Case timeline (chronological events) + Add note form.
 *
 * Wave C-2a: the ad-hoc event `<ol>` is replaced with the shared
 * `ActivityFeed` primitive (day-grouped, tone-dotted). The "Add note" form
 * above it is unchanged — same API call, same behavior.
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
import {
  ActivityFeed,
  type ActivityEvent,
  type ActivityTone,
} from '@/components/agentic-os/_shared/views';

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

/** Event kind → ActivityFeed tone — keeps the timeline semantically colored. */
const EVENT_TONE: Record<CaseEventKind, ActivityTone> = {
  note: 'neutral',
  status_change: 'accent',
  alert_attached: 'attention',
  alert_detached: 'neutral',
  evidence_added: 'positive',
  evidence_removed: 'neutral',
  task_added: 'accent',
  task_completed: 'positive',
  task_reopened: 'warning',
  assignment_change: 'accent',
  severity_change: 'warning',
  priority_change: 'warning',
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

  const feedEvents: ActivityEvent[] = events.map((ev) => {
    const Icon = EVENT_ICONS[ev.kind] ?? MessageSquare;
    return {
      id: ev.id,
      occurredAt: ev.createdAt,
      actor: ev.kind.replace(/_/g, ' '),
      summary: ev.body ?? null,
      tone: EVENT_TONE[ev.kind] ?? 'neutral',
      icon: <Icon className="h-4 w-4 text-accent" aria-hidden="true" />,
    };
  });

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
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-3 py-1.5 text-sm transition"
          >
            <Send className="w-4 h-4" />
            {saving ? 'Posting…' : 'Post'}
          </button>
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      </form>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-2">
        <ActivityFeed
          events={feedEvents}
          grouping="day"
          emptyState={{
            title: 'No events recorded yet',
            description:
              'Notes, status changes, and linked alerts will appear here as the case progresses.',
          }}
        />
      </div>
    </div>
  );
}
