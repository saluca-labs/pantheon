/**
 * Voice-builder LLM wrapper — Autobiographer OS Phase 3.
 *
 * Backed by `@platform/llm` (Wave 0). Replaces the prior `@ai-sdk/anthropic`
 * + `ai.generateObject` plumbing; the builder now calls `callLlm` with
 * `jsonMode: true` and a zod `schema`, which routes through the
 * Anthropic provider's HTTP API and parses the result.
 *
 * Public surface preserved for callers and tests:
 *   - `DEFAULT_VOICE_BUILDER_MODEL`         constant
 *   - `isVoiceBuilderConfigured()`          true when ANTHROPIC_API_KEY set
 *   - `getVoiceBuilderModelId()`            honours VOICE_BUILDER_MODEL or
 *                                           COACH_MODEL override
 *   - `callVoiceBuilderJson({...})` NEW — single JSON-mode call
 */

import 'server-only';
import { callLlm, type AgenticOsSlug } from '@platform/llm';
import type { z } from 'zod';

export const DEFAULT_VOICE_BUILDER_MODEL = 'claude-sonnet-4-6';

export function isVoiceBuilderConfigured(): boolean {
  return !!process.env['ANTHROPIC_API_KEY'];
}

export function getVoiceBuilderModelId(): string {
  return (
    process.env['VOICE_BUILDER_MODEL'] ||
    process.env['COACH_MODEL'] ||
    DEFAULT_VOICE_BUILDER_MODEL
  );
}

export async function callVoiceBuilderJson<S>(input: {
  system: string;
  user: string;
  schema: z.ZodType<S>;
  tenantId: string;
  osSlug?: AgenticOsSlug;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<S> {
  return callLlm<S>({
    system: input.system,
    user: input.user,
    tenantId: input.tenantId,
    osSlug: input.osSlug ?? 'autobiographer',
    provider: 'anthropic',
    model: input.model ?? getVoiceBuilderModelId(),
    temperature: input.temperature ?? 0.2,
    maxTokens: input.maxTokens,
    jsonMode: true,
    schema: input.schema,
  });
}
