import Link from 'next/link';
import { ArrowLeft, MessageCircle, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { listConversations } from '@/lib/agentic-os/health/coach/repo';
import { isCoachConfigured } from '@/lib/agentic-os/health/coach/anthropic';
import { CaveatBlock } from '@/components/agentic-os/health/caveat-block';
import { CoachStarter } from '@/components/agentic-os/health/coach/coach-starter';
import { CoachConfigNotice } from '@/components/agentic-os/health/coach/coach-config-notice';
import { EmptyState } from '@/components/agentic-os/_shared/views';

export const dynamic = 'force-dynamic';

export default async function HealthCoachIndexPage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const configured = isCoachConfigured();
  const conversations = configured
    ? await listConversations({
        tenantId: user.tenantId,
        userId: user.userId,
        limit: 50,
      })
    : [];

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/health"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Health OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">AI coach</h1>
      </div>

      <CaveatBlock />

      {!configured ? (
        <div className="mt-6">
          <CoachConfigNotice />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
          <aside className="rounded-xl border border-border-subtle bg-surface-2 p-4">
            <h2 className="text-sm font-semibold text-white mb-3">
              Conversations
            </h2>
            {conversations.length === 0 ? (
              <EmptyState
                variant="bare"
                icon={<MessageCircle className="h-6 w-6" />}
                title="No conversations yet"
                description="Start one from the panel on the right."
                className="px-2 py-6"
              />
            ) : (
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/os/health/coach/${c.id}`}
                      className="block rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-surface-0 hover:text-white transition"
                    >
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
                        <span className="truncate">
                          {c.title ?? 'Untitled conversation'}
                        </span>
                      </div>
                      <span className="text-2xs text-text-tertiary">
                        {new Date(c.updatedAt).toLocaleString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="rounded-xl border border-border-subtle bg-surface-2 p-6">
            <h2 className="text-base font-semibold text-white mb-1">
              Start a conversation
            </h2>
            <p className="text-xs text-text-secondary mb-4 leading-relaxed">
              The coach sees a snapshot of your recent mood, screeners, journal,
              and activity to ground its replies. It never diagnoses, never
              prescribes, and always defers a crisis to 988.
            </p>
            <CoachStarter />
          </section>
        </div>
      )}
    </div>
  );
}
