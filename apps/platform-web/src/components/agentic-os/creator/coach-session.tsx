/**
 * Creator coach — streaming chat session view.
 *
 * Reads the streaming endpoint's plain-text + U+001E trailer wire format,
 * appends each text delta to a live placeholder, and parses the trailer
 * for the session id. Provides delete and archive affordances on the
 * conversation header.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Send, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import {
  COACH_MODE_LABELS,
  type CoachMode,
} from '@/lib/agentic-os/creator/coach/modes';


export interface CoachUiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** ISO-8601 UTC timestamp; optional, only used for keying. */
  created_at?: string;
}

interface Props {
  sessionId: string;
  mode: CoachMode;
  initialTitle: string;
  initialArchivedAt: string | null;
  initialMessages: CoachUiMessage[];
}

export function CoachSession({
  sessionId,
  mode,
  initialTitle,
  initialArchivedAt,
  initialMessages,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<CoachUiMessage[]>(initialMessages);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle || 'Untitled session');
  const [editingTitle, setEditingTitle] = useState(false);
  const [archived, setArchived] = useState(initialArchivedAt != null);
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
        `/api/tiresias/agentic-os/creator/coach/sessions/${sessionId}/stream`,
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
      `/api/tiresias/agentic-os/creator/coach/sessions/${sessionId}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      router.push('/dashboard/os/creator/coach');
    }
  }

  async function toggleArchive() {
    const r = await fetch(
      `/api/tiresias/agentic-os/creator/coach/sessions/${sessionId}/archive`,
      { method: 'POST' },
    );
    if (r.ok) {
      setArchived((prev) => !prev);
      router.refresh();
    }
  }

  async function saveTitle() {
    const r = await fetch(
      `/api/tiresias/agentic-os/creator/coach/sessions/${sessionId}`,
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
              className="bg-transparent text-lg font-semibold text-white border-b border-os-creator focus:outline-none px-1"
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
          <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-os-creator/30 bg-os-creator/10 text-os-creator shrink-0">
            {COACH_MODE_LABELS[mode]}
          </span>
          {archived && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-text-secondary/30 bg-text-secondary/10 text-text-secondary shrink-0">
              archived
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleArchive}
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-os-creator transition"
            title={archived ? 'Unarchive' : 'Archive'}
          >
            {archived ? (
              <ArchiveRestore className="w-3.5 h-3.5" />
            ) : (
              <Archive className="w-3.5 h-3.5" />
            )}
            {archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            onClick={deleteSession}
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-danger transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-0 p-4 space-y-4"
      >
        {messages.length === 0 && (
          <p className="text-xs text-text-tertiary italic">
            No messages yet. Send a message below to start.
          </p>
        )}
        {messages.map((m, i) => (
          <CoachMessageBubble key={i} message={m} />
        ))}
        {streaming && messages[messages.length - 1]?.content === '' && (
          <div className="text-xs text-text-tertiary italic">Coach is thinking…</div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
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
          className="flex-1 rounded-lg border border-border-subtle bg-surface-2 text-sm text-white placeholder:text-text-tertiary px-3 py-2 focus:outline-none focus:border-os-creator disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-os-creator hover:bg-os-creator/90 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
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
            ? 'bg-os-creator text-white'
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
