import { useQuery } from '@tanstack/react-query';
import { fetchBFF } from '@/lib/api/client';
import {
  llmModelsResponseSchema,
  type LlmModelsResponse,
} from '@/lib/api/schemas/llm-models';

interface UseLlmModelsOptions {
  /** Filter to one or more providers. Empty/undefined = all. */
  providers?: string[];
  /** Include deprecated rows. Default false. */
  includeDeprecated?: boolean;
  /** Filter to models advertising a given capability (vision, tool_use, etc). */
  capability?: string;
  /** Auto-refetch interval in seconds. 0 disables (default). */
  refreshInterval?: number;
}

/**
 * Reads the cloud-LLM model registry (Anthropic, OpenRouter, Gemini, Ollama
 * Cloud) populated by the 6h heartbeat CronJob. Backend route lives at
 * apps/platform-web/src/app/api/llm/models/route.ts.
 */
export function useLlmModels(opts: UseLlmModelsOptions = {}) {
  const {
    providers = [],
    includeDeprecated = false,
    capability,
    refreshInterval = 0,
  } = opts;

  const qs = new URLSearchParams();
  for (const p of providers) qs.append('provider', p);
  if (includeDeprecated) qs.set('includeDeprecated', 'true');
  if (capability) qs.set('capability', capability);
  const query = qs.toString();
  const url = `/api/llm/models${query ? `?${query}` : ''}`;

  return useQuery<LlmModelsResponse>({
    queryKey: ['llm-models', providers.sort().join(','), includeDeprecated, capability ?? ''],
    queryFn: () => fetchBFF(url, llmModelsResponseSchema),
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    // The heartbeat runs every 6h so the data rarely changes; keep things in
    // cache aggressively rather than re-hitting the BFF on every mount.
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
  });
}
