/**
 * Autobiographer OS — Coach hub.
 *
 * Lists recent sessions, exposes the 4-mode picker + per-mode quick
 * prompts + free-form start input, and renders the 503-aware
 * not-configured banner when `ANTHROPIC_API_KEY` is missing.
 *
 * Optional `?book_id=…&mode=…` query params pre-select a book and
 * mode (the book-detail page Coach CTA links here with both set).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listSessions } from '@/lib/agentic-os/autobiographer/coach/sessions-repo';
import {
  isCoachMode,
  type CoachMode,
} from '@/lib/agentic-os/autobiographer/coach/modes';
import { isCoachConfigured } from '@/lib/agentic-os/autobiographer/coach/anthropic';
import { CoachHub } from '@/components/agentic-os/autobiographer/coach/coach-hub';
import { CoachNotConfiguredBanner } from '@/components/agentic-os/autobiographer/coach/coach-not-configured-banner';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ book_id?: string; mode?: string }>;
}

export default async function AutobiographerCoachHubPage({
  searchParams,
}: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const bookId =
    typeof sp.book_id === 'string' && sp.book_id ? sp.book_id : null;
  const initialMode: CoachMode | undefined = isCoachMode(sp.mode)
    ? sp.mode
    : undefined;

  const configured = isCoachConfigured();
  const sessions = configured
    ? await listSessions({
        userId: user.userId,
        bookId: bookId ?? undefined,
        limit: 30,
      })
    : [];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Autobiographer Coach</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-6 leading-relaxed">
        Memoir-aware AI coach across four modes — interviewer (elicits
        new memories), chapter drafter (ghostwrites a paragraph at a
        time with citations), narrative critic (structural pacing /
        arc / voice-drift critique), and a general stuck-author
        conversation partner. The drafter never invents content;
        every paragraph cites a source memory.
      </p>

      {!configured ? (
        <CoachNotConfiguredBanner />
      ) : (
        <CoachHub
          bookId={bookId}
          initialMode={initialMode}
          sessions={sessions.map((s) => ({
            id: s.id,
            title: s.title,
            mode: s.mode,
            bookId: s.bookId,
            updatedAt: s.updatedAt,
          }))}
        />
      )}
    </div>
  );
}
