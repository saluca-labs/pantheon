/**
 * Cyber OS — Coach conversation page.
 *
 * Loads the conversation + messages server-side and hands off to the
 * client-side CoachChat which handles the streaming round-trip.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getConversation,
  listMessages,
  type CoachToolCall,
} from '@/lib/agentic-os/cyber/coach/repo';
import {
  CoachChat,
  type CoachUiMessage,
} from '@/components/agentic-os/cyber/coach/CoachChat';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ conversationId: string }>;
}

export default async function CyberCoachConversationPage({ params }: Props) {
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const { conversationId } = await params;

  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation) notFound();

  const dbMessages = await listMessages({
    conversationId,
    ownerId: user.userId,
    limit: 500,
  });
  const initialMessages: CoachUiMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: (m.toolCalls as CoachToolCall[] | null) ?? null,
    redacted: m.redacted,
    redactionMatches: m.redactionMatches,
  }));

  return (
    <div className="max-w-5xl">
      <Link
        href={`/dashboard/os/cyber/coach`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All conversations
      </Link>

      <CoachChat
        conversationId={conversation.id}
        mode={conversation.mode}
        caseId={conversation.caseId}
        initialTitle={conversation.title}
        initialMessages={initialMessages}
      />
    </div>
  );
}
