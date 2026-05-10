import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getJournalPrompt,
} from '@/lib/agentic-os/health/repo';
import { JournalEditor } from '@/components/agentic-os/health/journal-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ prompt?: string }>;
}

export default async function NewJournalEntryPage({ searchParams }: PageProps) {
  const params = await searchParams;
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

  const prompt = params.prompt ? await getJournalPrompt(params.prompt) : null;

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/health/journal"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to journal
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">New entry</h1>
      </div>

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <JournalEditor prompt={prompt} />
      </div>
    </div>
  );
}
