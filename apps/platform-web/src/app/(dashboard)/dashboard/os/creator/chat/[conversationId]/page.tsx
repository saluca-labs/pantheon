/**
 * Creator OS Phase 6 — AI Chat conversation page.
 *
 * Server component: fetches the conversation + list, then renders the
 * client-side chat layout.
 *
 * @license MIT — Tiresias Creator OS Phase 6 (internal).
 */

import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  getConversation,
  listConversations,
} from '@/lib/agentic-os/creator/chat-repo';
import { ChatLayout } from '@/components/agentic-os/creator/chat-layout';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function CreatorChatConversationPage({
  params,
}: PageProps) {
  const user = await getCurrentCreatorUser();
  if (!user) notFound();

  const { conversationId } = await params;

  const [conversation, conversations] = await Promise.all([
    getConversation(conversationId, user.userId),
    listConversations(user.userId),
  ]);

  if (!conversation) notFound();

  return (
    <ChatLayout
      conversation={conversation}
      conversations={conversations}
    />
  );
}
