import Link from 'next/link';
import { HeartPulse } from 'lucide-react';
import type { MoodEntry } from '@/lib/agentic-os/health/repo';
import { DataTable } from '@/components/agentic-os/_shared/data-table';
import { EmptyState } from '@/components/agentic-os/_shared/views';

interface Props {
  entries: MoodEntry[];
  /** Show a link to /mood/[id] on each row. */
  linkPrefix?: string;
}

function formatScore(value: number | null): string {
  return value === null || value === undefined ? '—' : `${value}/10`;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function MoodEntryList({ entries, linkPrefix }: Props) {
  return (
    <DataTable<MoodEntry>
      rows={entries}
      empty={
        <EmptyState
          variant="bare"
          icon={<HeartPulse className="h-6 w-6" />}
          title="No mood entries yet"
          description="Log your first check-in above and your trail will start here."
        />
      }
      rowKey={(r) => r.id}
      rowHref={
        linkPrefix ? (r) => `${linkPrefix}/${r.id}` : undefined
      }
      columns={[
        {
          label: 'When',
          render: (r) => (
            <span className="text-white">{relativeDate(r.entryAt)}</span>
          ),
        },
        {
          label: 'Mood',
          render: (r) => formatScore(r.moodScore),
        },
        {
          label: 'Energy',
          render: (r) => formatScore(r.energyScore),
        },
        {
          label: 'Anxiety',
          render: (r) => formatScore(r.anxietyScore),
        },
        {
          label: 'Tags',
          className: 'hidden sm:table-cell',
          render: (r) => (
            <span className="flex flex-wrap gap-1">
              {(r.tags ?? []).map((t) => (
                <span
                  key={t.id}
                  className="text-[10px] rounded-full border border-border-subtle bg-surface-0 px-2 py-0.5 text-text-secondary"
                >
                  {t.name}
                </span>
              ))}
              {(r.tags ?? []).length === 0 && (
                <span className="text-text-secondary/70">—</span>
              )}
            </span>
          ),
        },
      ]}
    />
  );
}

/**
 * Lightweight inline link variant — used on the mood index page when the
 * full-table view is overkill.
 */
export function MoodEntryListInline({ entries }: { entries: MoodEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        variant="bare"
        icon={<HeartPulse className="h-6 w-6" />}
        title="No mood entries yet"
        description="Log your first check-in above and your trail will start here."
      />
    );
  }
  return (
    <ul className="divide-y divide-border-subtle">
      {entries.map((e) => (
        <li
          key={e.id}
          className="py-3 flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="text-sm text-white">
              {relativeDate(e.entryAt)} · Mood {formatScore(e.moodScore)} ·
              Energy {formatScore(e.energyScore)} · Anxiety{' '}
              {formatScore(e.anxietyScore)}
            </div>
            {e.notes && (
              <p className="text-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                {e.notes}
              </p>
            )}
            {(e.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(e.tags ?? []).map((t) => (
                  <span
                    key={t.id}
                    className="text-[10px] rounded-full border border-border-subtle bg-surface-0 px-2 py-0.5 text-text-secondary"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Link
            href={`/dashboard/os/health/journal/new?mood=${e.id}`}
            className="text-xs text-accent hover:text-[#5d7aff] transition shrink-0"
          >
            Add journal →
          </Link>
        </li>
      ))}
    </ul>
  );
}
