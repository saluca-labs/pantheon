/**
 * Creator OS Phase 6 — AI Chat hub page.
 *
 * Server component. Redirects to the most recent conversation, or creates
 * a new one if none exist.
 *
 * @license MIT — Tiresias Creator OS Phase 6 (internal).
 */

import { redirect } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  listConversations,
  createConversation,
} from '@/lib/agentic-os/creator/chat-repo';

export const dynamic = 'force-dynamic';

export default async function CreatorChatPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const conversations = await listConversations(user.userId);

  if (conversations.length > 0) {
    redirect(`/dashboard/os/creator/chat/${conversations[0].id}`);
  }

  const conv = await createConversation({}, user.userId);
  redirect(`/dashboard/os/creator/chat/${conv.id}`);
}
