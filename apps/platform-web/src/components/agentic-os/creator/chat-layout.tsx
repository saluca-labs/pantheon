'use client';

import { ChatSidebar } from '@/components/agentic-os/creator/chat-sidebar';
import { ChatWindow } from '@/components/agentic-os/creator/chat-window';
import { ModelPicker } from '@/components/agentic-os/creator/model-picker';
import { SystemPromptEditor } from '@/components/agentic-os/creator/system-prompt-editor';
import type { CreatorConversation } from '@/lib/agentic-os/creator/chat';

interface ChatLayoutProps {
  conversation: CreatorConversation;
  conversations: CreatorConversation[];
}

export function ChatLayout({ conversation, conversations }: ChatLayoutProps) {
  const conversationId = conversation.id;

  const handleModelChange = async (model: string) => {
    await fetch(
      `/api/tiresias/agentic-os/creator/chat/conversations/${conversationId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      },
    );
  };

  const handleSystemPromptChange = async (prompt: string) => {
    await fetch(
      `/api/tiresias/agentic-os/creator/chat/conversations/${conversationId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: prompt || null }),
      },
    );
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full">
      {/* Left: Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={conversationId}
      />

      {/* Right: Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header controls */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/70">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-zinc-100 truncate">
              {conversation.title}
            </h1>
          </div>
          <ModelPicker
            value={conversation.model}
            onChange={handleModelChange}
          />
        </div>

        {/* System prompt editor */}
        <div className="bg-zinc-900/50">
          <SystemPromptEditor
            value={conversation.systemPrompt}
            onChange={handleSystemPromptChange}
          />
        </div>

        {/* Chat window */}
        <div className="flex-1 overflow-hidden">
          <ChatWindow
            conversationId={conversationId}
            initialMessages={conversation.messages}
          />
        </div>
      </div>
    </div>
  );
}
