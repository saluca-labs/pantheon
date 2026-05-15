'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ChatMessage } from '@/lib/agentic-os/creator/chat';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface ChatWindowProps {
  conversationId: string;
  initialMessages?: ChatMessage[];
}

function MessageBubble({
  message,
}: {
  message: ChatMessage & { pendingId?: string };
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) return null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-os-creator text-white rounded-br-md'
            : 'bg-surface-2 text-text-primary rounded-bl-md border border-border-strong/50'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-surface-1 [&_pre]:border [&_pre]:border-border-strong [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-text-tertiary [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_table]:text-xs [&_th]:border [&_th]:border-border-strong [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border-strong [&_td]:px-2 [&_td]:py-1">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline assistant-thinking indicator. Uses the shared `Spinner` primitive
 * (W-E.3 visual-language contract) inside a `role="status"` live region so
 * AT users get the "Thinking…" announcement; replaces the previous custom
 * 3-dot bounce animation (off-contract per `_design/visual-language.md`).
 */
function ThinkingIndicator() {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 text-text-secondary text-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner size="xs" />
      <span>Thinking…</span>
    </div>
  );
}

export function ChatWindow({
  conversationId,
  initialMessages = [],
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent, scrollToBottom]);

  // Adjust textarea height
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Add user message to local state immediately
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamContent('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/creator/chat/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(
          (errData as any)?.error || `HTTP ${res.status}`,
        );
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('\x1e')) continue;
          const json = line.slice(1).trim();
          if (!json) continue;

          try {
            const parsed = JSON.parse(json);
            if (parsed.type === 'text-delta') {
              fullContent += parsed.textDelta;
              setStreamContent(fullContent);
            } else if (parsed.type === 'done') {
              // Finalize: add assistant message to state
              if (fullContent) {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: fullContent },
                ]);
              }
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Stream error', err);
        // Add error note
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `_Error: ${err.message || 'Failed to get response'}_`,
          },
        ]);
      }
    } finally {
      setStreaming(false);
      setStreamContent('');
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  // Display all messages + streaming content
  const displayMessages = [...messages];
  if (streamContent) {
    displayMessages.push({ role: 'assistant', content: streamContent });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {displayMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-os-creator/20 flex items-center justify-center mx-auto mb-3">
                <Send className="h-6 w-6 text-os-creator" />
              </div>
              <h3 className="text-sm font-medium text-text-secondary mb-1">
                Start a conversation
              </h3>
              <p className="text-xs text-text-tertiary max-w-xs">
                Send a message to begin. You can switch models and set a system
                prompt from the header controls.
              </p>
            </div>
          </div>
        ) : (
          displayMessages.map((msg, i) => {
            const isLast = i === displayMessages.length - 1;
            const isStreaming =
              isLast && msg === displayMessages[displayMessages.length - 1] && streaming;

            return (
              <div key={i}>
                <MessageBubble message={msg} />
                {isStreaming && <ThinkingIndicator />}
              </div>
            );
          })
        )}

        {streaming && !streamContent && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border-subtle bg-surface-1/70 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none rounded-xl border border-border-strong bg-surface-2 text-text-primary text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-os-creator/50 placeholder:text-text-tertiary disabled:opacity-50"
          />

          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-danger/80 text-white hover:bg-danger transition-colors"
              title="Stop generating"
            >
              <div className="h-3 w-3 rounded-sm bg-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-os-creator text-white hover:bg-os-creator/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
