import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getJournalEntry,
} from '@/lib/agentic-os/health/repo';
import { JournalEditor } from '@/components/agentic-os/health/journal-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function JournalEntryPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    redirect('/dashboard/os/health/journal');
  }

  const entry = await getJournalEntry(id, user.userId);
  if (!entry) notFound();

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/health/journal"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to journal
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">
          {entry.title || 'Untitled entry'}
        </h1>
      </div>
      <p className="text-xs text-[#94a3b8] mb-6">
        Created {formatDate(entry.createdAt)}
        {entry.updatedAt !== entry.createdAt
          ? ` · updated ${formatDate(entry.updatedAt)}`
          : ''}
      </p>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <JournalEditor
          editingId={entry.id}
          prompt={entry.prompt ?? null}
          initial={{
            title: entry.title,
            body: entry.body,
            promptId: entry.promptId,
          }}
        />
      </div>
    </div>
  );
}
