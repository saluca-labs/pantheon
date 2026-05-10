import Link from 'next/link';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listJournalEntries,
  listJournalPrompts,
} from '@/lib/agentic-os/health/repo';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { PromptPicker } from '@/components/agentic-os/health/prompt-picker';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function HealthJournalPage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    return (
      <div className="max-w-3xl">
        <Link
          href="/dashboard/os/health"
          className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Health OS
        </Link>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
          <h1 className="text-lg font-semibold text-amber-50 mb-2">
            Mental-health consent required
          </h1>
          <p className="leading-relaxed">
            Journaling is a mental-health feature and is gated behind your
            explicit consent. Grant the “mental” scope on the{' '}
            <Link
              href="/dashboard/os/health"
              className="underline hover:text-amber-50"
            >
              Health OS hub
            </Link>{' '}
            to continue.
          </p>
        </div>
      </div>
    );
  }

  const [entries, prompts] = await Promise.all([
    listJournalEntries(user.userId, { withPrompt: true, limit: 50 }),
    listJournalPrompts(),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-[#4361EE]" />
          <h1 className="text-2xl font-semibold text-white">Journal</h1>
        </div>
        <Link
          href="/dashboard/os/health/journal/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white text-sm font-medium px-3 py-2 transition"
        >
          <Plus className="w-4 h-4" />
          New entry
        </Link>
      </div>

      <CaveatBlock />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,360px)] gap-4">
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
          <h2 className="text-base font-semibold text-white mb-3">
            Recent entries
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">
              No entries yet. Pick a prompt or start from a blank page using
              the “New entry” button above.
            </p>
          ) : (
            <ul className="divide-y divide-[#2a2d3e]">
              {entries.map((e) => (
                <li key={e.id} className="py-3">
                  <Link
                    href={`/dashboard/os/health/journal/${e.id}`}
                    className="block group"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-medium text-white group-hover:text-[#4361EE] transition truncate">
                        {e.title || 'Untitled entry'}
                      </h3>
                      <span className="text-xs text-[#94a3b8] shrink-0">
                        {formatDate(e.entryAt)}
                      </span>
                    </div>
                    {e.prompt && (
                      <div className="text-[10px] uppercase tracking-wide text-[#4361EE] mt-0.5">
                        {e.prompt.category.replace(/-/g, ' ')}
                      </div>
                    )}
                    <p className="text-xs text-[#94a3b8] mt-1 line-clamp-2 leading-relaxed">
                      {e.body}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <PromptPicker prompts={prompts} />
        </div>
      </div>
    </div>
  );
}
