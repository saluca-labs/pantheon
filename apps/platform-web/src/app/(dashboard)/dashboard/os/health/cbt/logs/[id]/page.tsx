import Link from 'next/link';
import { ArrowLeft, ListChecks, Pencil } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getCbtLog,
} from '@/lib/agentic-os/health/repo';
import { CbtLogFormatter } from '@/components/agentic-os/health/cbt/formatters';
import { CbtLogDetailTabs } from '@/components/agentic-os/health/cbt/cbt-log-detail-tabs';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

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
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function CbtLogDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    redirect('/dashboard/os/health/cbt');
  }

  const log = await getCbtLog(id, user.userId);
  if (!log) notFound();

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/health/cbt/logs"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All logs
      </Link>

      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <ListChecks className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold text-white truncate">
            {KIND_LABELS[log.kind] ?? log.kind}
          </h1>
        </div>
        <Link
          href={`/dashboard/os/health/cbt/logs/${log.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3 text-text-primary text-xs font-medium px-3 py-1.5 transition"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Link>
      </div>
      <p className="text-xs text-text-secondary mb-5">
        {fmt(log.completedAt ?? log.startedAt)}
      </p>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
        <CbtLogDetailTabs
          moodPanel={
            log.moodBefore !== null || log.moodAfter !== null ? (
              <p className="text-sm text-text-primary">
                before: {log.moodBefore ?? '—'} → after:{' '}
                {log.moodAfter ?? '—'}
              </p>
            ) : undefined
          }
          detailPanel={<CbtLogFormatter log={log} />}
          notesPanel={
            log.notes ? (
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {log.notes}
              </p>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
