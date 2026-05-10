import { DataTable } from '@/components/agentic-os/_shared/data-table';
import type { CbtLog } from '@/lib/agentic-os/health/repo';

const KIND_LABELS: Record<string, string> = {
  'thought-record': 'Thought record',
  'behavioral-activation': 'Behavioral activation',
  'worry-time': 'Worry time',
  'grounding-54321': '5-4-3-2-1 grounding',
  gratitude: 'Three good things',
  'values-clarification': 'Values clarification',
  'sleep-hygiene': 'Sleep hygiene',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMoodDelta(log: CbtLog): string {
  if (log.moodBefore === null || log.moodAfter === null) return '—';
  const delta = log.moodAfter - log.moodBefore;
  const sign = delta > 0 ? '+' : '';
  return `${log.moodBefore} → ${log.moodAfter} (${sign}${delta})`;
}

export function CbtLogList({ logs }: { logs: CbtLog[] }) {
  return (
    <DataTable
      rows={logs}
      empty="No CBT logs yet. Pick an exercise to get started."
      rowHref={(log) => `/dashboard/os/health/cbt/logs/${log.id}`}
      columns={[
        {
          label: 'Exercise',
          render: (log) => KIND_LABELS[log.kind] ?? log.kind,
        },
        {
          label: 'When',
          render: (log) => fmt(log.completedAt ?? log.startedAt),
        },
        {
          label: 'Mood',
          render: (log) => formatMoodDelta(log),
          className: 'hidden sm:table-cell',
        },
      ]}
    />
  );
}
