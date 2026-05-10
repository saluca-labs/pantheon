/**
 * Anthropic provider wrapper.
 *
 * `ANTHROPIC_API_KEY` is optional in this codebase — when it's absent the
 * coach gracefully degrades to a 503 with `coach_not_configured` so the
 * UI can render an admin-action banner instead of crashing. See the USDA
 * Phase 5b pattern for precedent.
 */

import 'server-only';
import { createAnthropic } from '@ai-sdk/anthropic';

export const DEFAULT_COACH_MODEL = 'claude-sonnet-4-6';

export function isCoachConfigured(): boolean {
  return !!process.env['ANTHROPIC_API_KEY'];
}

export function getCoachModelId(): string {
  return process.env['COACH_MODEL'] || DEFAULT_COACH_MODEL;
}

export function getAnthropicProvider() {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set; coach is not configured.');
  }
  return createAnthropic({ apiKey });
}
