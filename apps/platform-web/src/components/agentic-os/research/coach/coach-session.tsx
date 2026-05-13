/**
 * Research coach — streaming chat session view.
 *
 * Reads the messages route's plain-text + U+001E trailer wire format,
 * appends each text delta to a live placeholder, and parses the trailer
 * for metadata. The lit_reviewer / hypothesis_critic / methods_advisor
 * modes render a side panel; general mode does not.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Trash2 } from 'lucide-react';
import {
  COACH_MODE_LABELS,
  type CoachMode,
} from '@/lib/agentic-os/research/coach/modes';
import { CoachTranscript } from './coach-transcript';
import { CoachContextPanel } from './coach-context-panel';
import type { CoachUiMessage } from './coach-message';


export type { CoachUiMessage } from './coach-message';

interface Props {
  sessionId: string;
  mode: CoachMode;
  experimentId: string | null;
  initialTitle: string;
  initialMessages: CoachUiMessage[];
}

export function CoachSession({
  sessionId,
  mode,
  experimentId,
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
        `/api/tiresias/agentic-os/research/coach/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: value }),
        },
      );
      if (!r.ok) {
        const failBody = await r.json().catch(() => ({}));
        throw new Error(
          failBody.message || failBody.error || `HTTP ${r.status}`,
        );
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
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      router.refresh();
    }
  }

  async function deleteSession() {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    const r = await fetch(
      `/api/tiresias/agentic-os/research/coach/sessions/${sessionId}`,
      { method: 'DELETE' },
    );
    if (r.ok) {
      router.push('/dashboard/os/research/coach');
    }
  }

  async function saveTitle() {
    const r = await fetch(
      `/api/tiresias/agentic-os/research/coach/sessions/${sessionId}`,
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

  const hasSidePanel = mode !== 'general';

  return (
    <div
      className={
        hasSidePanel
          ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4'
          : ''
      }
    >
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
                className="bg-transparent text-lg font-semibold text-white border-b border-[#4361EE] focus:outline-none px-1"
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
            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-[#4361EE]/40 bg-[#4361EE]/10 text-[#cbd5e1] shrink-0">
              {COACH_MODE_LABELS[mode]}
            </span>
            {experimentId && (
              <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 shrink-0">
                experiment-scoped
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

        <CoachTranscript ref={scrollRef} mode={mode} messages={messages} streaming={streaming} />

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
          className="mt-3"
        >
          <div className="flex items-end gap-2">
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] hover:bg-[#3651DE] text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </form>
      </div>

      {hasSidePanel && (
        <CoachContextPanel
          mode={mode}
          experimentId={experimentId}
          messages={messages}
        />
      )}
    </div>
  );
}
