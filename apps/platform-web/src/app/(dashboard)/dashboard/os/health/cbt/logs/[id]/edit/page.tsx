import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getCbtLog,
} from '@/lib/agentic-os/health/repo';
import { CbtLogEditor } from '@/components/agentic-os/health/cbt/cbt-log-editor';

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

export default async function EditCbtLogPage({ params }: PageProps) {
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
        href={`/dashboard/os/health/cbt/logs/${log.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to log
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Pencil className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">
          Edit · {KIND_LABELS[log.kind] ?? log.kind}
        </h1>
      </div>
      <p className="text-xs text-[#94a3b8] mb-5">
        Saved edits re-run the crisis-language guard. Risk flags surface
        on the Health OS hub.
      </p>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <CbtLogEditor log={log} />
      </div>
    </div>
  );
}
