"use client";

import { useState, useRef, useCallback, Fragment } from "react";
import { useWidgetData } from "@/lib/useWidgetData";
import { Search, ChevronDown, ChevronRight } from "lucide-react";

/** Trace explorer -- search and inspect individual request traces. */

interface TraceEntry {
  id: string;
  timestamp: string;
  tenant_id?: string;
  session_id?: string;
  model: string;
  provider: string;
  tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost: number;
  latency_ms: number;
  status: string;
  request_hash?: string;
  response_hash?: string;
  prompt?: string;
  completion?: string;
}

interface TracesData {
  items?: TraceEntry[];
  total?: number;
  page?: number;
  limit?: number;
}

function latencyColor(ms: number): string {
  if (ms < 500) return "text-emerald-400";
  if (ms < 2000) return "text-warning";
  return "text-of-error";
}

function statusBadge(status: string) {
  const cls =
    status === "success"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "error"
      ? "bg-of-error/15 text-of-error"
      : "bg-warning/15 text-warning";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}
    >
      {status}
    </span>
  );
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

  // Debounce search input so we don't fire on every keystroke
  const [searchInput, setSearchInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, search: value }));
      setPage(1);
    }, 400);
  }, []);

  // Reset to page 1 when any filter changes
  const updateFilter = useCallback(
    (key: "provider" | "model" | "status", value: string) => {
      setFilters((f) => ({ ...f, [key]: value }));
      setPage(1);
    },
    [],
  );

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(filters.provider && { provider: filters.provider }),
    ...(filters.model && { model: filters.model }),
    ...(filters.status && { status: filters.status }),
    ...(filters.search && { search: filters.search }),
  }).toString();

  const { data, loading, error } = useWidgetData<TracesData>({
    endpoint: `/api/dash/v1/traces?${queryParams}`,
  });

  const traces: TraceEntry[] = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="max-w-7xl space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 p-4 bg-of-surface-container rounded-xl border border-of-outline-variant/5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-of-on-surface-variant" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search session ID..."
            className="h-8 pl-9 pr-3 bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg focus:outline-none focus:border-of-primary/40 placeholder:text-of-on-surface-variant/50 w-52"
          />
        </div>

        {/* Provider */}
        <select
          value={filters.provider}
          onChange={(e) => updateFilter("provider", e.target.value)}
          className="bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg px-3 h-8 focus:outline-none focus:border-of-primary/40"
        >
          <option value="">All Providers</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="bedrock">Bedrock</option>
          <option value="openrouter">OpenRouter</option>
        </select>

        {/* Model */}
        <select
          value={filters.model}
          onChange={(e) => updateFilter("model", e.target.value)}
          className="bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg px-3 h-8 focus:outline-none focus:border-of-primary/40"
        >
          <option value="">All Models</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="claude-sonnet">claude-sonnet</option>
          <option value="claude-opus">claude-opus</option>
          <option value="sonnet">sonnet</option>
          <option value="llama">llama</option>
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="bg-of-surface-container-high border border-of-outline-variant/20 text-of-on-surface text-sm rounded-lg px-3 h-8 focus:outline-none focus:border-of-primary/40"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="timeout">Timeout</option>
        </select>

        {/* Active filter count */}
        {(filters.provider || filters.model || filters.status || filters.search) && (
          <button
            onClick={() => {
              setFilters({ provider: "", model: "", status: "", search: "" });
              setSearchInput("");
              setPage(1);
            }}
            className="h-8 px-3 text-xs font-bold text-of-primary hover:text-of-primary/80 border border-of-primary/20 rounded-lg transition-colors"
          >
            Clear filters
          </button>
        )}
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

      {/* Trace table */}
      {!loading && !error && (
        <>
          <div className="bg-of-surface-container rounded-xl border border-of-outline-variant/5 overflow-hidden overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-of-outline-variant/10">
                  <th className="w-6 px-2 py-3" />
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant">
                    Tenant
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
                {traces.map((trace) => {
                  const isExpanded = expandedRow === trace.id;
                  return (
                    <Fragment key={trace.id}>
                      <tr
                        className="border-b border-of-outline-variant/5 hover:bg-of-surface-container-high cursor-pointer transition-colors"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : trace.id)
                        }
                      >
                        <td className="px-2 py-3 text-of-on-surface-variant">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-of-on-surface-variant font-mono text-xs whitespace-nowrap">
                          {trace.timestamp
                            ? new Date(trace.timestamp).toLocaleString()
                            : "--"}
                        </td>
                        <td className="px-4 py-3 text-of-on-surface font-mono text-xs whitespace-nowrap">
                          <span
                            className="px-1.5 py-0.5 rounded bg-of-surface-container-high text-of-on-surface-variant border border-of-outline-variant/20 text-[10px] font-bold tracking-wide"
                            title={trace.tenant_id ?? ""}
                          >
                            {trace.tenant_id
                              ? trace.tenant_id.slice(-8)
                              : "\u2014"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-of-on-surface font-mono text-xs truncate max-w-[120px]">
                          {trace.session_id || "\u2014"}
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
                          {statusBadge(trace.status)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-of-surface-container-low">
                          <td colSpan={10} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                                  Trace ID
                                </p>
                                <p className="text-of-on-surface font-mono break-all">
                                  {trace.id}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                                  Token Breakdown
                                </p>
                                <p className="text-of-on-surface tabular-nums">
                                  {(trace.prompt_tokens ?? 0).toLocaleString()}{" "}
                                  prompt /{" "}
                                  {(
                                    trace.completion_tokens ?? 0
                                  ).toLocaleString()}{" "}
                                  completion
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                                  Request Hash
                                </p>
                                <p className="text-of-on-surface font-mono break-all">
                                  {trace.request_hash || "\u2014"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-of-on-surface-variant mb-1">
                                  Response Hash
                                </p>
                                <p className="text-of-on-surface font-mono break-all">
                                  {trace.response_hash || "\u2014"}
                                </p>
                              </div>
                            </div>
                            {trace.prompt && (
                              <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-of-primary mb-1.5">
                                  Prompt
                                </p>
                                <pre className="text-xs text-of-on-surface font-mono bg-of-surface-container rounded-lg p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-48 overflow-y-auto">
                                  {trace.prompt}
                                </pre>
                              </div>
                            )}
                            {trace.completion && (
                              <div className="mt-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
                                  Completion
                                </p>
                                <pre className="text-xs text-of-on-surface font-mono bg-of-surface-container rounded-lg p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-48 overflow-y-auto">
                                  {trace.completion}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {traces.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
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
                    total,
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

