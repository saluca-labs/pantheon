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
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CBT
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <ListChecks className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">CBT logs</h1>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <FilterChip
          label="All"
          href="/dashboard/os/health/cbt/logs"
          active={!kind}
        />
        {(CBT_KIND_VALUES as readonly string[]).map((k) => (
          <FilterChip
            key={k}
            label={KIND_LABELS[k] ?? k}
            href={`/dashboard/os/health/cbt/logs?kind=${k}`}
            active={kind === k}
          />
        ))}
      </div>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <CbtLogList logs={logs} />
      </div>
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  const cls = active
    ? 'border-[#4361EE] bg-[#4361EE]/15 text-white'
    : 'border-[#2a2d3e] bg-[#0f1117] text-[#cbd5e1] hover:border-[#4361EE]/50';
  return (
    <Link
      href={href}
      className={`text-xs rounded-full border px-3 py-1 transition ${cls}`}
    >
      {label}
    </Link>
  );
}
