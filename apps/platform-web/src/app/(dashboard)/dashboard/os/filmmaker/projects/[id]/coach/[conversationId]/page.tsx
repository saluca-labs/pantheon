/**
 * Filmmaker OS — Coach conversation page.
 *
 * Loads the conversation + messages server-side and hands off to the
 * client-side CoachChat which handles the streaming round-trip.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getProject } from '@/lib/agentic-os/filmmaker/repo';
import {
  getConversation,
  listMessages,
  type CoachToolCall,
} from '@/lib/agentic-os/filmmaker/coach/repo';
import {
  CoachChat,
  type CoachUiMessage,
} from '@/components/agentic-os/filmmaker/coach/coach-chat';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string; conversationId: string }>;
}

export default async function FilmmakerCoachConversationPage({ params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const { id, conversationId } = await params;

  const project = await getProject(id, user.userId);
  if (!project) notFound();

  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation || conversation.projectId !== id) notFound();

  const dbMessages = await listMessages({
    conversationId,
    userId: user.userId,
    limit: 500,
  });
  const initialMessages: CoachUiMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: (m.toolCalls as CoachToolCall[] | null) ?? null,
  }));

  return (
    <div className="max-w-5xl">
      <Link
        href={`/dashboard/os/filmmaker/projects/${id}/coach`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All conversations
      </Link>

      <CoachChat
        projectId={id}
        conversationId={conversation.id}
        mode={conversation.mode}
        initialTitle={conversation.title}
        initialMessages={initialMessages}
      />
    </div>
  );
}
