"use client";

import { useState } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { Search } from "lucide-react";

/** Trace explorer -- search and inspect individual request traces. Uses live API via useWidgetData. */

interface TraceEntry {
  id: string;
  timestamp: string;
  session_id?: string;
  model: string;
  provider: string;
  tokens: number;
  cost: number;
  latency_ms: number;
  status: string;
  prompt?: string;
  completion?: string;
}

interface RequestsData {
  items?: TraceEntry[];
  total?: number;
  page?: number;
  counts?: { date: string; count: number }[];
}

function latencyColor(ms: number): string {
  if (ms < 500) return "text-emerald-400";
  if (ms < 2000) return "text-warning";
  return "text-of-error";
}

export default function TracesPage() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    provider: "",
    model: "",
    status: "",
    search: "",
  });

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(filters.provider && { provider: filters.provider }),
    ...(filters.model && { model: filters.model }),
    ...(filters.status && { status: filters.status }),
  }).toString();

  const { data, loading, error } = useWidgetData<RequestsData>({
    endpoint: `/dash/v1/requests?${queryParams}`,
  });

  const traces: TraceEntry[] = data?.items ?? [];
  const total = data?.total ?? traces.length;
  const isCounts = !data?.items && !!data?.counts;

  return (
    <div className="max-w-7xl space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 p-4 bg-of-surface-container rounded-xl border border-of-outline-variant/5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-of-on-surface-variant" />
          <input
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
            placeholder="Search session ID..."
            className="h-8 pl-9 pr-3 bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg focus:outline-none focus:border-of-primary/40 placeholder:text-of-on-surface-variant/50 w-52"
          />
        </div>

        {/* Provider */}
        <select
          value={filters.provider}
          onChange={(e) =>
            setFilters((f) => ({ ...f, provider: e.target.value }))
          }
          className="bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg px-3 h-8 focus:outline-none focus:border-of-primary/40"
        >
          <option value="">All Providers</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="bedrock">Bedrock</option>
        </select>

        {/* Model */}
        <select
          value={filters.model}
          onChange={(e) =>
            setFilters((f) => ({ ...f, model: e.target.value }))
          }
          className="bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg px-3 h-8 focus:outline-none focus:border-of-primary/40"
        >
          <option value="">All Models</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
          <option value="llama-3">llama-3</option>
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
          }
          className="bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg px-3 h-8 focus:outline-none focus:border-of-primary/40"
        >
          <option value="">All Statuses</option>
          <option value="success">success</option>
          <option value="error">error</option>
          <option value="timeout">timeout</option>
        </select>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-of-surface-container rounded-xl animate-pulse h-64 border border-of-outline-variant/5" />
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-of-surface-container rounded-xl p-6 border border-of-outline-variant/5">
          <p className="text-sm text-of-error text-center">
            Failed to load traces: {error}
          </p>
        </div>
      )}

      {/* Fallback: counts table */}
      {!loading && !error && isCounts && (
        <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-of-outline-variant/10 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
              Note:
            </span>
            <span className="text-xs text-of-on-surface-variant">
              Detailed trace endpoint not available — showing daily aggregates
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-of-outline-variant/10">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                  Date
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                  Requests
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.counts ?? []).map((d, i) => (
                <tr
                  key={i}
                  className="border-b border-of-outline-variant/5 hover:bg-of-surface-container-high"
                >
                  <td className="px-4 py-3 text-of-on-surface-variant font-mono text-xs">
                    {d.date}
                  </td>
                  <td className="px-4 py-3 text-right text-of-on-surface tabular-nums text-xs font-bold">
                    {d.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full trace table */}
      {!loading && !error && !isCounts && (
        <>
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-of-outline-variant/10">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Session
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Model
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Provider
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Tokens
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Cost
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Latency
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <>
                    <tr
                      key={trace.id}
                      className="border-b border-of-outline-variant/5 hover:bg-of-surface-container-high cursor-pointer transition-colors"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === trace.id ? null : trace.id
                        )
                      }
                    >
                      <td className="px-4 py-3 text-of-on-surface-variant font-mono text-xs whitespace-nowrap">
                        {trace.timestamp}
                      </td>
                      <td className="px-4 py-3 text-of-on-surface font-mono text-xs truncate max-w-[120px]">
                        {trace.session_id ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-of-on-surface text-xs">
                        {trace.model}
                      </td>
                      <td className="px-4 py-3 text-of-on-surface-variant text-xs">
                        {trace.provider}
                      </td>
                      <td className="px-4 py-3 text-right text-of-on-surface tabular-nums text-xs">
                        {trace.tokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-of-on-surface tabular-nums text-xs">
                        ${trace.cost.toFixed(4)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums text-xs font-bold ${latencyColor(trace.latency_ms)}`}
                      >
                        {trace.latency_ms}ms
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            trace.status === "success"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : trace.status === "error"
                              ? "bg-of-error/15 text-of-error"
                              : "bg-warning/15 text-warning"
                          }`}
                        >
                          {trace.status}
                        </span>
                      </td>
                    </tr>
                    {expandedRow === trace.id && (
                      <tr
                        key={`${trace.id}-expanded`}
                        className="bg-of-surface-container-low"
                      >
                        <td colSpan={8} className="px-4 py-4">
                          <div className="space-y-3">
                            {trace.prompt && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-of-primary mb-1.5">
                                  Prompt
                                </p>
                                <pre className="text-xs text-of-on-surface font-mono bg-of-surface-container rounded-lg p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                                  {trace.prompt}
                                </pre>
                              </div>
                            )}
                            {trace.completion && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
                                  Completion
                                </p>
                                <pre className="text-xs text-of-on-surface font-mono bg-of-surface-container rounded-lg p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                                  {trace.completion}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {traces.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-sm text-of-on-surface-variant"
                    >
                      No traces found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 px-1">
            <p className="text-xs text-of-on-surface-variant">
              {total > 0
                ? `${(page - 1) * 20 + 1}\u2013${Math.min(
                    page * 20,
                    total
                  )} of ${total.toLocaleString()} traces`
                : "No traces found"}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 h-7 rounded-lg text-xs font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 h-7 rounded-lg text-xs font-bold border border-of-outline-variant/20 text-of-on-surface-variant hover:text-of-on-surface hover:border-of-outline-variant/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
