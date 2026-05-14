import Link from 'next/link';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listCbtLogs,
  type CbtKindValue,
} from '@/lib/agentic-os/health/repo';
import { CBT_KIND_VALUES } from '@/lib/agentic-os/health/schemas';
import { CbtLogList } from '@/components/agentic-os/health/cbt/cbt-log-list';
import { CbtLogFilter } from '@/components/agentic-os/health/cbt/cbt-log-filter';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ kind?: string }>;
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

function isCbtKind(value: string): value is CbtKindValue {
  return (CBT_KIND_VALUES as readonly string[]).includes(value);
}

export default async function CbtLogsPage({ searchParams }: PageProps) {
  const { kind: rawKind } = await searchParams;
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

  const kind: CbtKindValue | undefined =
    rawKind && isCbtKind(rawKind) ? rawKind : undefined;
  const logs = await listCbtLogs(user.userId, { kind, limit: 100 });

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/health/cbt"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CBT
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <ListChecks className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">CBT logs</h1>
      </div>

      <div className="mb-4">
        <CbtLogFilter
          kinds={(CBT_KIND_VALUES as readonly string[]).map((k) => ({
            value: k,
            label: KIND_LABELS[k] ?? k,
          }))}
          activeKind={kind ?? null}
        />
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <CbtLogList logs={logs} />
      </div>
    </div>
  );
}
