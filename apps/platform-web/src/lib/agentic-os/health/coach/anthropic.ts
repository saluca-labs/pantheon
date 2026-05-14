/**
 * Coach LLM wrapper — Health OS.
 *
 * Backed by `@platform/llm` (Wave 0). Streaming is DEFERRED until
 * `@platform/llm` exposes `streamLlm` to route handlers; this file
 * uses the synchronous `callLlm` path and returns a single text block.
 *
 * Public surface (preserved for callers that still import the legacy
 * shape):
 *   - `DEFAULT_COACH_MODEL`            constant
 *   - `isCoachConfigured()`            true when ANTHROPIC_API_KEY set
 *   - `getCoachModelId()`              honours COACH_MODEL override
 *   - `callCoachLlm({system, user, tenantId, ...})` NEW — single call
 *     returning `{text, model, latencyMs}`
 *
 * The Vercel-AI-SDK helpers (`getAnthropicProvider`, `streamText`
 * plumbing) are gone. Tools are not yet wired through `@platform/llm`
 * — coaches lose function-calling until the provider contract grows
 * a `tools` field. See PR description for the deferral list.
 */

import 'server-only';
import { callLlm, type AgenticOsSlug } from '@platform/llm';

export const DEFAULT_COACH_MODEL = 'claude-sonnet-4-6';

export function isCoachConfigured(): boolean {
  return !!process.env['ANTHROPIC_API_KEY'];
}

export function getCoachModelId(): string {
  return process.env['COACH_MODEL'] || DEFAULT_COACH_MODEL;
}

export interface CoachLlmResult {
  text: string;
  model: string;
  latencyMs: number;
}

export async function callCoachLlm(input: {
  system: string;
  user: string;
  tenantId: string;
  osSlug?: AgenticOsSlug;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<CoachLlmResult> {
  const model = input.model ?? getCoachModelId();
  const t0 = Date.now();
  const text = await callLlm({
    system: input.system,
    user: input.user,
    tenantId: input.tenantId,
    osSlug: input.osSlug ?? 'health',
    provider: 'anthropic',
    model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
  return { text, model, latencyMs: Date.now() - t0 };
}
