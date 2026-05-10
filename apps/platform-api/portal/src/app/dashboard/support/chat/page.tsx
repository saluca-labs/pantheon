"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Send,
  AlertTriangle,
  ArrowLeft,
  RotateCcw,
  LifeBuoy,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

/** SSE-based support chat interface backed by the Tiresias AI chatbot. */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SSEDonePayload {
  session_id: string;
  confidence: number;
  escalated: boolean;
}

export default function SupportChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setStreaming(true);

    // Add placeholder assistant message for streaming
    const assistantIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          session_id: sessionId,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.detail || errBody?.error || `Server error: ${res.status}`,
        );
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let currentEvent = "token";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6);
          try {
            const parsed = JSON.parse(dataStr);

            if (currentEvent === "token" && parsed.token) {
              fullContent += parsed.token;
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  role: "assistant",
                  content: fullContent,
                };
                return updated;
              });
            } else if (currentEvent === "done") {
              const donePayload = parsed as SSEDonePayload;
              if (donePayload.session_id) {
                setSessionId(donePayload.session_id);
              }
              if (donePayload.escalated) {
                setEscalated(true);
              }
            } else if (currentEvent === "error") {
              setError(parsed.error || "Unknown streaming error");
            } else if (currentEvent === "action" && parsed.result) {
              fullContent += `\n[Action: ${parsed.result}]\n`;
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIndex] = {
                  role: "assistant",
                  content: fullContent,
                };
                return updated;
              });
            }
          } catch {
            // Skip unparseable data
          }

          // Reset event type after processing data line
          currentEvent = "token";
        }
      }

      // If no content was received, show a fallback
      if (!fullContent.trim()) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIndex] = {
            role: "assistant",
            content: "I was unable to generate a response. Please try again.",
          };
          return updated;
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chat request failed";
      setError(msg);
      // Remove the empty assistant placeholder on error
      setMessages((prev) => prev.filter((_, i) => i !== assistantIndex));
    } finally {
      setStreaming(false);
    }
  }

  async function handleEscalate() {
    try {
      const result = await api.post<{ ticket_id: string; sla_deadline: string }>(
        "/v1/support/tickets",
        {
          subject: "Chat escalation — human support requested",
          description: `Escalated from chat session ${sessionId || "unknown"}.\n\nConversation summary:\n${messages
            .slice(-6)
            .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
            .join("\n")}`,
          severity: "P2",
          category: "question",
        },
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Your conversation has been escalated to human support. Ticket ID: ${result.ticket_id}. Our team will follow up within your SLA window.`,
        },
      ]);
      setEscalated(true);
    } catch {
      setError("Failed to create escalation ticket. Please try the Support page.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/support"
            className="p-2 rounded-lg text-of-on-surface-variant hover:text-of-on-surface hover:bg-of-surface-container transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-of-primary/10 border border-of-primary/20 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-of-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-of-on-surface tracking-tight">
              Support Chat
            </h1>
            <p className="text-xs text-of-on-surface-variant">
              AI-powered support assistant for Pantheon
            </p>
          </div>
        </div>
        {!escalated && messages.length > 0 && (
          <button
            onClick={handleEscalate}
            disabled={streaming}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs font-semibold text-orange-400 hover:bg-orange-500/15 transition-colors disabled:opacity-40"
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            Escalate to Human
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-2xl bg-of-surface-container-low border border-of-outline-variant/15 p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-of-on-surface-variant gap-3">
            <MessageCircle className="w-10 h-10 opacity-20" />
            <p className="text-sm">
              Ask a question about Pantheon configuration, APIs, or
              troubleshooting.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-of-primary/15 border border-of-primary/20 text-of-on-surface"
                    : "bg-of-surface-container border border-of-outline-variant/20 text-of-on-surface"
                }`}
              >
                {msg.content}
                {msg.role === "assistant" &&
                  streaming &&
                  i === messages.length - 1 && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="inline-block w-1.5 h-4 bg-of-primary/60 ml-0.5 align-middle rounded-sm"
                    />
                  )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {escalated && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/[0.08] border border-green-500/20 text-sm text-green-400"
          >
            <LifeBuoy className="w-4 h-4 shrink-0" />
            This conversation has been escalated. Check the Support page for
            ticket updates.
          </motion.div>
        )}
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between gap-2 px-4 py-2.5 mt-2 rounded-lg bg-red-500/[0.08] border border-red-500/20 overflow-hidden"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
            <button
              onClick={() => {
                setError(null);
                // Retry last user message
                const lastUser = [...messages]
                  .reverse()
                  .find((m) => m.role === "user");
                if (lastUser) {
                  // Remove the failed message pair
                  setMessages((prev) => prev.slice(0, -1));
                  sendMessage(lastUser.content);
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          rows={1}
          disabled={streaming}
          className="flex-1 px-4 py-3 rounded-xl bg-of-surface-container border border-of-outline-variant/25 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40 transition-colors resize-none disabled:opacity-50"
          style={{ minHeight: "44px", maxHeight: "120px" }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || streaming}
          className="p-3 rounded-xl bg-of-primary text-of-on-primary transition-all duration-200 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
