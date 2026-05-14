import { z } from 'zod';

export type AgenticOsSlug =
  | 'autobiographer'
  | 'business'
  | 'creator'
  | 'cyber'
  | 'filmmaker'
  | 'health'
  | 'maker'
  | 'research'
  | 'secure-dev';

export interface LlmCallOptions<S = unknown> {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Built-in providers ('ollama' | 'anthropic' | 'openai' | 'stub') OR
   *  a name registered via `registerLlmProvider`. */
  provider?: string;
  jsonMode?: boolean;
  schema?: z.ZodType<S>;
  cacheKey?: string;
  tenantId: string;
  osSlug: AgenticOsSlug;
}

export interface LlmCallResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  provider: string;
  model: string;
}

/** Adapter contract — every provider implements `call` (sync) and `stream` (async iter).
 *  Adapters must:
 *   - never log raw `system`/`user` content (let LOG-01 redact)
 *   - never throw with secrets in the message
 *   - report token usage (tokens may be estimated for providers that don't return counts)
 */
export interface LlmProvider {
  readonly name: string;
  call(opts: LlmCallOptions): Promise<LlmCallResult>;
  stream(opts: LlmCallOptions): AsyncIterable<string>;
}

export const llmProviderSchema = z.object({
  name: z.string().min(1),
  adapter: z.custom<LlmProvider>((v) => {
    if (!v || typeof v !== 'object') return false;
    const a = v as Record<string, unknown>;
    return typeof a['name'] === 'string' && typeof a['call'] === 'function' && typeof a['stream'] === 'function';
  }, 'adapter must implement LlmProvider'),
});

export type RegisterLlmProviderInput = z.infer<typeof llmProviderSchema>;
