/**
 * Anthropic provider wrapper for the Autobiographer voice builder.
 *
 * Mirrors the per-OS coach pattern (Health / Filmmaker / Cyber / Maker).
 * `ANTHROPIC_API_KEY` is optional in this codebase — when it's absent
 * the builder gracefully degrades to a 503 with `coach_not_configured`
 * so the UI can render an admin-action banner instead of crashing.
 *
 * Test seam: `vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: ... }))`
 * — every per-OS coach test uses the same shape, and the builder tests
 * additionally mock the `ai` module's `generateObject` so the two-stage
 * pipeline can be exercised deterministically without hitting an LLM.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import 'server-only';
import { createAnthropic } from '@ai-sdk/anthropic';

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

export function getVoiceBuilderProvider() {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set; voice builder is not configured.',
    );
  }
  return createAnthropic({ apiKey });
}
