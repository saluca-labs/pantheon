/**
 * Business coach — streaming chat session view.
 *
 * Reads the messages route's plain-text + U+001E trailer wire format,
 * appends each text delta to a live placeholder, and parses the trailer
 * for the session id. Provides a delete + rename affordance on the
 * conversation header.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Send, Trash2 } from 'lucide-react';
import {
  COACH_MODE_LABELS,
  type CoachMode,
} from '@/lib/agentic-os/business/coach/modes';

const RECORD_SEPARATOR = String.fromCharCode(0x1e);

export interface CoachUiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** ISO-8601 UTC timestamp; optional, only used for keying. */
  created_at?: string;
}

interface Props {
  sessionId: string;
  mode: CoachMode;
  projectId: string | null;
  dealId: string | null;
  initialTitle: string;
  initialMessages: CoachUiMessage[];
}

export function CoachSession({
  sessionId,
  mode,
  projectId,
  dealId,
  initialTitle,
  initialMessages,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<CoachUiMessage[]>(initialMessages);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle || 'Untitled session');
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

    const userMsg: CoachUiMessage = { role: 'user', content: value };
    const assistantPlaceholder: CoachUiMessage = {
      role: 'assistant',
      content: '',
    };
    setMessages((m) => [...m, userMsg, assistantPlaceholder]);
    setStreaming(true);

    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/business/coach/sessions/${sessionId}/messages`,
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
          buffer = '';
        } else if (!trailerSeen) {
          assistantText += buffer;
          buffer = '';
        } else {
          buffer = '';
        }
        if (!trailerSeen) {
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = {
              role: 'assistant',
              content: assistantText,
            };
            return copy;
          });
        }
      }
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { role: 'assistant', content: assistantText };
        return copy;
      });
    } catch (err) {
      setError((err as Error).message);
      // Drop the dangling assistant placeholder.
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      router.refresh();
    }
  }

  async function deleteSession() {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/business/coach/sessions/${sessionId}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      router.push('/dashboard/os/business/coach');
    }
  }

  async function saveTitle() {
    const r = await fetch(
      `/api/tiresias/agentic-os/business/coach/sessions/${sessionId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || 'Untitled session' }),
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
                  setTitle(initialTitle);
                  setEditingTitle(false);
                }
              }}
              autoFocus
              className="bg-transparent text-lg font-semibold text-white border-b border-amber-500 focus:outline-none px-1"
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              className="text-lg font-semibold text-white cursor-text hover:text-[#cbd5e1] truncate"
              title="Click to rename"
            >
              {title}
            </h2>
          )}
          <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-100 shrink-0">
            {COACH_MODE_LABELS[mode]}
          </span>
          {projectId && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#4361EE]/30 bg-[#4361EE]/10 text-[#cbd5e1] shrink-0">
              project-scoped
            </span>
          )}
          {dealId && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-100 shrink-0">
              deal-scoped
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={deleteSession}
          className="inline-flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-red-300 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-[#2a2d3e] bg-[#0f1117] p-4 space-y-4"
      >
        {messages.length === 0 && (
          <p className="text-xs text-[#64748b] italic">
            No messages yet. Send a message below to start.
          </p>
        )}
        {messages.map((m, i) => (
          <CoachMessageBubble key={i} message={m} />
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
          className="flex-1 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-sm text-white placeholder:text-[#64748b] px-3 py-2 focus:outline-none focus:border-amber-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium px-3 py-2 disabled:opacity-50"
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
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-amber-500 text-black'
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
