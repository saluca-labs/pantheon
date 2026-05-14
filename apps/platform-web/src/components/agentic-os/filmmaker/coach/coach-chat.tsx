'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Send, Trash2, Wrench } from 'lucide-react';
import {
  COACH_MODE_LABELS,
  type CoachMode,
} from '@/lib/agentic-os/filmmaker/coach/modes';


export interface CoachUiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{ id: string; name: string; input: unknown }> | null;
}

interface Props {
  projectId: string;
  conversationId: string;
  mode: CoachMode;
  initialTitle: string | null;
  initialMessages: CoachUiMessage[];
}

export function CoachChat({
  projectId,
  conversationId,
  mode,
  initialTitle,
  initialMessages,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<CoachUiMessage[]>(initialMessages);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle ?? 'Untitled conversation');
  const [editingTitle, setEditingTitle] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  async function send() {
    const value = text.trim();
    if (!value || streaming) return;
    setText('');
    setError(null);

    const userMsg: CoachUiMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: 'user',
      content: value,
    };
    const assistantPlaceholder: CoachUiMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: 'assistant',
      content: '',
    };
    setMessages((m) => [...m, userMsg, assistantPlaceholder]);
    setStreaming(true);

    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/coach/conversations/${conversationId}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: value }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${r.status}`);
      }
      // Wave-0: JSON response (streaming deferred).
      const body = (await r.json()) as { text?: string };
      const assistantText = body.text ?? '';
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { ...assistantPlaceholder, content: assistantText };
        return copy;
      });
    } catch (err) {
      setError((err as Error).message);
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      router.refresh();
    }
  }

  async function deleteConversation() {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/filmmaker/coach/conversations/${conversationId}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      router.push(`/dashboard/os/filmmaker/projects/${projectId}/coach`);
    }
  }

  async function saveTitle() {
    const r = await fetch(
      `/api/tiresias/agentic-os/filmmaker/coach/conversations/${conversationId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || null }),
      },
    );
    if (r.ok) {
      setEditingTitle(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {editingTitle ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  setTitle(initialTitle ?? '');
                  setEditingTitle(false);
                }
              }}
              autoFocus
              className="bg-transparent text-lg font-semibold text-white border-b border-accent focus:outline-none px-1"
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              className="text-lg font-semibold text-white cursor-text hover:text-text-primary truncate"
              title="Click to rename"
            >
              {title}
            </h2>
          )}
          <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-accent/30 bg-accent/10 text-text-primary shrink-0">
            {COACH_MODE_LABELS[mode]}
          </span>
        </div>
        <button
          type="button"
          onClick={deleteConversation}
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-red-300 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-0 p-4 space-y-4"
      >
        {messages.length === 0 && (
          <p className="text-xs text-[#64748b] italic">
            No messages yet. Send a message below to start.
          </p>
        )}
        {messages.map((m) => (
          <CoachMessageBubble key={m.id} message={m} />
        ))}
        {streaming && messages[messages.length - 1]?.content === '' && (
          <div className="text-xs text-[#64748b] italic">Coach is typing…</div>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-3 flex items-end gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={streaming}
          placeholder="Type a message…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-2 text-sm text-white placeholder:text-[#64748b] px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent hover:bg-[#3a55d6] text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      </form>
    </div>
  );
}

function CoachMessageBubble({ message }: { message: CoachUiMessage }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-accent/90 text-white'
            : 'bg-surface-2 border border-border-subtle text-text-primary'
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc) => (
              <span
                key={tc.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-0 border border-border-subtle text-[10px] font-mono text-text-secondary px-2 py-0.5"
              >
                <Wrench className="w-3 h-3" />
                {tc.name}
              </span>
            ))}
          </div>
        )}
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
