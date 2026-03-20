"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { Search, ExternalLink } from "lucide-react";

interface Session {
  id: string;
  cost: number;
  requests: number;
  tokens: number;
  last_active: string;
}

interface SessionsData {
  sessions: Session[];
}

interface Turn {
  turn: number;
  model: string;
  provider: string;
  tokens: number;
  cost: number;
  latency_ms: number;
  timestamp: string;
  prompt: string;
  completion: string;
}

interface ReplayData {
  turns: Turn[];
  session_id?: string;
  total_cost?: number;
  total_tokens?: number;
  duration_ms?: number;
}

export default function SessionsPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sessionsData, loading: sessionsLoading } =
    useWidgetData<SessionsData>({
      endpoint: "/dash/v1/sessions/top",
    });

  const { data: replayData, loading: replayLoading } =
    useWidgetData<ReplayData>({
      endpoint: selectedSessionId
        ? `/dash/v1/sessions/${selectedSessionId}/replay`
        : "",
      skip: !selectedSessionId,
    });

  const sessions = sessionsData?.sessions ?? [];
  const filtered = sessions.filter((s) =>
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Session list panel */}
      <div className="w-80 shrink-0 flex flex-col bg-of-surface-container rounded-xl overflow-hidden border border-of-outline-variant/5">
        {/* Search header */}
        <div className="p-3 border-b border-of-outline-variant/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-of-on-surface-variant" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              className="w-full h-8 pl-9 pr-3 bg-of-surface-container-high border border-of-outline-variant/20 rounded-lg text-sm text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40"
            />
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {sessionsLoading && (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-of-surface-container-high animate-pulse"
                />
              ))}
            </div>
          )}
          {filtered.map((session) => (
            <button
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              className={`w-full text-left px-4 py-3 border-b border-of-outline-variant/5 hover:bg-of-surface-container-high transition-colors ${
                selectedSessionId === session.id
                  ? "bg-of-primary/10 border-l-2 border-l-of-primary"
                  : ""
              }`}
            >
              <p className="text-xs font-mono text-of-on-surface truncate">
                {session.id}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-of-on-surface-variant">
                  ${session.cost.toFixed(4)}
                </span>
                <span className="text-[10px] text-of-on-surface-variant">
                  {session.requests} turns
                </span>
                <span className="text-[10px] text-of-on-surface-variant ml-auto">
                  {session.last_active}
                </span>
              </div>
            </button>
          ))}
          {!sessionsLoading && filtered.length === 0 && (
            <p className="text-sm text-of-on-surface-variant text-center py-8">
              No sessions found
            </p>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 bg-of-surface-container rounded-xl overflow-y-auto border border-of-outline-variant/5">
        {!selectedSessionId && (
          <div className="flex flex-col items-center justify-center h-full text-of-on-surface-variant">
            <p className="text-sm">Select a session to view replay</p>
          </div>
        )}
        {selectedSessionId && (
          <div className="p-6">
            {/* Session KPI cards */}
            {replayData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  {
                    label: "Total Cost",
                    value: `$${(
                      replayData.total_cost ??
                      replayData.turns?.reduce((s, t) => s + t.cost, 0) ??
                      0
                    ).toFixed(4)}`,
                  },
                  {
                    label: "Turns",
                    value: String(replayData.turns?.length ?? 0),
                  },
                  {
                    label: "Total Tokens",
                    value: (
                      replayData.total_tokens ??
                      replayData.turns?.reduce((s, t) => s + t.tokens, 0) ??
                      0
                    ).toLocaleString(),
                  },
                  {
                    label: "Duration",
                    value: replayData.duration_ms
                      ? `${(replayData.duration_ms / 1000).toFixed(1)}s`
                      : "\u2014",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-of-surface-container-high rounded-xl p-4 border border-of-outline-variant/5"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-of-on-surface-variant font-bold mb-1">
                      {kpi.label}
                    </p>
                    <p className="text-xl font-black text-of-on-surface tabular-nums">
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Turn-by-turn timeline */}
            {replayLoading && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-40 rounded-xl bg-of-surface-container-high animate-pulse"
                  />
                ))}
              </div>
            )}
            {!replayLoading && replayData?.turns && (
              <div className="space-y-4">
                {replayData.turns.map((turn) => (
                  <div
                    key={turn.turn}
                    className="bg-of-surface-container-high rounded-xl border border-of-outline-variant/5 overflow-hidden"
                  >
                    {/* Turn metadata header */}
                    <div className="flex items-center gap-4 px-4 py-3 border-b border-of-outline-variant/10 flex-wrap">
                      <span className="text-[10px] font-black text-of-primary bg-of-primary/10 rounded px-2 py-0.5">
                        Turn {turn.turn}
                      </span>
                      <span className="text-xs text-of-on-surface-variant">
                        {turn.model}
                      </span>
                      <span className="text-xs text-of-on-surface-variant">
                        {turn.provider}
                      </span>
                      <span className="text-xs text-of-on-surface-variant tabular-nums">
                        {turn.tokens} tokens
                      </span>
                      <span className="text-xs text-of-on-surface-variant tabular-nums">
                        ${turn.cost.toFixed(4)}
                      </span>
                      <span
                        className={`text-xs font-bold tabular-nums ml-auto ${
                          turn.latency_ms < 500
                            ? "text-emerald-400"
                            : turn.latency_ms < 2000
                            ? "text-warning"
                            : "text-of-error"
                        }`}
                      >
                        {turn.latency_ms}ms
                      </span>
                      {/* Open in Playground */}
                      <a
                        href={`/dashboard/playground?session=${selectedSessionId}&turn=${turn.turn}`}
                        className="flex items-center gap-1 text-[10px] font-bold text-of-primary hover:text-of-primary-fixed transition-colors ml-2"
                        title="Open in Playground"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Playground
                      </a>
                    </div>
                    {/* Prompt */}
                    <div className="p-4 border-b border-of-outline-variant/5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-of-primary mb-2">
                        Prompt
                      </p>
                      <pre className="text-xs text-of-on-surface font-mono whitespace-pre-wrap leading-relaxed">
                        {turn.prompt}
                      </pre>
                    </div>
                    {/* Completion */}
                    <div className="p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                        Completion
                      </p>
                      <pre className="text-xs text-of-on-surface font-mono whitespace-pre-wrap leading-relaxed">
                        {turn.completion}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!replayLoading && selectedSessionId && !replayData && (
              <p className="text-sm text-of-on-surface-variant text-center py-8">
                No replay data available for this session
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
