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
import { JournalEntryBrowser } from '@/components/agentic-os/health/journal/journal-entry-browser';

export const dynamic = 'force-dynamic';

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
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
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
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold text-white">Journal</h1>
        </div>
        <Link
          href="/dashboard/os/health/journal/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a56d4] text-white text-sm font-medium px-3 py-2 transition"
        >
          <Plus className="w-4 h-4" />
          New entry
        </Link>
      </div>

      <CaveatBlock />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,360px)] gap-4">
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
          <h2 className="text-base font-semibold text-white mb-3">
            Recent entries
          </h2>
          <JournalEntryBrowser
            entries={entries.map((e) => ({
              id: e.id,
              title: e.title,
              body: e.body,
              entryAt: e.entryAt,
              prompt: e.prompt ? { category: e.prompt.category } : null,
            }))}
          />
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
          <PromptPicker prompts={prompts} />
        </div>
      </div>
    </div>
  );
}
