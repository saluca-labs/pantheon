/**
 * @platform/llm — LLM abstraction with pluggable provider registry.
 *
 * User override (Wave 0): default provider is local Ollama; the registry is
 * extensible at runtime via `registerLlmProvider`, so additional providers
 * (vLLM, Together, Groq, etc.) can be added without modifying this package.
 *
 * Provider selection priority (highest first):
 *  1. Per-call `opts.provider`
 *  2. Per-tenant per-OS feature flag `agos_feature_flags.<os>.llm_provider`
 *  3. Tenant default (resolved by caller; not implemented in W0)
 *  4. Env `LLM_DEFAULT_PROVIDER` (default: 'ollama')
 *
 * Roadmap: §3.6.1
 */

import { z } from 'zod';
import {
  registerLlmProvider,
  getLlmProvider,
  listLlmProviders,
  _resetRegistryForTests,
} from './registry.js';
import type { LlmCallOptions, LlmProvider, LlmCallResult, AgenticOsSlug } from './types.js';
import { StubLlmProvider } from './providers/stub.js';
import { OllamaLlmProvider } from './providers/ollama.js';
import { AnthropicLlmProvider } from './providers/anthropic.js';
import { OpenAiLlmProvider } from './providers/openai.js';
import { redact } from './redact.js';
import { LlmRateLimiter, llmRateLimitKey } from './rateLimit.js';

// ── Built-in registration ────────────────────────────────────────────────────
// Always register stub + ollama (no key required). Anthropic/OpenAI register
// only if their key is present and ≥32 chars (CFG-01).
registerLlmProvider({ name: 'stub', adapter: new StubLlmProvider() });
registerLlmProvider({ name: 'ollama', adapter: new OllamaLlmProvider() });

(function registerOptional(): void {
  const ak = process.env['ANTHROPIC_API_KEY'];
  if (ak && ak.length >= 32) {
    registerLlmProvider({ name: 'anthropic', adapter: new AnthropicLlmProvider(ak) });
  } else if (ak && ak.length > 0) {
    throw new Error('ANTHROPIC_API_KEY must be at least 32 characters (CFG-01)');
  }
  const ok = process.env['OPENAI_API_KEY'];
  if (ok && ok.length >= 32) {
    registerLlmProvider({ name: 'openai', adapter: new OpenAiLlmProvider(ok) });
  } else if (ok && ok.length > 0) {
    throw new Error('OPENAI_API_KEY must be at least 32 characters (CFG-01)');
  }
})();

const sharedLimiter = new LlmRateLimiter();

// Hook for usage roll-up — populated by callers (BFF route handlers) so
// `agos_llm_usage` rows can be written without `@platform/llm` taking a
// hard dep on `@platform/database`.
export type LlmUsageHook = (event: {
  tenantId: string;
  osSlug: AgenticOsSlug;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  elapsedMs: number;
}) => void | Promise<void>;

let _usageHook: LlmUsageHook | null = null;

export function setLlmUsageHook(hook: LlmUsageHook | null): void {
  _usageHook = hook;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function callLlm<S = string>(opts: LlmCallOptions<S>): Promise<S> {
  const provider = resolveProvider(opts);
  const limiterKey = llmRateLimitKey(opts.tenantId, opts.osSlug);
  if (!sharedLimiter.consume(limiterKey)) {
    throw new LlmRateLimitError(limiterKey);
  }
  const t0 = Date.now();
  let result: LlmCallResult;
  try {
    result = await tryWithFallback(provider, opts);
  } catch (e) {
    emitEvent('llm.error', { os_slug: opts.osSlug, tenant_id: opts.tenantId, provider: provider.name, error_class: (e as Error).name });
    throw e;
  }
  const elapsedMs = Date.now() - t0;
  emitEvent('llm.call', {
    os_slug: opts.osSlug,
    tenant_id: opts.tenantId,
    provider: result.provider,
    model: result.model,
    prompt_chars: opts.system.length + opts.user.length,
    completion_chars: result.text.length,
    prompt_tokens: result.promptTokens,
    completion_tokens: result.completionTokens,
    elapsed_ms: elapsedMs,
  });
  if (_usageHook) {
    try {
      await _usageHook({
        tenantId: opts.tenantId,
        osSlug: opts.osSlug,
        provider: result.provider,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        elapsedMs,
      });
    } catch (e) {
      emitEvent('llm.usage_hook_error', { error: (e as Error).message });
    }
  }
  if (opts.jsonMode) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      throw new Error('llm response was not valid JSON despite jsonMode: true');
    }
    if (opts.schema) {
      return opts.schema.parse(parsed) as S;
    }
    return parsed as S;
  }
  return result.text as S;
}

export async function* streamLlm(opts: LlmCallOptions): AsyncIterable<string> {
  const provider = resolveProvider(opts);
  if (!sharedLimiter.consume(llmRateLimitKey(opts.tenantId, opts.osSlug))) {
    throw new LlmRateLimitError(llmRateLimitKey(opts.tenantId, opts.osSlug));
  }
  for await (const chunk of provider.stream(opts)) {
    yield chunk;
  }
}

// ── Selection + fallback ─────────────────────────────────────────────────────

function resolveProvider(opts: LlmCallOptions): LlmProvider {
  const want = opts.provider ?? process.env['LLM_DEFAULT_PROVIDER'] ?? 'ollama';
  const p = getLlmProvider(want);
  if (!p) {
    throw new Error(`unknown LLM provider '${want}'. Registered: ${listLlmProviders().join(', ')}`);
  }
  return p;
}

async function tryWithFallback(primary: LlmProvider, opts: LlmCallOptions): Promise<LlmCallResult> {
  try {
    return await primary.call(opts);
  } catch (e) {
    const fallbacks = (process.env['LLM_PROVIDERS_FALLBACK_ORDER'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => n !== primary.name);
    for (const name of fallbacks) {
      const p = getLlmProvider(name);
      if (!p) continue;
      try {
        return await p.call(opts);
      } catch {
        // try next fallback
      }
    }
    throw e;
  }
}

// ── Error types ──────────────────────────────────────────────────────────────

export class LlmRateLimitError extends Error {
  constructor(public readonly key: string) {
    super(`llm rate limit exceeded for ${key}`);
    this.name = 'LlmRateLimitError';
  }
}

// ── Logging helper ───────────────────────────────────────────────────────────

function emitEvent(event: string, data: Record<string, unknown>): void {
  const payload = redact({ event, ...data, ts: new Date().toISOString() });
  // Use stdout JSON to mirror pino's output. A future pass swaps in pino.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export {
  registerLlmProvider,
  getLlmProvider,
  listLlmProviders,
  _resetRegistryForTests,
  redact,
  LlmRateLimiter,
  llmRateLimitKey,
};
export type { LlmCallOptions, LlmCallResult, LlmProvider, AgenticOsSlug } from './types.js';
export { z };
