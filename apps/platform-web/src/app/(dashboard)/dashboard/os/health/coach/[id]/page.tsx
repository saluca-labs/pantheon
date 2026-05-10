import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getConversation,
  listMessages,
  type CoachToolCall,
} from '@/lib/agentic-os/health/coach/repo';
import { CoachChat, type CoachUiMessage } from '@/components/agentic-os/health/coach/coach-chat';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachConversationPage({ params }: PageProps) {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');
  const { id } = await params;

  const conversation = await getConversation(id, user.tenantId, user.userId);
  if (!conversation) notFound();

  const dbMessages = await listMessages({ conversationId: id, limit: 500 });
  const initialMessages: CoachUiMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: (m.toolCalls as CoachToolCall[] | null) ?? null,
    crisisDetected: m.crisisDetected,
  }));

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/health/coach"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        All conversations
      </Link>

      <CoachChat
        conversationId={conversation.id}
        initialTitle={conversation.title}
        initialMessages={initialMessages}
      />
    </div>
  );
}
