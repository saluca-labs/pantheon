/**
 * Creator OS Phase 6 — AI Chat domain types.
 *
 * @license MIT — Tiresias Creator OS Phase 6 (internal).
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CreatorConversation {
  id: string;
  userId: string;
  title: string;
  model: string;
  systemPrompt: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationInput {
  title?: string;
  model?: string;
  systemPrompt?: string | null;
}

export interface UpdateConversationInput {
  title?: string;
  model?: string;
  systemPrompt?: string | null;
}
