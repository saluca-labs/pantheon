/**
 * Research coach — single message bubble.
 *
 * Renders one user/assistant turn. Assistant messages flow through
 * ReactMarkdown (no rehype-raw — XSS-guard pattern from Phase 2 notebook).
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

'use client';

import ReactMarkdown from 'react-markdown';

export interface CoachUiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

interface Props {
  message: CoachUiMessage;
}

export function CoachMessage({ message }: Props) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-surface-2 border border-border-subtle text-text-primary'
        }`}
      >
        {isAssistant ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{message.content || '…'}</ReactMarkdown>
          </div>
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
      </div>
    </div>
  );
}
