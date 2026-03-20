"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWidgetData } from "@/lib/useWidgetData";
import { Play, Copy, RotateCcw } from "lucide-react";

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
}

const MODELS = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "llama-3.1-70b-instruct"];
const PROVIDERS = ["openai", "anthropic", "bedrock", "openrouter"];

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

  // Form state
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [activeTab, setActiveTab] = useState<"original" | "modified">("original");
  const [originalCompletion, setOriginalCompletion] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [importBannerDismissed, setImportBannerDismissed] = useState(false);

  // Import session turn when query params present
  const { data: replayData } = useWidgetData<ReplayData>({
    endpoint: importSessionId ? `/dash/v1/sessions/${importSessionId}/replay` : "",
    skip: !importSessionId,
  });

  useEffect(() => {
    if (replayData?.turns && importTurnNum > 0) {
      const turn = replayData.turns.find(t => t.turn === importTurnNum) ?? replayData.turns[0];
      if (turn) {
        setPrompt(turn.prompt);
        setOriginalCompletion(turn.completion);
        setModel(turn.model ?? MODELS[0]);
        setProvider(turn.provider ?? PROVIDERS[0]);
      }
    }
  }, [replayData, importTurnNum]);

  // Estimated cost (UI-only calculation: rough estimate at $0.002 per 1K tokens)
  const estimatedTokens = Math.ceil(prompt.length / 4) + maxTokens;
  const estimatedCost = (estimatedTokens / 1000) * 0.002;

  // Run Prompt handler
  async function handleRun() {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setRunError(null);
    try {
      const { api } = await import("@/lib/api");
      const result = await api.post<RunResult>("/dash/v1/playground/run", {
        prompt,
        model,
        provider,
        temperature,
        max_tokens: maxTokens,
      });
      setRunResult(result);
      setActiveTab("modified");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("404") || message.includes("405") || message.includes("not found")) {
        setRunError("Run endpoint not yet available. Check back soon.");
      } else {
        setRunError(`Run failed: ${message}`);
      }
    } finally {
      setRunning(false);
    }
  }

  const displayedCompletion = activeTab === "modified" ? (runResult?.completion ?? "") : originalCompletion;

  return (
    <div className="flex flex-col gap-4 max-w-7xl">

      {/* Session import banner (PLAY-02) */}
      {importSessionId && !importBannerDismissed && (
        <div className="flex items-center justify-between px-4 py-3 bg-of-primary/10 border border-of-primary/20 rounded-xl">
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

      {/* Metadata bar (PLAY-03) */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-of-surface-container rounded-xl border border-of-outline-variant/5">
        {/* Model selector */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Model</label>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="h-7 px-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs text-of-on-surface focus:outline-none focus:border-of-primary/40">
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {/* Provider selector */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value)}
            className="h-7 px-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs text-of-on-surface focus:outline-none focus:border-of-primary/40">
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {/* Temperature */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Temp</label>
          <input type="number" min="0" max="2" step="0.1" value={temperature}
            onChange={e => setTemperature(parseFloat(e.target.value))}
            className="h-7 w-16 px-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs text-of-on-surface focus:outline-none focus:border-of-primary/40 tabular-nums" />
        </div>
        {/* Max tokens */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">Max Tokens</label>
          <input type="number" min="1" max="8192" step="256" value={maxTokens}
            onChange={e => setMaxTokens(parseInt(e.target.value))}
            className="h-7 w-20 px-2 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-xs text-of-on-surface focus:outline-none focus:border-of-primary/40 tabular-nums" />
        </div>
        {/* Estimated cost */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-of-on-surface-variant">Est. cost:</span>
          <span className="text-[10px] font-bold text-of-on-surface tabular-nums">${estimatedCost.toFixed(5)}</span>
          <span className="text-[10px] text-of-on-surface-variant">~{estimatedTokens} tokens</span>
        </div>
      </div>

      {/* Split editor panes (PLAY-01) */}
      <div className="grid grid-cols-2 gap-4 h-[calc(100vh-18rem)]">
        {/* Prompt pane */}
        <div className="flex flex-col bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-of-outline-variant/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-of-primary">Prompt</span>
            <div className="flex gap-2">
              <button onClick={() => setPrompt("")}
                className="flex items-center gap-1 text-[10px] text-of-on-surface-variant hover:text-of-on-surface transition-colors">
                <RotateCcw className="h-3 w-3" />
                Clear
              </button>
              <button onClick={() => navigator.clipboard.writeText(prompt)}
                className="flex items-center gap-1 text-[10px] text-of-on-surface-variant hover:text-of-on-surface transition-colors">
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Enter your prompt here..."
            className="flex-1 resize-none bg-transparent p-4 text-sm text-of-on-surface font-mono focus:outline-none placeholder:text-of-on-surface-variant/40 leading-relaxed"
          />
          <div className="px-4 py-2.5 border-t border-of-outline-variant/10 flex items-center justify-between">
            <span className="text-[10px] text-of-on-surface-variant tabular-nums">{Math.ceil(prompt.length / 4)} est. tokens</span>
            {/* Run Prompt button (PLAY-05) */}
            <button
              onClick={handleRun}
              disabled={!prompt.trim() || running}
              className="flex items-center gap-2 px-4 h-8 rounded-lg text-xs font-bold bg-of-primary text-of-on-primary hover:bg-of-primary-fixed disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Play className="h-3.5 w-3.5" />
              {running ? "Running..." : "Run Prompt"}
            </button>
          </div>
        </div>

        {/* Response pane (PLAY-04 — Original/Modified tabs) */}
        <div className="flex flex-col bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-of-outline-variant/10">
            {/* Tab toggle */}
            <div className="flex rounded-lg overflow-hidden border border-of-outline-variant/20">
              {(["original", "modified"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 h-6 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    activeTab === tab
                      ? "bg-of-primary/20 text-of-primary"
                      : "text-of-on-surface-variant hover:text-of-on-surface"
                  }`}>
                  {tab}
                </button>
              ))}
            </div>
            {runResult && activeTab === "modified" && (
              <div className="flex items-center gap-3 text-[10px] text-of-on-surface-variant">
                <span className="tabular-nums">{runResult.tokens} tokens</span>
                <span className="tabular-nums">${runResult.cost.toFixed(5)}</span>
                <span className={`tabular-nums font-bold ${runResult.latency_ms < 500 ? "text-emerald-400" : runResult.latency_ms < 2000 ? "text-warning" : "text-of-error"}`}>
                  {runResult.latency_ms}ms
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 relative">
            {running && (
              <div className="absolute inset-0 flex items-center justify-center bg-of-surface-container/80 backdrop-blur-sm">
                <div className="text-sm text-of-on-surface-variant animate-pulse">Running prompt...</div>
              </div>
            )}
            {runError && (
              <div className="mb-3 px-3 py-2.5 bg-of-error/10 border border-of-error/20 rounded-lg">
                <p className="text-xs text-of-error">{runError}</p>
              </div>
            )}
            {displayedCompletion ? (
              <pre className="text-sm text-of-on-surface font-mono whitespace-pre-wrap leading-relaxed">{displayedCompletion}</pre>
            ) : (
              <div className="flex items-center justify-center h-full text-of-on-surface-variant">
                <p className="text-sm">
                  {activeTab === "original"
                    ? (importSessionId ? "Loading original completion..." : "Import a session turn or run a prompt")
                    : "Run a prompt to see the modified response"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
