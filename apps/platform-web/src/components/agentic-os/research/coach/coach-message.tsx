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
            ? 'bg-[#4361EE] text-white'
            : 'bg-[#1a1d27] border border-[#2a2d3e] text-[#e2e8f0]'
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
