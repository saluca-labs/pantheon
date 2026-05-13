/**
 * Coach LLM wrapper — Maker OS.
 *
 * Backed by `@platform/llm` (Wave 0). Streaming deferred — see header
 * comment on `health/coach/anthropic.ts` for the contract notes.
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
    osSlug: input.osSlug ?? 'maker',
    provider: 'anthropic',
    model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
  return { text, model, latencyMs: Date.now() - t0 };
}
