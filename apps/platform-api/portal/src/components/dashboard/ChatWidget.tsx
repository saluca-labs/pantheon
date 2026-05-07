"use client";

/**
 * ChatWidget — floating support chatbot for the Tiresias dashboard.
 *
 * Features:
 *   - Floating button (bottom-right) with unread badge
 *   - Slide-out panel (right side, fixed, full viewport height)
 *   - SSE streaming from POST /v1/support/chat
 *   - In-memory conversation history (cleared on clear, preserved in session)
 *   - Confidence badge on each assistant message
 *   - Escalation prompt when confidence is low
 *
 * Usage: drop <ChatWidget /> anywhere in the layout tree (dashboard layout).
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { config } from "@/lib/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  streaming?: boolean;
}

interface SSETokenEvent {
  token: string;
}

interface SSEDoneEvent {
  session_id: string;
  confidence: number;
}

interface SSEErrorEvent {
  error: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const isLow = confidence < 0.6;
  return (
    <span
      className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 align-middle ${
        isLow
          ? "bg-of-error/15 text-of-error border border-of-error/20"
          : "bg-of-primary/10 text-of-primary border border-of-primary/20"
      }`}
    >
      {pct}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens; clear unread count
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
    if (open) {
      setUnread(0);
    }
  }, [open]);

  const togglePanel = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const stopStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming ? { ...m, streaming: false } : m
      )
    );
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: uid(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    // Prepare assistant placeholder
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    // Build history for API (last 10 turns, exclude the new placeholder)
    const historyForApi = messages
      .filter((m) => !m.streaming)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch(`${config.apiUrl}/v1/support/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          history: historyForApi,
          session_id: sessionId,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let finalConfidence = 0.85;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE blocks separated by double newline
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const block of parts) {
          const lines = block.split("\n");
          let eventType = "";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.slice(6).trim();
            }
          }

          if (!eventType || !dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (eventType === "token") {
              const ev = parsed as SSETokenEvent;
              fullContent += ev.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: fullContent, streaming: true }
                    : m
                )
              );
            } else if (eventType === "done") {
              const ev = parsed as SSEDoneEvent;
              finalConfidence = ev.confidence;
              setSessionId(ev.session_id);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: fullContent,
                        streaming: false,
                        confidence: finalConfidence,
                      }
                    : m
                )
              );
            } else if (eventType === "error") {
              const ev = parsed as SSEErrorEvent;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: `Error: ${ev.error}`,
                        streaming: false,
                        confidence: 0,
                      }
                    : m
                )
              );
            }
          } catch {
            // ignore JSON parse errors on individual SSE events
          }
        }
      }

      // If stream ends without a done event, finalize anyway
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.streaming
            ? { ...m, streaming: false, confidence: finalConfidence }
            : m
        )
      );

      // Increment unread badge if panel is closed
      if (!open) {
        setUnread((n) => n + 1);
      }
    } catch (err: unknown) {
      const isAbort = (err as { name?: string }).name === "AbortError";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: isAbort
                  ? m.content + " [stopped]"
                  : "Connection error. Please try again.",
                streaming: false,
                confidence: 0,
              }
            : m
        )
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, sessionId, open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setSessionId(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasLowConfidence = messages.some(
    (m) => m.role === "assistant" && m.confidence !== undefined && m.confidence < 0.6
  );

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={togglePanel}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #5adace 0%, #3db8ae 100%)",
          boxShadow: "0 4px 24px rgba(90,218,206,0.35)",
        }}
      >
        {open ? (
          <XIcon />
        ) : (
          <>
            <ChatIcon />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-of-error text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </>
        )}
      </button>

      {/* Slide-out panel */}
      <div
        className="fixed top-0 right-0 h-full z-40 flex flex-col transition-transform duration-300 ease-out"
        style={{
          width: "clamp(320px, 28vw, 420px)",
          transform: open ? "translateX(0)" : "translateX(105%)",
          background: "var(--of-surface-container-low)",
          borderLeft: "1px solid rgba(90,218,206,0.08)",
          boxShadow: open ? "-4px 0 32px rgba(0,0,0,0.5)" : "none",
        }}
        aria-hidden={!open}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{
            borderBottom: "1px solid rgba(90,218,206,0.08)",
            background: "var(--of-surface-container)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "rgba(90,218,206,0.15)" }}
            >
              <BotIcon />
            </div>
            <div>
              <p className="text-sm font-bold text-of-on-surface leading-none">
                Tiresias Support
              </p>
              <p className="text-[10px] text-of-on-surface-variant mt-0.5">
                AI-powered · 24/7
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                title="Clear chat history"
                className="p-1.5 rounded-lg text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container-high transition-colors"
              >
                <TrashIcon />
              </button>
            )}
            <button
              onClick={togglePanel}
              className="p-1.5 rounded-lg text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container-high transition-colors"
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        {/* Message list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "rgba(90,218,206,0.10)" }}
              >
                <BotIcon size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-of-on-surface">
                  How can I help?
                </p>
                <p className="text-xs text-of-on-surface-variant mt-1 max-w-[200px]">
                  Ask about Tiresias features, APIs, detection rules, or troubleshooting.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-1">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setInput(p);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg border text-of-primary hover:bg-of-primary/10 transition-colors"
                    style={{ borderColor: "rgba(90,218,206,0.2)" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                style={
                  msg.role === "user"
                    ? {
                        background: "rgba(90,218,206,0.15)",
                        border: "1px solid rgba(90,218,206,0.2)",
                        color: "var(--of-on-surface)",
                        borderBottomRightRadius: "4px",
                      }
                    : {
                        background: "var(--of-surface-container)",
                        border: "1px solid rgba(255,255,255,0.04)",
                        color: "var(--of-on-surface)",
                        borderBottomLeftRadius: "4px",
                      }
                }
              >
                <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.content}
                  {msg.streaming && (
                    <span
                      className="inline-block w-1.5 h-3.5 ml-0.5 align-text-bottom animate-pulse"
                      style={{ background: "var(--of-primary)", borderRadius: "1px" }}
                    />
                  )}
                </span>
                {msg.role === "assistant" &&
                  !msg.streaming &&
                  msg.confidence !== undefined && (
                    <div className="mt-1">
                      <ConfidenceBadge confidence={msg.confidence} />
                    </div>
                  )}
              </div>
            </div>
          ))}

          {/* Escalation prompt when confidence is low */}
          {hasLowConfidence && !streaming && (
            <div
              className="rounded-xl p-3 text-xs text-center"
              style={{
                background: "rgba(255,180,171,0.06)",
                border: "1px solid rgba(255,180,171,0.15)",
                color: "var(--of-on-surface-variant)",
              }}
            >
              Not satisfied with the answer?{" "}
              <a
                href="mailto:support@saluca.com"
                className="font-bold underline"
                style={{ color: "var(--of-primary)" }}
              >
                Contact human support
              </a>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div
          className="px-3 py-3 shrink-0"
          style={{ borderTop: "1px solid rgba(90,218,206,0.08)" }}
        >
          <div
            className="flex items-end gap-2 rounded-xl p-2"
            style={{
              background: "var(--of-surface-container)",
              border: "1px solid rgba(90,218,206,0.12)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about Tiresias..."
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none bg-transparent text-sm text-of-on-surface placeholder:text-of-on-surface-variant/50 outline-none leading-relaxed min-h-[28px] max-h-[100px] overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = `${Math.min(t.scrollHeight, 100)}px`;
              }}
            />
            {streaming ? (
              <button
                onClick={stopStream}
                title="Stop generating"
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-of-error/20"
                style={{ color: "var(--of-error)" }}
              >
                <StopIcon />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                title="Send message"
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
                style={{
                  background: input.trim() ? "rgba(90,218,206,0.2)" : "transparent",
                  color: "var(--of-primary)",
                }}
              >
                <SendIcon />
              </button>
            )}
          </div>
          <p className="text-[10px] text-of-on-surface-variant/40 text-center mt-1.5">
            Enter to send &middot; Shift+Enter for newline
          </p>
        </div>
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={togglePanel}
          aria-hidden="true"
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Starter prompts
// ---------------------------------------------------------------------------

const STARTER_PROMPTS = [
  "How do I install the SDK?",
  "What is PRH?",
  "How do I create a Sigma rule?",
];

// ---------------------------------------------------------------------------
// SVG icons (inline, no external icon-lib dependency)
// ---------------------------------------------------------------------------

function ChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#003733"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function XIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BotIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--of-primary)"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <line x1="12" y1="7" x2="12" y2="11" />
      <line x1="8" y1="16" x2="8" y2="16" strokeWidth={2.5} />
      <line x1="12" y1="16" x2="12" y2="16" strokeWidth={2.5} />
      <line x1="16" y1="16" x2="16" y2="16" strokeWidth={2.5} />
    </svg>
  );
}

function SendIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function StopIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}
