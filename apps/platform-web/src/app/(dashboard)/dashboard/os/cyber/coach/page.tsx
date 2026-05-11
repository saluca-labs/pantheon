/**
 * Cyber OS — Coach lobby.
 *
 * Mode picker + starter prompts + sidebar list of existing conversations,
 * sorted by updated_at desc. If ANTHROPIC_API_KEY is missing, renders the
 * CoachConfigNotice instead of the lobby UI.
 */

import Link from 'next/link';
import { ArrowLeft, MessageCircle, ShieldAlert } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listConversations } from '@/lib/agentic-os/cyber/coach/repo';
import { isCoachConfigured } from '@/lib/agentic-os/cyber/coach/anthropic';
import { COACH_MODE_LABELS } from '@/lib/agentic-os/cyber/coach/modes';
import { CoachStarter } from '@/components/agentic-os/cyber/coach/CoachStarter';
import { CoachConfigNotice } from '@/components/agentic-os/cyber/coach/CoachConfigNotice';

export const dynamic = 'force-dynamic';

export default async function CyberCoachLobbyPage() {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const configured = isCoachConfigured();
  const conversations = configured
    ? await listConversations({ ownerId: user.userId, limit: 50 })
    : [];

  return (
    <div className="max-w-5xl">
      <Link
        href={`/dashboard/os/cyber`}
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to CyberSec OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="w-6 h-6 text-red-400" />
        <h1 className="text-2xl font-semibold text-white">AI coach</h1>
      </div>

      {!configured ? (
        <CoachConfigNotice />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
          <aside className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
            <h2 className="text-sm font-semibold text-white mb-3">
              Conversations
            </h2>
            {conversations.length === 0 ? (
              <p className="text-xs text-[#94a3b8]">
                No conversations yet. Pick a mode and start one.
              </p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/os/cyber/coach/${c.id}`}
                      className="block rounded-lg px-3 py-2 text-sm text-[#cbd5e1] hover:bg-[#0f1117] hover:text-white transition"
                    >
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-3.5 h-3.5 shrink-0 text-[#64748b]" />
                        <span className="truncate">
                          {c.title ?? 'Untitled conversation'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] uppercase tracking-wide text-red-400">
                          {COACH_MODE_LABELS[c.mode]}
                        </span>
                        <span className="text-[10px] text-[#64748b]">
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
            <h2 className="text-base font-semibold text-white mb-1">
              Start a conversation
            </h2>
            <p className="text-xs text-[#94a3b8] mb-4 leading-relaxed">
              The coach sees the current SOC snapshot — open alerts, active
              IOCs, vulnerabilities, exposures, detection rules, and active
              playbook runs. Optionally scope the conversation to a single
              case. Output is filtered through a secret-redaction layer that
              strips AWS / RSA / JWT / GitHub / Anthropic / Slack tokens
              before they reach you.
            </p>
            <CoachStarter />
          </section>
        </div>
      )}
    </div>
  );
}
