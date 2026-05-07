"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWidgetData } from "@/lib/useWidgetData";
import { Copy, ChevronDown, ChevronUp, Trash2, Send } from "lucide-react";

/** Policy playground -- interactive LLM playground routed through the Tiresias audited proxy. */

// --- Types ---
interface Turn {
  turn: number;
  model: string;
  provider: string;
  tokens: number;
  cost: number;
  latency_ms: number;
  prompt: string;
  completion: string;
}
interface ReplayData { turns: Turn[]; }

interface RunResult {
  completion: string;
  tokens: number;
  cost: number;
  latency_ms: number;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  tokens?: number;
  cost?: number;
  latency_ms?: number;
}

const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
];

export default function PlaygroundPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-of-surface-container rounded-xl" />}>
      <PlaygroundInner />
    </Suspense>
  );
}

function PlaygroundInner() {
  const searchParams = useSearchParams();
  const importSessionId = searchParams.get("session");
  const importTurnNum = parseInt(searchParams.get("turn") ?? "0", 10);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [importBannerDismissed, setImportBannerDismissed] = useState(false);

  // Totals
  const totalTokens = messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
  const totalCost = messages.reduce((sum, m) => sum + (m.cost ?? 0), 0);

  // Import session turn when query params present
  const { data: replayData } = useWidgetData<ReplayData>({
    endpoint: importSessionId ? `/api/dash/v1/sessions/${importSessionId}/replay` : "",
    skip: !importSessionId,
  });

  useEffect(() => {
    if (replayData?.turns && importTurnNum > 0) {
      const turn = replayData.turns.find(t => t.turn === importTurnNum) ?? replayData.turns[0];
      if (turn) {
        setInput(turn.prompt);
        setModel(turn.model ?? MODELS[0]);
      }
    }
  }, [replayData, importTurnNum]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, running]);

  // Send message
  async function handleSend() {
    const text = input.trim();
    if (!text || running) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setRunning(true);
    setRunError(null);

    try {
      const { api } = await import("@/lib/api");

      // Build message history for the API (exclude metadata fields)
      const apiMessages = updatedMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const result = await api.post<RunResult>("/api/playground/run", {
        messages: apiMessages,
        system_prompt: systemPrompt || undefined,
        model,
        temperature,
        max_tokens: maxTokens,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.completion,
        tokens: result.tokens,
        cost: result.cost,
        latency_ms: result.latency_ms,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setRunError(message);
    } finally {
      setRunning(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setInput("");
    setRunError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-5xl">

      {/* Session import banner */}
      {importSessionId && !importBannerDismissed && (
        <div className="flex items-center justify-between px-4 py-3 mb-3 bg-of-primary/10 border border-of-primary/20 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-of-primary">Imported</span>
            <span className="text-xs text-of-on-surface">
              Session <code className="font-mono text-of-primary">{importSessionId}</code>
              {importTurnNum > 0 && `, Turn ${importTurnNum}`}
            </span>
            <a href="/dashboard/sessions"
              className="text-xs text-of-on-surface-variant hover:text-of-primary transition-colors underline underline-offset-2">
              Back to Sessions
            </a>
          </div>
          <button onClick={() => setImportBannerDismissed(true)}
            className="text-of-on-surface-variant hover:text-of-on-surface text-lg leading-none ml-4">
            x
          </button>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 mb-3 bg-of-surface-container rounded-xl border border-of-outline-variant/5">
        {/* Model */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Model</label>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="h-7 px-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs text-of-on-surface focus:outline-none focus:border-of-primary/40">
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {/* Temperature */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Temp</label>
          <input type="range" min="0" max="1" step="0.05" value={temperature}
            onChange={e => setTemperature(parseFloat(e.target.value))}
            className="w-20 h-1 accent-of-primary" />
          <span className="text-[10px] text-of-on-surface tabular-nums w-6">{temperature.toFixed(2)}</span>
        </div>
        {/* Max tokens */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Max Tokens</label>
          <input type="number" min="100" max="4096" step="128" value={maxTokens}
            onChange={e => setMaxTokens(parseInt(e.target.value))}
            className="h-7 w-20 px-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs text-of-on-surface focus:outline-none focus:border-of-primary/40 tabular-nums" />
        </div>
        {/* System prompt toggle */}
        <button onClick={() => setShowSystemPrompt(!showSystemPrompt)}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant hover:text-of-primary transition-colors">
          System Prompt
          {showSystemPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {/* Totals */}
        <div className="flex items-center gap-3 ml-auto">
          {totalTokens > 0 && (
            <>
              <span className="text-[10px] text-of-on-surface-variant tabular-nums">{totalTokens} tokens</span>
              <span className="text-[10px] font-bold text-of-on-surface tabular-nums">${totalCost.toFixed(5)}</span>
            </>
          )}
          <button onClick={handleClear} title="Clear conversation"
            className="flex items-center gap-1 text-[10px] text-of-on-surface-variant hover:text-of-error transition-colors">
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>

      {/* System prompt (collapsible) */}
      {showSystemPrompt && (
        <div className="mb-3 bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          <div className="px-4 py-2 border-b border-of-outline-variant/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">System Prompt</span>
          </div>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful assistant..."
            rows={3}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-of-on-surface font-mono focus:outline-none placeholder:text-of-on-surface-variant/40 leading-relaxed"
          />
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto mb-3 bg-of-surface-container rounded-xl border border-of-outline-variant/5">
        <div className="p-4 space-y-4 min-h-full flex flex-col">
          {messages.length === 0 && !running && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-of-on-surface-variant">Send a message to start a conversation</p>
                <p className="text-[10px] text-of-on-surface-variant/60 mt-1">
                  All requests are routed through the Tiresias audited proxy
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-of-primary/15 border border-of-primary/20"
                  : "bg-of-surface-container-high border border-of-outline-variant/10"
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    msg.role === "user" ? "text-of-primary" : "text-of-on-surface-variant"
                  }`}>
                    {msg.role === "user" ? "You" : "Assistant"}
                  </span>
                  {msg.latency_ms != null && (
                    <span className={`text-[10px] tabular-nums ${
                      msg.latency_ms < 1000 ? "text-emerald-400" : msg.latency_ms < 3000 ? "text-warning" : "text-of-error"
                    }`}>
                      {msg.latency_ms}ms
                    </span>
                  )}
                  {msg.tokens != null && (
                    <span className="text-[10px] text-of-on-surface-variant tabular-nums">{msg.tokens} tok</span>
                  )}
                  {msg.cost != null && msg.cost > 0 && (
                    <span className="text-[10px] text-of-on-surface-variant tabular-nums">${msg.cost.toFixed(5)}</span>
                  )}
                </div>
                <pre className="text-sm text-of-on-surface font-mono whitespace-pre-wrap leading-relaxed">{msg.content}</pre>
                {msg.role === "assistant" && (
                  <button onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="mt-2 flex items-center gap-1 text-[10px] text-of-on-surface-variant hover:text-of-on-surface transition-colors">
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                )}
              </div>
            </div>
          ))}

          {running && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl px-4 py-3 bg-of-surface-container-high border border-of-outline-variant/10">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Assistant</span>
                </div>
                <div className="flex gap-1 mt-2">
                  <div className="w-2 h-2 rounded-full bg-of-on-surface-variant/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-of-on-surface-variant/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-of-on-surface-variant/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {runError && (
            <div className="px-3 py-2.5 bg-of-error/10 border border-of-error/20 rounded-lg">
              <p className="text-xs text-of-error">{runError}</p>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
        <div className="flex items-end gap-2 p-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-of-on-surface font-mono focus:outline-none placeholder:text-of-on-surface-variant/40 leading-relaxed max-h-32 min-h-[2rem]"
            style={{ height: "auto", overflow: "hidden" }}
            onInput={e => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 128) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || running}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-of-primary text-of-on-primary hover:bg-of-primary-fixed disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
