'use client';

/**
 * LlmModelsWidget — surface the cloud-LLM model registry on the Providers
 * dashboard. Data lives in _llm_available_models (populated by the 6h
 * heartbeat CronJob); the React Query hook hits GET /api/llm/models.
 *
 * Compact section: provider tabs across the top showing model counts +
 * last-seen freshness, then a sortable/searchable table of the selected
 * provider's models with context window, max-output tokens, and pricing
 * where the upstream provider discloses it.
 */

import { useMemo, useState } from 'react';
import { Database, RefreshCw, AlertCircle } from 'lucide-react';
import { useLlmModels } from '@/lib/api/hooks/use-llm-models';
import type { LlmModel } from '@/lib/api/schemas/llm-models';

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
  ollama_cloud: 'Ollama Cloud',
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const deltaMs = Date.now() - t;
  const min = Math.round(deltaMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

function formatTokens(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatPrice(pricing: Record<string, unknown>): { input: string; output: string } {
  const inp = pricing['input_per_1m_usd'];
  const out = pricing['output_per_1m_usd'];
  const fmt = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(2)}` : '—';
  return { input: fmt(inp), output: fmt(out) };
}

export function LlmModelsWidget() {
  const { data, isLoading, isError, error, refetch, isFetching } = useLlmModels();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [includeDeprecated, setIncludeDeprecated] = useState(false);

  // Once data lands, default the selected provider to whichever has the most
  // models so the table is not empty on first render.
  const defaultedProvider = useMemo(() => {
    if (selectedProvider) return selectedProvider;
    if (!data?.providers) return null;
    const entries = Object.entries(data.providers);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1].count - a[1].count);
    return entries[0][0];
  }, [selectedProvider, data?.providers]);

  const filteredModels: LlmModel[] = useMemo(() => {
    if (!data?.models || !defaultedProvider) return [];
    const q = search.trim().toLowerCase();
    return data.models
      .filter((m) => m.provider === defaultedProvider)
      .filter((m) => includeDeprecated || !m.deprecated_at)
      .filter((m) => {
        if (!q) return true;
        return (
          m.model_id.toLowerCase().includes(q) ||
          (m.display_name?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [data?.models, defaultedProvider, search, includeDeprecated]);

  if (isError) {
    return (
      <section className="rounded-lg border border-danger/40 bg-danger/5 p-4">
        <div className="flex items-center gap-2 text-danger">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">Failed to load LLM model registry</span>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-semibold text-white">Available LLM Models</h2>
          {data && (
            <span className="text-sm text-text-secondary">
              · {data.models.length} models · refreshed {relativeTime(data.fetched_at)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-sm text-text-secondary hover:bg-accent/10 disabled:opacity-50"
          title="Re-fetch (heartbeat itself runs every 6h)"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {isLoading && !data ? (
        <div className="space-y-2">
          <div className="h-9 animate-pulse rounded bg-accent/10" />
          <div className="h-32 animate-pulse rounded bg-accent/10" />
        </div>
      ) : !data || Object.keys(data.providers).length === 0 ? (
        <p className="text-sm text-text-secondary">
          No models registered yet. The heartbeat CronJob runs every 6h; first run
          populates the table.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(data.providers)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([provider, summary]) => {
                const isActive = provider === defaultedProvider;
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setSelectedProvider(provider)}
                    className={`flex flex-col items-start rounded border px-3 py-1.5 text-left transition ${
                      isActive
                        ? 'border-accent bg-accent/10 text-white'
                        : 'border-border text-text-secondary hover:border-accent/50'
                    }`}
                  >
                    <span className="text-sm font-medium">
                      {PROVIDER_LABEL[provider] ?? provider}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {summary.count} models · {relativeTime(summary.last_seen_at)}
                      {summary.deprecated_count > 0 && (
                        <> · {summary.deprecated_count} deprecated</>
                      )}
                    </span>
                  </button>
                );
              })}
          </div>

          <div className="mb-3 flex items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by model id or name"
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-white placeholder:text-text-secondary"
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={includeDeprecated}
                onChange={(e) => setIncludeDeprecated(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Show deprecated
            </label>
          </div>

          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-accent/5 text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Context</th>
                  <th className="px-3 py-2 font-medium">Max out</th>
                  <th className="px-3 py-2 font-medium">$ / 1M in</th>
                  <th className="px-3 py-2 font-medium">$ / 1M out</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-text-secondary">
                      No models match.
                    </td>
                  </tr>
                ) : (
                  filteredModels.map((m) => {
                    const { input, output } = formatPrice(m.pricing);
                    return (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs text-white">{m.model_id}</div>
                          {m.display_name && m.display_name !== m.model_id && (
                            <div className="text-xs text-text-secondary">{m.display_name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {formatTokens(m.context_window)}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {formatTokens(m.max_output_tokens)}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{input}</td>
                        <td className="px-3 py-2 text-text-secondary">{output}</td>
                        <td className="px-3 py-2">
                          {m.deprecated_at ? (
                            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
                              deprecated
                            </span>
                          ) : (
                            <span className="text-xs text-text-secondary">active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-text-secondary">
            Source: 6-hour heartbeat CronJob (Anthropic, OpenRouter, Gemini, Ollama Cloud
            /models endpoints). Pricing shown when upstream discloses it; some
            community models do not.
          </p>
        </>
      )}
    </section>
  );
}
