'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Send, Trash2, Wrench } from 'lucide-react';
import { CrisisBanner } from '../crisis-banner';

const RECORD_SEPARATOR = String.fromCharCode(0x1e);

export interface CoachUiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{ id: string; name: string; input: unknown }> | null;
  crisisDetected?: boolean;
}

interface Props {
  conversationId: string;
  initialTitle: string | null;
  initialMessages: CoachUiMessage[];
}

export function CoachChat({ conversationId, initialTitle, initialMessages }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<CoachUiMessage[]>(initialMessages);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crisisBanner, setCrisisBanner] = useState(
    initialMessages.some((m) => m.crisisDetected),
  );
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
      const r = await fetch('/api/tiresias/agentic-os/health/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, message: value }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${r.status}`);
      }
      if (!r.body) throw new Error('No response body');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let trailerSeen = false;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const sepIdx = buffer.indexOf(RECORD_SEPARATOR);
        if (sepIdx >= 0 && !trailerSeen) {
          trailerSeen = true;
          assistantText += buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 1);
        } else if (!trailerSeen) {
          assistantText += buffer;
          buffer = '';
        }
        if (!trailerSeen) {
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { ...assistantPlaceholder, content: assistantText };
            return copy;
          });
        }
      }
      // Process trailer if present.
      if (trailerSeen) {
        try {
          const trailer = JSON.parse(buffer.trim());
          if (trailer.crisis_detected) setCrisisBanner(true);
        } catch {
          // ignore malformed trailer
        }
      }
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { ...assistantPlaceholder, content: assistantText };
        return copy;
      });
    } catch (err) {
      setError((err as Error).message);
      setMessages((m) => m.slice(0, -1)); // drop placeholder
    } finally {
      setStreaming(false);
      router.refresh();
    }
  }

  async function deleteConversation() {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/health/coach/conversations/${conversationId}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      router.push('/dashboard/os/health/coach');
    }
  }

  async function saveTitle() {
    const r = await fetch(
      `/api/tiresias/agentic-os/health/coach/conversations/${conversationId}`,
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
      <div className="flex items-center justify-between mb-3">
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
            className="bg-transparent text-lg font-semibold text-white border-b border-[#4361EE] focus:outline-none px-1"
          />
        ) : (
          <h2
            onClick={() => setEditingTitle(true)}
            className="text-lg font-semibold text-white cursor-text hover:text-[#cbd5e1]"
            title="Click to rename"
          >
            {title}
          </h2>
        )}
        <button
          type="button"
          onClick={deleteConversation}
          className="inline-flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-red-300 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>

      {crisisBanner && (
        <div className="mb-3">
          <CrisisBanner compact />
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-[#2a2d3e] bg-[#0f1117] p-4 space-y-4"
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
          className="flex-1 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-sm text-white placeholder:text-[#64748b] px-3 py-2 focus:outline-none focus:border-[#4361EE] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3a55d6] text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
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
            ? 'bg-[#4361EE]/90 text-white'
            : 'bg-[#1a1d27] border border-[#2a2d3e] text-[#e2e8f0]'
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc) => (
              <span
                key={tc.id}
                className="inline-flex items-center gap-1 rounded-full bg-[#0f1117] border border-[#2a2d3e] text-[10px] font-mono text-[#94a3b8] px-2 py-0.5"
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
